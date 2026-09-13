import {and,eq,sql,desc} from 'drizzle-orm';
import {z} from 'zod';
import {db} from './db';
import * as S from './schema';
import * as C from './contracts';
import {Configuration,origin,internalHeaders} from './config';
import {ask,paidCall,observed,warning,assertCurrentProvider} from './execution';
import {IntegrationError,RouterAIClient} from './providers';
import {citationSources} from './citations';
import {prompts,boundary} from './prompts';
import {sha} from './auth';
import {storeJson} from './storage';

const stageNames=['analyzeIdea','analyzeAudience','researchMarketAndEvidence','buildHypotheses','proposeVariants','prepareBaseline','runVariants','calculateEffect','buildScenarios','criticalAssessment','buildReport'];
async function context(jobId:string,token:string){
 const [job]=await db().select().from(S.jobs).where(eq(S.jobs.id,jobId));
 if(!job||job.launchToken!==token||!['starting','running'].includes(job.status))throw new IntegrationError('Workflow','Задание остановлено');
 const [run]=await db().select().from(S.runs).where(eq(S.runs.id,job.runId));
 assertCurrentProvider(run.config as Configuration);
 if(run.stale||run.status==='cancelled')throw new IntegrationError('Workflow','Версия устарела');
 const [version]=await db().select().from(S.versions).where(eq(S.versions.id,run.ideaVersionId));
 const completed=await db().select().from(S.steps).where(and(eq(S.steps.runId,run.id),eq(S.steps.status,'completed')));
 return {job,run,idea:version.content,config:run.config as Configuration,data:Object.fromEntries(completed.map(s=>[s.name,s.result]))};
}
async function save(runId:string,name:string,result:Record<string,any>,inputHash:string){
 await db().insert(S.steps).values({id:crypto.randomUUID(),runId,name,result,inputHash,status:'completed'}).onConflictDoNothing();
}
export async function boot(jobId:string,token:string,workflowId:string){
 'use step';
 return db().transaction(async tx=>{
  const [job]=await tx.select().from(S.jobs).where(eq(S.jobs.id,jobId)).for('update');
  if(!job||job.launchToken!==token||!['starting','running'].includes(job.status)||(job.workflowId&&job.workflowId!==workflowId))return null;
  const [run]=await tx.select().from(S.runs).where(eq(S.runs.id,job.runId));
  if(run.stale||run.status==='cancelled'){await tx.update(S.jobs).set({status:'cancelled'}).where(eq(S.jobs.id,jobId));return null;}
  await tx.update(S.jobs).set({status:'running',workflowId}).where(eq(S.jobs.id,jobId));
  if(job.kind!=='mvp')await tx.update(S.runs).set({status:'running',counters:{...run.counters,startedAt:run.counters.startedAt||Date.now()}}).where(eq(S.runs.id,job.runId));
  await tx.update(S.ideas).set({stage:job.kind==='mvp'?'mvp_building':'research'}).where(eq(S.ideas.id,run.ideaId));
  const budget=run.config.budget;
  return {kind:job.kind,webActions:Math.max(0,Math.min(budget.searchCalls,budget.llmCalls-budget.variants*budget.trialCases*budget.trialRepetitions-10))};
 });
}
export async function researchToolStep(jobId:string,token:string,index:number){
 'use step';
 const ctx=await context(jobId,token),name=`webAction:${index}`,rawName=`webRaw:${index}`;
 if(ctx.data[name])return ctx.data[name].continue;
 const previous=ctx.data[`webAction:${index-1}`]?.result;
 const query=index===0?`${ctx.idea.transcript.slice(0,1000)}: рынок, существующие альтернативы и подтверждённые ограничения`:previous?.nextQuery;
 if(!query||((index>=ctx.config.web.targetCalls||(ctx.run.counters.search||0)>=ctx.config.web.targetCalls)&&!previous?.missingEvidence?.trim())){await save(ctx.run.id,name,{continue:false,reason:'Нет обоснованного следующего поискового запроса'},sha(name));return false;}
 const keyTopic=index===0||previous?.keyTopic===true;
 try{
  let raw=ctx.data[rawName];
  if(!raw){
   for(let retry=0;;retry++){
    try{raw=await paidCall(ctx.run.id,ctx.config,keyTopic?'keySearch':'search','source_researcher',{query,keyTopic,missingEvidence:previous?.missingEvidence||'Первичное исследование',index},()=>new RouterAIClient(ctx.config).research(query,keyTopic,prompts.researchAction),retry);break;}
    catch(error){if(retry>=ctx.config.budget.retries||!(error instanceof IntegrationError&&error.retryable))throw error;await new Promise(resolve=>setTimeout(resolve,ctx.config.budget.retryDelayMs*(retry+1)));}
   }
   // Persist before the independent JSON call: repairs reuse these citations.
   await save(ctx.run.id,rawName,raw!,sha(query));
  }
   for(const citation of citationSources(raw as any,query,ctx.config.web.maxCitationChars)){
    await db().insert(S.sources).values({id:crypto.randomUUID(),runId:ctx.run.id,url:citation.url,content:citation}).onConflictDoNothing();
   }
   const rawText=typeof raw?.text==='string'?raw.text.trim():'';
   if(!rawText||rawText.length<30){
    const fallback={summary:'Поисковый запрос не вернул текстовых данных.',claims:[],gaps:[`Нет доступных фрагментов по запросу: ${query}`],continueResearch:false,nextQuery:null,missingEvidence:previous?.missingEvidence||null,keyTopic:false};
    await save(ctx.run.id,name,{continue:false,query,result:fallback},sha(name));return false;
   }
   const sources=await db().select().from(S.sources).where(eq(S.sources.runId,ctx.run.id));
   const roundSources=sources.filter(s=>s.content?.query===query||s.content?.search_topic===query);
   const activeSources=(roundSources.length>0?roundSources:sources.slice(-5)).slice(0,5);
   const result=await ask(ctx.run.id,ctx.config,'source_researcher',prompts.researchRound,{query,index,text:rawText.slice(0,3000),sources:activeSources.map(s=>({id:s.id,url:s.url,snippet:s.content.snippet?.slice(0,500)||null})),previousQueries:Object.entries(ctx.data).filter(([k])=>k.startsWith('webAction:')).map(([,v])=>v.query).slice(-4)},C.researchRound);
   result.claims=result.claims.filter(claim=>{const source=sources.find(s=>s.id===claim.sourceId);return claim.quote.length>0&&source?.content.snippet?.includes(claim.quote);});
   for(const claim of result.claims){const source=sources.find(s=>s.id===claim.sourceId)!;await db().update(S.sources).set({content:{...source.content,supported_claim:claim.claim}}).where(eq(S.sources.id,source.id));}
   const validSources=sources.filter(s=>Boolean(s.content?.snippet&&s.content.snippet.length>30));
   const orgs=new Set(validSources.map(s=>s.content?.organization).filter(Boolean));
   const enoughEvidence=validSources.length>=(ctx.config.evidence?.minimumSources||5)&&orgs.size>=(ctx.config.evidence?.minimumOrganizations||3);
   const keepGoing=!enoughEvidence&&result.continueResearch&&Boolean(result.nextQuery)&&result.nextQuery!==query&&index+1<ctx.config.budget.searchCalls&&index+1<ctx.config.web.targetCalls;
   await save(ctx.run.id,name,{continue:keepGoing,query,result},sha(name));return keepGoing;
  }catch(error){
   const message=error instanceof IntegrationError?error.message:'Исследование источников недоступно';await warning(ctx.run.id,message);
   await save(ctx.run.id,name,{continue:false,query,error:message},sha(name));return false;
  }
}
export async function runStage(jobId:string,token:string,name:string){
 'use step';
 const ctx=await context(jobId,token);if(ctx.data[name])return;
 const {run,config,data}=ctx;
 const inputHash=sha(JSON.stringify({version:run.ideaVersionId,name,config:config.id,inputs:Object.keys(data)}));
 await db().update(S.runs).set({stage:name,progress:Math.round(stageNames.indexOf(name)/stageNames.length*100)}).where(eq(S.runs.id,run.id));
 let result:Record<string,any>={};
 try{
  if(name==='analyzeIdea'){
   result=await ask(run.id,config,'idea_analyst',prompts.analyzeIdea,ctx.idea,C.card);result.transcript=ctx.idea.transcript;
  }else if(name==='analyzeAudience')result=await ask(run.id,config,'audience_researcher',prompts.analyzeAudience,data.analyzeIdea||ctx.idea,C.audience);
  else if(name==='researchMarketAndEvidence'){
   const sources=await db().select().from(S.sources).where(eq(S.sources.runId,run.id));
   result=await ask(run.id,config,'market_researcher',prompts.researchMarketAndEvidence,{idea:data.analyzeIdea||ctx.idea,audience:data.analyzeAudience,sources:sources.slice(0,8).map(s=>({id:s.id,url:s.url,snippet:String(s.content.snippet||'').slice(0,600)}))},C.research);
   for(const claim of result.claims){const source=sources.find(s=>s.id===claim.sourceId);if(!source||!claim.quote||!String(source.content.snippet||'').includes(claim.quote)){claim.provenance='ASSUMED';result.gaps.push('Утверждение не подтверждено точной цитатой из полученного фрагмента источника');}}
  }else if(name==='buildHypotheses')result=await ask(run.id,config,'strategist',prompts.buildHypotheses,{idea:data.analyzeIdea,research:data.researchMarketAndEvidence},C.hypotheses);
  else if(name==='proposeVariants'){
   result=await ask(run.id,config,'strategist',prompts.proposeVariants,{idea:data.analyzeIdea||ctx.idea,hypotheses:data.buildHypotheses,research:data.researchMarketAndEvidence},C.variantPlan);
   await db().transaction(async tx=>{for(const variant of result.variants){variant.id=crypto.randomUUID();await tx.insert(S.variants).values({id:variant.id,runId:run.id,content:{...variant,fields:result.fields,componentVersion:config.rules.version}});}await tx.insert(S.steps).values({id:crypto.randomUUID(),runId:run.id,name,inputHash,result,status:'completed'}).onConflictDoNothing();});return;
  }else if(name==='prepareBaseline'){
   const sources=await db().select().from(S.sources).where(eq(S.sources.runId,run.id));
   result=await ask(run.id,config,'efficiency_analyst',prompts.prepareBaseline,{idea:data.analyzeIdea||ctx.idea,plan:data.proposeVariants,sources:sources.slice(0,6).map(s=>({id:s.id,snippet:String(s.content.snippet||'').slice(0,500)}))},C.datasetPlan);
   result.cases=result.cases.slice(0,config.budget.trialCases);
   const source=sources.find(s=>s.id===result.sourceId);
   if(result.provenance!=='EXTERNAL_FACT'||!source||result.cases.some((c:any)=>!c.sourceQuote||!String(source.content.snippet||'').includes(c.sourceQuote)||!String(source.content.snippet||'').includes(c.input))){result.provenance='SIMULATED';result.sourceId=null;result.warnings.push('Примеры созданы агентом; это демонстрационные данные');}
   for(const row of result.cases){if(Array.isArray(row.expected))row.expected=Object.fromEntries(row.expected.map((entry:any)=>[entry.name,entry.value]));if(result.provenance==='SIMULATED'||row.baselineProvenance!=='EXTERNAL_FACT'){row.baselineSeconds=null;row.baselineProvenance='SIMULATED';}if(row.expected&&data.proposeVariants?.fields){try{row.expected=C.validateFields(row.expected,data.proposeVariants.fields);}catch{row.expected=null;}}}
   result.id=crypto.randomUUID();await db().transaction(async tx=>{await tx.insert(S.datasets).values({id:result.id,runId:run.id,content:result});await tx.insert(S.steps).values({id:crypto.randomUUID(),runId:run.id,name,inputHash,result,status:'completed'}).onConflictDoNothing();});return;
  }else if(name==='calculateEffect'){
   const existing=await db().select().from(S.calculations).where(eq(S.calculations.runId,run.id)).orderBy(desc(S.calculations.version));
   const id=existing[0]?.id||crypto.randomUUID();if(!existing.length)await db().insert(S.calculations).values({id,runId:run.id});
   result=await observed(run.id,'calculation','paired_bootstrap','python',{calculationRunId:id},async()=>{
    const response=await fetch(origin()+'/api/calculate',{method:'POST',headers:internalHeaders(),body:JSON.stringify({calculationRunId:id}),signal:AbortSignal.timeout(60000)});if(!response.ok)throw new IntegrationError('Расчёт',`HTTP ${response.status}`);return response.json();
   });
  }else if(name==='buildScenarios')result={scenarios:data.calculateEffect?.scenarios||{},sensitivity:data.calculateEffect?.sensitivity||[],warnings:data.calculateEffect?.warnings||['Нет расчёта для сценариев']};
  else if(name==='criticalAssessment'){
   const sources=await db().select().from(S.sources).where(eq(S.sources.runId,run.id));
   const cited=new Set((data.researchMarketAndEvidence?.claims||[]).filter((c:any)=>c.provenance==='EXTERNAL_FACT').map((c:any)=>c.sourceId));
   const supported=sources.filter(s=>s.content.snippet&&cited.has(s.id));
   const calculation=data.calculateEffect||{};const enough=calculation.eligible===true&&supported.length>=config.evidence.minimumSources&&new Set(supported.map(s=>s.content.organization).filter(Boolean)).size>=config.evidence.minimumOrganizations&&(data.researchMarketAndEvidence?.alternatives?.length||0)>=config.evidence.minimumAlternatives;
   result=await ask(run.id,config,'critic',prompts.criticalAssessment,{idea:data.analyzeIdea,research:data.researchMarketAndEvidence,hypotheses:data.buildHypotheses,calculation,insufficientEvidence:!enough},C.critique);
   if(result.recommendation==='Развивать'&&(!enough||result.hardBlockers.length)){result.recommendation='Недостаточно данных';result.reasons.push('Программные ворота доказательности не пройдены');}
   result.gates={eligible:enough,calculationEligible:calculation.eligible===true,sourceCount:sources.length,supportedSourceCount:supported.length};
  }else if(name==='buildReport'){
   let editorial;try{editorial=await ask(run.id,config,'report_editor',prompts.buildReport,{idea:data.analyzeIdea,research:data.researchMarketAndEvidence,assessment:data.criticalAssessment},C.analysis);}catch{editorial={summary:data.researchMarketAndEvidence?.summary||'Исследование завершено с ограничениями',gaps:run.warnings};}
   const sources=await db().select().from(S.sources).where(eq(S.sources.runId,run.id));
   const [latest]=await db().select().from(S.runs).where(eq(S.runs.id,run.id));
   result={id:crypto.randomUUID(),summary:editorial.summary,idea:data.analyzeIdea||ctx.idea,audience:data.analyzeAudience,research:data.researchMarketAndEvidence,hypotheses:data.buildHypotheses,plan:data.proposeVariants,baseline:data.prepareBaseline,calculation:data.calculateEffect,scenarios:data.buildScenarios,assessment:data.criticalAssessment?.recommendation?data.criticalAssessment:{recommendation:'Недостаточно данных',reasons:['Критическая оценка недоступна'],nextExperiment:'Повторить исследование после восстановления интеграций'},sources:sources.map(s=>({id:s.id,url:s.url,...s.content,text:undefined})),warnings:latest.warnings,spending:latest.counters.researchSpend,versions:{ideaVersionId:run.ideaVersionId,researchRunId:run.id,datasetVersionId:data.prepareBaseline?.id,solutionVersions:data.proposeVariants?.variants?.map((v:any)=>v.id),configuration:config,workflowVersion:3}};
   await db().transaction(async tx=>{await tx.insert(S.reports).values({id:result.id,runId:run.id,content:result});await tx.insert(S.steps).values({id:crypto.randomUUID(),runId:run.id,name,inputHash,result,status:'completed'}).onConflictDoNothing();});return;
  }
 }catch(error){const message=error instanceof IntegrationError?error.message:error instanceof z.ZodError?'Ответ агента не прошёл схему':'Этап недоступен';await warning(run.id,name+': '+message);result={unavailable:true,warnings:[message]};}
 await save(run.id,name,result,inputHash);
}
export async function persistArtifacts(jobId:string,token:string){
 'use step';
 const ctx=await context(jobId,token);const [idea]=await db().select().from(S.ideas).where(eq(S.ideas.id,ctx.run.ideaId));
 const report=ctx.data.buildReport,dataset=ctx.data.prepareBaseline;
 try{
  if(dataset?.id)await storeJson(idea.ownerId,idea.id,dataset.id,'dataset',dataset);
  if(report?.id)await storeJson(idea.ownerId,idea.id,report.id,'report',report);
 }catch{await warning(ctx.run.id,'Копирование артефактов в Private Blob не завершено; результаты сохранены в Neon');}
}
export async function prepareTrials(jobId:string,token:string){
 'use step';
 const {data,config,run}=await context(jobId,token);await db().update(S.runs).set({stage:'runVariants',progress:55}).where(eq(S.runs.id,run.id));
 if(!data.proposeVariants?.executable||!data.prepareBaseline?.cases)return [];
 const tasks:{variantId:string;taskId:string;repetition:number}[]=[];
 for(const variant of data.proposeVariants.variants)for(const task of data.prepareBaseline.cases)for(let repetition=0;repetition<config.budget.trialRepetitions;repetition++)tasks.push({variantId:variant.id,taskId:task.taskId,repetition});return tasks;
}
export async function runTrial(jobId:string,token:string,task:{variantId:string;taskId:string;repetition:number}){
 'use step';
 const ctx=await context(jobId,token),{run,config,data}=ctx;
 const [prior]=await db().select().from(S.trials).where(and(eq(S.trials.runId,run.id),eq(S.trials.variantId,task.variantId),eq(S.trials.taskId,task.taskId),eq(S.trials.repetition,task.repetition)));if(prior)return;
 const variant=data.proposeVariants.variants.find((v:any)=>v.id===task.variantId),row=data.prepareBaseline.cases.find((c:any)=>c.taskId===task.taskId),fields=data.proposeVariants.fields;
 const started=Date.now();let output:unknown=null,success=false,error:string|null=null,validationMs=0,retries=0;
 for(let attempt=0;attempt<=config.budget.retries;attempt++){
  retries=attempt;
  try{
   const response=await paidCall(run.id,config,'llm','experiment',{input:row.input,variantId:variant.id},()=>new RouterAIClient(config).chat(boundary+'\nВыполни обработку входного текста по описанию задачи: '+variant.prompt,{text:row.input},C.fieldsSchema(fields)),attempt);output=response.output;
   if(variant.useRules){const t=Date.now();const checked=await observed(run.id,'rules','validate','rules',{output,fields},async()=>{
    const response=await fetch(origin()+'/api/microservices/rules/run',{method:'POST',headers:internalHeaders(),body:JSON.stringify({output,fields}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new IntegrationError('Rules',`HTTP ${response.status}`);return response.json();
   });validationMs+=Date.now()-t;success=checked.valid;if(!success)throw new IntegrationError('Rules','Структура ответа отклонена',true);output=checked.normalizedOutput;
   }else{C.validateFields(output,fields);success=true;}break;
  }catch(exc){error=exc instanceof IntegrationError?exc.message:'Результат прогона не прошёл проверку';if(!(exc instanceof z.ZodError||(exc instanceof IntegrationError&&exc.retryable)))break;if(attempt<config.budget.retries)await new Promise(resolve=>setTimeout(resolve,config.budget.retryDelayMs*(attempt+1)));}
 }
 const exact=success&&row.expected!==null?Object.entries(row.expected).every(([key,value])=>(output as any)?.[key]===value):null;
 const content={input:row.input,output,success,error:success?null:error,durationMs:Date.now()-started,validationMs,retries,quality:exact===null?null:Number(exact),qualityProvenance:row.expected?'SIMULATED':null,provenance:data.prepareBaseline.provenance,manualReviewSeconds:null,correctionSeconds:null,baselineSeconds:row.baselineSeconds,baselineProvenance:row.baselineProvenance,componentVersion:config.rules.version};
 await db().insert(S.trials).values({id:crypto.randomUUID(),runId:run.id,variantId:variant.id,datasetId:data.prepareBaseline.id,taskId:row.taskId,repetition:task.repetition,content}).onConflictDoNothing();
}
export async function buildMvpStep(jobId:string,token:string){
 'use step';
 const ctx=await context(jobId,token);const [mvp]=await db().select().from(S.mvps).where(eq(S.mvps.id,ctx.job.targetId!));if(mvp.status==='ready')return;
 const [decision]=await db().select().from(S.decisions).where(eq(S.decisions.id,mvp.decisionId));
 const spec=await ask(ctx.run.id,ctx.config,'mvp_generator',prompts.buildMvp,{idea:ctx.data.analyzeIdea||ctx.idea,plan:ctx.data.proposeVariants,acceptance:decision.content.acceptance},C.mvpSpec,'mvp');
 await db().update(S.mvps).set({status:'ready',spec}).where(eq(S.mvps.id,mvp.id));
}
export async function finish(jobId:string,token:string,status:string){
 'use step';
 await db().transaction(async tx=>{
  const [job]=await tx.select().from(S.jobs).where(eq(S.jobs.id,jobId)).for('update');if(!job||job.launchToken!==token)return;
  if(job.status==='cancelled')status='cancelled';
  await tx.update(S.jobs).set({status,error:status==='failed'?'Workflow не смог завершить исследование':null}).where(eq(S.jobs.id,jobId));
  const [run]=await tx.select().from(S.runs).where(eq(S.runs.id,job.runId));
  if(job.kind!=='mvp')await tx.update(S.runs).set({status,finishedAt:new Date(),...(status==='completed'?{progress:100}:{})}).where(eq(S.runs.id,job.runId));
  if(!run.stale)await tx.update(S.ideas).set({stage:status==='completed'?(job.kind==='mvp'?'mvp_ready':'decision'):'research',updatedAt:new Date()}).where(and(eq(S.ideas.id,run.ideaId),sql`${S.ideas.stage}<>'archived'`));
  if(job.kind==='mvp'&&status!=='completed')await tx.update(S.mvps).set({status}).where(eq(S.mvps.id,job.targetId!));
 });
}
export async function dispatchFollowing(){'use step';const {dispatchNextResearchJob}=await import('./dispatcher');await dispatchNextResearchJob();}
