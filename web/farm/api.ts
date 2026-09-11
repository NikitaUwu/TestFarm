import {after,NextRequest,NextResponse} from 'next/server';
import {and,desc,eq,inArray,sql} from 'drizzle-orm';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {db} from './db';
import * as S from './schema';
import {actor,ApiError,authRoute,mutation,rate} from './auth';
import {configuration,origin,internalHeaders} from './config';
import {del,get} from '@vercel/blob';
import {dispatchNextResearchJob,reconcile as reconcileDispatcher} from './dispatcher';
import {rulesInput,validateRules} from './rules';
import {IntegrationError,TsarRouterClient} from './providers';
import {storeAudio,readAudio} from './storage';
import {randomBytes} from 'node:crypto';
import {mvpSpec,validateFields,fieldsSchema} from './contracts';
import {boundary} from './prompts';
import {observed} from './execution';

const idSchema=z.uuid();
const active=['queued','starting','running'];
const inputSchema=z.object({title:z.string().trim().min(1).max(180),transcript:z.string().trim().min(1).max(20000),priority:z.number().int().min(0).max(2).default(1)}).strict();
function internal(request:NextRequest){const actual=Buffer.from(request.headers.get('X-Farm-Service')||''),expected=Buffer.from(process.env.INTERNAL_API_TOKEN||'');return expected.length>0&&actual.length===expected.length&&timingSafeEqual(actual,expected);}
async function ownIdea(ownerId:string,id:string){idSchema.parse(id);const [idea]=await db().select().from(S.ideas).where(and(eq(S.ideas.id,id),eq(S.ideas.ownerId,ownerId)));if(!idea)throw new ApiError(404,'Идея не найдена');return idea;}
async function ownRun(ownerId:string,id:string){idSchema.parse(id);const [run]=await db().select().from(S.runs).where(eq(S.runs.id,id));if(!run)throw new ApiError(404,'Исследование не найдено');await ownIdea(ownerId,run.ideaId);return run;}
const kick=()=>after(async()=>{await dispatchNextResearchJob();});

