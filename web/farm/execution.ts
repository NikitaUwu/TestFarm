import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from './db';
import {runs,logs,actionData} from './schema';
import {Configuration} from './config';
import {TsarRouterClient,schemaFor,IntegrationError} from './providers';
import {boundary} from './prompts';
export async function warning(runId:string,message:string){await db().update(runs).set({warnings:sql`case when ${runs.warnings} @> ${JSON.stringify([message])}::jsonb then ${runs.warnings} else ${runs.warnings} || ${JSON.stringify([message])}::jsonb end`}).where(eq(runs.id,runId));}
export async function consume(runId:string,kind:'llm'|'search'|'read'|'mvp',config:Configuration){
 const limit={llm:config.budget.llmCalls,search:config.budget.searchCalls,read:config.budget.pageReads,mvp:4}[kind];
 return db().transaction(async tx=>{
  const [run]=await tx.select().from(runs).where(eq(runs.id,runId)).for('update');
  if(!run||run.stale||['cancelled','failed','paused'].includes(run.status))throw new IntegrationError('Workflow','Запуск остановлен');
  if(kind!=='mvp'&&run.counters.startedAt&&Date.now()-run.counters.startedAt>config.budget.researchMinutes*60000)throw new IntegrationError('Лимит','Время исследования исчерпано');
  if((run.counters[kind]||0)>=limit)throw new IntegrationError('Лимит',`Исчерпан бюджет ${kind}`);
  await tx.update(runs).set({counters:{...run.counters,[kind]:(run.counters[kind]||0)+1}}).where(eq(runs.id,runId));
 });
}
export async function observed<T>(runId:string,actor:string,action:string,provider:string,input:unknown,fn:()=>Promise<T>,retry=0):Promise<T>{
 const id=crypto.randomUUID(),start=Date.now();
 await db().insert(logs).values({id,runId,actorType:provider==='system'?'system':action==='llm_call'?'agent':'tool',actorName:actor,action,provider,status:'running',retryNumber:retry,inputRef:`execution:${id}:input`});
 await db().insert(actionData).values({id,content:{input}});
 try{
  const output=await fn();const value=output as any;
  await db().update(actionData).set({content:{input,output}}).where(eq(actionData.id,id));
  await db().update(logs).set({status:'completed',finishedAt:new Date(),durationMs:Date.now()-start,usage:value?.usage||{},model:value?.model,outputRef:`execution:${id}:output`}).where(eq(logs.id,id));return output;
 }catch(error){
  const message=error instanceof IntegrationError?error.message:error instanceof z.ZodError?'Результат не прошёл схему':'Действие завершилось ошибкой';
  await db().update(logs).set({status:'error',finishedAt:new Date(),durationMs:Date.now()-start,error:message}).where(eq(logs.id,id));throw error;
 }
}
export async function ask<T extends z.ZodType>(runId:string,config:Configuration,role:string,instruction:string,input:unknown,schema:T,budget:'llm'|'mvp'='llm'):Promise<z.infer<T>>{
 for(let retry=0;;retry++){
  await consume(runId,budget,config);
  try{return await observed(runId,role,'llm_call','tsarrouter',input,async()=>{
   const response=await new TsarRouterClient(config).chat(boundary+'\n'+instruction,input,schemaFor(schema));
   const value=schema.parse(response.output);return {...response,output:value};
  },retry).then(r=>r.output);}catch(error){
   if(retry>=config.budget.retries||!(error instanceof z.ZodError||(error instanceof IntegrationError&&error.retryable)))throw error;
  }
 }
}