export async function farmApi(request:NextRequest,path:string[]){
 try{
  if(path[0]==='auth')return await authRoute(request,path[1]);
  if(path[0]==='microservices'&&path[1]==='rules'){
   if(path[2]==='health'&&request.method==='GET')return NextResponse.json({status:'ok'});
   if(path[2]==='metadata'&&request.method==='GET')return NextResponse.json({componentId:'rules-validation',version:'3.0.0',inputSchema:z.toJSONSchema(rulesInput),authenticationType:'internal-token'});
   if(path[2]==='run'&&request.method==='POST'){if(!internal(request))throw new ApiError(403,'Доступ запрещён');return NextResponse.json(validateRules(rulesInput.parse(await request.json())));}
  }
  if(path[0]==='public'&&request.method==='GET'){
   const token=z.string().regex(/^[a-f0-9]{64}$/).parse(path[1]);const [report]=await db().select({content:S.reports.content}).from(S.reports).where(eq(S.reports.publicToken,token));if(!report)throw new ApiError(404,'Отчёт не найден');return NextResponse.json(report.content,{headers:{'Cache-Control':'no-store'}});
  }
  const user=await actor(request);
  if(path[0]==='files'&&path[1]&&request.method==='GET'){
   idSchema.parse(path[1]);const [file]=await db().select().from(S.artifacts).where(and(eq(S.artifacts.id,path[1]),eq(S.artifacts.ownerId,user.id)));if(!file)throw new ApiError(404,'Файл не найден');
   const blob=await get(file.pathname,{access:'private'});if(!blob||blob.statusCode!==200)throw new ApiError(404,'Файл недоступен');return new NextResponse(blob.stream,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store','Content-Disposition':'attachment','X-Content-Type-Options':'nosniff'}});
  }
  if(!['GET','HEAD'].includes(request.method)){mutation(request);await rate('write:'+user.id,100);}
  if(path[0]==='audio'&&request.method==='POST'){
   await rate('audio:'+user.id,5,3600);
   if(Number(request.headers.get('content-length')||0)>configuration().budget.audioBytes+65536)throw new ApiError(413,'Аудиофайл слишком большой');
   const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new ApiError(400,'Добавьте аудиофайл');
   const artifactId=await storeAudio(user.id,file);
   try{const speech=await new TsarRouterClient(configuration()).transcribe(await readAudio(artifactId,user.id),file.name);return NextResponse.json({artifactId,...speech});}
   catch(error){return NextResponse.json({artifactId,text:'',warning:error instanceof IntegrationError?error.message:'Расшифровка недоступна. Можно продолжить текстом.'});}
  }
  if(path[0]==='reports'&&path[1]){
   idSchema.parse(path[1]);const [report]=await db().select().from(S.reports).where(eq(S.reports.id,path[1]));if(!report)throw new ApiError(404,'Отчёт не найден');
   const run=await ownRun(user.id,report.runId);
   if(path.length===2&&request.method==='GET')return NextResponse.json(report.content);
   if(path[2]==='share'&&request.method==='POST'){
    const token=report.publicToken||randomBytes(32).toString('hex');await db().update(S.reports).set({publicToken:token}).where(eq(S.reports.id,report.id));return NextResponse.json({path:'/report/'+token});
   }
   if(path[2]==='share'&&request.method==='DELETE'){await db().update(S.reports).set({publicToken:null}).where(eq(S.reports.id,report.id));return NextResponse.json({ok:true});}
   if(path[2]==='decision'&&request.method==='POST'){
    const input=z.object({action:z.enum(['develop','revise','stop']),acceptance:z.array(z.string().trim().min(3).max(500)).max(10).default([]),comment:z.string().max(2000).default('')}).strict().parse(await request.json());
    if(run.stale)throw new ApiError(409,'Отчёт относится к предыдущей версии идеи');
    if(input.action==='develop'&&(report.content.assessment?.recommendation!=='Развивать'||!input.acceptance.length))throw new ApiError(409,'Для MVP нужна рекомендация «Развивать» и критерии приёмки');
    const result=await db().transaction(async tx=>{
     await tx.select().from(S.runs).where(eq(S.runs.id,run.id)).for('update');
     const [existing]=await tx.select().from(S.decisions).where(eq(S.decisions.reportId,report.id));
     if(existing){const [mvp]=await tx.select().from(S.mvps).where(eq(S.mvps.decisionId,existing.id));return {decision:existing,mvp};}
     const [decision]=await tx.insert(S.decisions).values({id:crypto.randomUUID(),reportId:report.id,content:input}).returning();
     if(input.action!=='develop')return {decision,mvp:null};
     const [mvp]=await tx.insert(S.mvps).values({id:crypto.randomUUID(),ideaId:run.ideaId,runId:run.id,decisionId:decision.id}).returning();
     const [idea]=await tx.select().from(S.ideas).where(eq(S.ideas.id,run.ideaId));
     await tx.insert(S.jobs).values({id:crypto.randomUUID(),runId:run.id,kind:'mvp',targetId:mvp.id,priority:idea.priority});return {decision,mvp};
    });kick();return NextResponse.json(result);
   }
  }
  if(path[0]==='mvp'&&path[1]){
   idSchema.parse(path[1]);const [mvp]=await db().select().from(S.mvps).where(eq(S.mvps.id,path[1]));if(!mvp)throw new ApiError(404,'MVP не найден');await ownIdea(user.id,mvp.ideaId);
   if(path.length===2&&request.method==='GET')return NextResponse.json(mvp);
   if(path[2]==='run'&&request.method==='POST'){
    if(mvp.status!=='ready')throw new ApiError(409,'MVP ещё не готов');await rate('mvp:'+user.id,10,3600);
    const spec=mvpSpec.parse(mvp.spec),input=validateFields(await request.json(),spec.inputFields),key=z.string().min(8).max(100).parse(request.headers.get('Idempotency-Key'));
    const [claim]=await db().insert(S.mvpResults).values({id:crypto.randomUUID(),mvpId:mvp.id,requestKey:key,status:'running',content:{input}}).onConflictDoNothing().returning();
    if(!claim){const [prior]=await db().select().from(S.mvpResults).where(and(eq(S.mvpResults.mvpId,mvp.id),eq(S.mvpResults.requestKey,key)));return NextResponse.json(prior,{status:prior.status==='running'?202:200});}
    try{
     const response=await observed(mvp.runId,'mvp','llm_call','tsarrouter',{mvpId:mvp.id,input},()=>new TsarRouterClient(configuration()).chat(boundary+'\n'+spec.prompt,input,fieldsSchema(spec.outputFields)));
     const output=validateFields(response.output,spec.outputFields);
     if(spec.useRules){const checked=await observed(mvp.runId,'mvp','validate','rules',{output,fields:spec.outputFields},async()=>{const response=await fetch(origin()+'/api/microservices/rules/run',{method:'POST',headers:internalHeaders(),body:JSON.stringify({output,fields:spec.outputFields}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new ApiError(503,'Rules недоступен');return response.json();});if(!checked.valid)throw new ApiError(422,'MVP не прошёл проверку результата');}
     const [completed]=await db().update(S.mvpResults).set({status:'completed',content:{input,output,usage:response.usage}}).where(eq(S.mvpResults.id,claim.id)).returning();return NextResponse.json(completed);
    }catch(error){await db().update(S.mvpResults).set({status:'failed',content:{input,error:'Выполнение не завершено'}}).where(eq(S.mvpResults.id,claim.id));throw error;}finally{kick();}
   }
  }
  if(path[0]==='ideas'&&path.length===1){
   if(request.method==='GET')return NextResponse.json(await db().select().from(S.ideas).where(eq(S.ideas.ownerId,user.id)).orderBy(desc(S.ideas.updatedAt)));
   if(request.method==='POST'){
    const input=inputSchema.parse(await request.json());const key=z.string().min(8).max(100).parse(request.headers.get('Idempotency-Key'));
    const idea=await db().transaction(async tx=>{
     await tx.execute(sql`select id from farm_accounts where id=${user.id} for update`);
     const [prior]=await tx.select().from(S.intakeKeys).where(and(eq(S.intakeKeys.ownerId,user.id),eq(S.intakeKeys.key,key)));
     if(prior){const [found]=await tx.select().from(S.ideas).where(eq(S.ideas.id,prior.ideaId));return found;}
     const [{count}]=await tx.select({count:sql<number>`count(*)::int`}).from(S.ideas).where(and(eq(S.ideas.ownerId,user.id),sql`${S.ideas.stage}<>'archived'`));
     if(count>=configuration().budget.activeIdeas)throw new ApiError(409,'Достигнут лимит активных идей. Архивируйте одну из существующих.');
     const id=crypto.randomUUID();const [created]=await tx.insert(S.ideas).values({id,ownerId:user.id,title:input.title,priority:input.priority,content:input}).returning();
     await tx.insert(S.versions).values({id:crypto.randomUUID(),ideaId:id,version:1,content:input});
     await tx.insert(S.intakeKeys).values({ownerId:user.id,key,ideaId:id});return created;
    });return NextResponse.json(idea,{status:201});
   }
  }
  if(path[0]==='ideas'&&path[1]){
   const idea=await ownIdea(user.id,path[1]);
   if(path[2]==='audio'&&request.method==='POST'){
    const {artifactId}=z.object({artifactId:z.uuid()}).parse(await request.json());
    const [file]=await db().update(S.artifacts).set({ideaId:idea.id}).where(and(eq(S.artifacts.id,artifactId),eq(S.artifacts.ownerId,user.id),sql`(${S.artifacts.ideaId} is null or ${S.artifacts.ideaId}=${idea.id})`)).returning({id:S.artifacts.id});
    if(!file)throw new ApiError(404,'Аудио не найдено');return NextResponse.json({ok:true});
   }
   if(path.length===2&&request.method==='DELETE'){
    const [running]=await db().select({id:S.jobs.id}).from(S.jobs).innerJoin(S.runs,eq(S.runs.id,S.jobs.runId)).where(and(eq(S.runs.ideaId,idea.id),inArray(S.jobs.status,active))).limit(1);
    if(running)throw new ApiError(409,'Сначала остановите исследование');
    const files=await db().select().from(S.artifacts).where(eq(S.artifacts.ideaId,idea.id));
    for(const file of files)await del(file.pathname);
    await db().transaction(async tx=>{await tx.delete(S.mvps).where(eq(S.mvps.ideaId,idea.id));await tx.delete(S.ideas).where(eq(S.ideas.id,idea.id));});return NextResponse.json({ok:true});
   }
   if(path.length===2&&request.method==='GET'){
    const runs=await db().select().from(S.runs).where(eq(S.runs.ideaId,idea.id)).orderBy(desc(S.runs.createdAt));
    return NextResponse.json({...idea,runs});
   }
   if(path[2]==='history'&&request.method==='GET'){
    const [archive]=await db().select().from(S.legacyArchives).where(eq(S.legacyArchives.ideaId,idea.id));
    return NextResponse.json(archive?.content||{tables:{}});
   }
   if(path.length===2&&request.method==='PATCH'){
    const input=inputSchema.parse(await request.json());
    await db().transaction(async tx=>{
     const [current]=await tx.select().from(S.ideas).where(eq(S.ideas.id,idea.id)).for('update');
     if(input.transcript!==current.content.transcript||input.title!==current.title){
      await tx.insert(S.versions).values({id:crypto.randomUUID(),ideaId:idea.id,version:current.version+1,content:input});
      await tx.update(S.runs).set({stale:1,status:sql`case when ${S.runs.status} in ('queued','starting','running','paused') then 'cancelled' else ${S.runs.status} end`}).where(eq(S.runs.ideaId,idea.id));
      await tx.update(S.jobs).set({status:'cancelled'}).where(and(inArray(S.jobs.runId,tx.select({id:S.runs.id}).from(S.runs).where(eq(S.runs.ideaId,idea.id))),inArray(S.jobs.status,active)));
      await tx.update(S.ideas).set({version:current.version+1,content:input,title:input.title,priority:input.priority,stage:'draft',updatedAt:new Date()}).where(eq(S.ideas.id,idea.id));
     }else{
      await tx.update(S.ideas).set({priority:input.priority,updatedAt:new Date()}).where(eq(S.ideas.id,idea.id));
      await tx.update(S.jobs).set({priority:input.priority}).where(and(inArray(S.jobs.runId,tx.select({id:S.runs.id}).from(S.runs).where(eq(S.runs.ideaId,idea.id))),eq(S.jobs.status,'queued')));
     }
    });kick();return NextResponse.json({ok:true});
   }
   if(path[2]==='archive'&&request.method==='POST'){
    await db().transaction(async tx=>{await tx.update(S.jobs).set({status:'cancelled'}).where(and(inArray(S.jobs.runId,tx.select({id:S.runs.id}).from(S.runs).where(eq(S.runs.ideaId,idea.id))),inArray(S.jobs.status,active)));await tx.update(S.runs).set({status:'cancelled'}).where(and(eq(S.runs.ideaId,idea.id),inArray(S.runs.status,active)));await tx.update(S.ideas).set({stage:'archived',updatedAt:new Date()}).where(eq(S.ideas.id,idea.id));});kick();return NextResponse.json({ok:true});
   }
   if(path[2]==='start'&&request.method==='POST'){
    if(idea.stage==='archived')throw new ApiError(409,'Архивная идея недоступна для запуска');
    const key=z.string().min(8).max(100).parse(request.headers.get('Idempotency-Key'));
    const run=await db().transaction(async tx=>{
     const [current]=await tx.select().from(S.ideas).where(eq(S.ideas.id,idea.id)).for('update');
     const [prior]=await tx.select().from(S.runs).where(and(eq(S.runs.ideaId,idea.id),eq(S.runs.requestKey,key)));if(prior)return prior;
     const [busy]=await tx.select().from(S.runs).where(and(eq(S.runs.ideaId,idea.id),inArray(S.runs.status,active),eq(S.runs.stale,0)));if(busy)return busy;
     const [version]=await tx.select().from(S.versions).where(and(eq(S.versions.ideaId,idea.id),eq(S.versions.version,current.version)));
     const [created]=await tx.insert(S.runs).values({id:crypto.randomUUID(),ideaId:idea.id,ideaVersionId:version.id,requestKey:key,config:configuration()}).returning();
     await tx.insert(S.jobs).values({id:crypto.randomUUID(),runId:created.id,priority:current.priority});
     await tx.update(S.ideas).set({stage:'queued',updatedAt:new Date()}).where(eq(S.ideas.id,idea.id));return created;
    });kick();return NextResponse.json(run,{status:202});
   }
  }
  if(path[0]==='research'&&path[1]){
   const run=await ownRun(user.id,path[1]);
   if(path[2]==='execution'&&path[3]&&request.method==='GET'){
    idSchema.parse(path[3]);const [entry]=await db().select({log:S.logs,data:S.actionData.content}).from(S.logs).leftJoin(S.actionData,eq(S.actionData.id,S.logs.id)).where(and(eq(S.logs.runId,run.id),eq(S.logs.id,path[3])));if(!entry)throw new ApiError(404,'Действие не найдено');return NextResponse.json(entry);
   }
   if(['pause','resume','retry'].includes(path[2])&&request.method==='POST'){
    await db().transaction(async tx=>{
     const [current]=await tx.select().from(S.runs).where(eq(S.runs.id,run.id)).for('update');
     if(current.stale)throw new ApiError(409,'Запустите актуальную версию идеи');
     if(path[2]==='pause'){
      if(!active.includes(current.status))return;
      await tx.update(S.jobs).set({status:'paused',launchToken:null}).where(and(eq(S.jobs.runId,run.id),inArray(S.jobs.status,active)));
      await tx.update(S.runs).set({status:'paused',counters:{...current.counters,pausedAt:Date.now()}}).where(eq(S.runs.id,run.id));return;
     }
     if(!['paused','failed'].includes(current.status))return;
     // Successful step results remain in Neon and are skipped by the resumed workflow.
     const failed=await tx.select().from(S.steps).where(eq(S.steps.runId,run.id));
     for(const step of failed)if(step.result.unavailable)await tx.delete(S.steps).where(eq(S.steps.id,step.id));
     await tx.update(S.jobs).set({status:'queued',launchToken:null,workflowId:null,startingAt:null,error:null}).where(and(eq(S.jobs.runId,run.id),eq(S.jobs.kind,'research')));
     const counters={...current.counters};if(counters.pausedAt&&counters.startedAt)counters.startedAt+=Date.now()-counters.pausedAt;delete counters.pausedAt;
     await tx.update(S.runs).set({status:'queued',finishedAt:null,counters}).where(eq(S.runs.id,run.id));
    });kick();return NextResponse.json({ok:true});
   }
   if(path[2]==='status'&&request.method==='GET'){
    after(async()=>{await reconcileDispatcher();});
    const logs=await db().select().from(S.logs).where(eq(S.logs.runId,run.id)).orderBy(desc(S.logs.startedAt)).limit(80);
    const reports=await db().select({id:S.reports.id,content:S.reports.content}).from(S.reports).where(eq(S.reports.runId,run.id)).orderBy(desc(S.reports.version));
    const steps=await db().select({name:S.steps.name,result:S.steps.result}).from(S.steps).where(eq(S.steps.runId,run.id));
    return NextResponse.json({...run,logs,reports,steps},{headers:{'Cache-Control':'no-store'}});
   }
   if(path[2]==='cancel'&&request.method==='POST'){
    await db().transaction(async tx=>{await tx.update(S.jobs).set({status:'cancelled'}).where(and(eq(S.jobs.runId,run.id),inArray(S.jobs.status,active)));await tx.update(S.runs).set({status:'cancelled',finishedAt:new Date()}).where(and(eq(S.runs.id,run.id),inArray(S.runs.status,active)));});kick();return NextResponse.json({ok:true});
   }
  }
  throw new ApiError(404,'Не найдено');
 }catch(error){
  const status=error instanceof ApiError?error.status:error instanceof z.ZodError?400:503;
  const message=error instanceof ApiError?error.message:error instanceof z.ZodError?'Проверьте заполненные поля':error instanceof IntegrationError?error.message:'Сервис временно недоступен. Повторите позже.';
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 }
}
