import {eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from './db';
import {runs,logs,actionData} from './schema';
import {Configuration} from './config';
import {RouterAIClient,schemaFor,IntegrationError,costRub,Usage} from './providers';
import {boundary} from './prompts';
export async function warning(runId:string,message:string){await db().update(runs).set({warnings:sql`case when ${runs.warnings} @> ${JSON.stringify([message])}::jsonb then ${runs.warnings} else ${runs.warnings} || ${JSON.stringify([message])}::jsonb end`}).where(eq(runs.id,runId));}
type CallKind='llm'|'critic'|'search'|'keySearch'|'mvp';
function reservation(kind:CallKind,c:Configuration){return kind==='critic'?c.budget.reserveCriticRub:kind==='search'?c.budget.reserveSearchNormalRub:kind==='keySearch'?c.budget.reserveSearchKeyRub:c.budget.reserveLlmRub;}
export function assertCurrentProvider(config:Configuration){if(config.version!==3||config.provider.id!=='routerai')throw new IntegrationError('Workflow','Запуск использует прежнюю конфигурацию. Начните новое исследование.');}
async function reserve(runId:string,kind:CallKind,config:Configuration){
 assertCurrentProvider(config);
 const amount=reservation(kind,config),group=kind==='mvp'?'mvpSpend':'researchSpend',isSearch=kind==='search'||kind==='keySearch';
 await db().transaction(async tx=>{
  const [run]=await tx.select().from(runs).where(eq(runs.id,runId)).for('update');
  if(!run||run.stale||['cancelled','failed','paused'].includes(run.status))throw new IntegrationError('Workflow','Запуск остановлен');
  const counters={...run.counters},ledger={actualRub:0,reservedRub:0,unpricedCalls:0,...counters[group]};
  if(kind!=='mvp'&&counters.startedAt&&Date.now()-counters.startedAt>config.budget.researchMinutes*60000)throw new IntegrationError('Лимит','Время исследования исчерпано');
  const counter=kind==='mvp'?'mvp':'llm',limit=kind==='mvp'?40:config.budget.llmCalls;
  if((counters[counter]||0)>=limit||(isSearch&&(counters.search||0)>=config.budget.searchCalls))throw new IntegrationError('Лимит','Исчерпан лимит вызовов');
  const cap=kind==='mvp'?config.budget.maxMvpRub:config.budget.maxRunRub;
  if(ledger.actualRub+ledger.reservedRub+amount>cap)throw new IntegrationError('Лимит',`Достигнут предел расходов ${cap} ₽ с учётом резервов. Новые платные вызовы остановлены.`);
  counters[counter]=(counters[counter]||0)+1;if(isSearch)counters.search=(counters.search||0)+1;
  counters[group]={...ledger,reservedRub:ledger.reservedRub+amount,limitRub:cap};
  await tx.update(runs).set({counters}).where(eq(runs.id,runId));
 });
 return {amount,group};
}
async function settle(runId:string,ticket:{amount:number;group:string},usage:Usage){
 const actual=costRub(usage);
 await db().transaction(async tx=>{
  const [run]=await tx.select().from(runs).where(eq(runs.id,runId)).for('update');if(!run)return;
  const ledger=run.counters[ticket.group];
  await tx.update(runs).set({counters:{...run.counters,[ticket.group]:{...ledger,actualRub:ledger.actualRub+(actual??0),reservedRub:actual===null?ledger.reservedRub:Math.max(0,ledger.reservedRub-ticket.amount),unpricedCalls:ledger.unpricedCalls+(actual===null?1:0)}}}).where(eq(runs.id,runId));
 });
 if(actual===null)await warning(runId,'RouterAI не сообщил стоимость одного или нескольких вызовов. Их резерв сохранён; это не бесплатные вызовы.');
}
export async function observed<T>(runId:string|null,actor:string,action:string,provider:string,input:unknown,fn:()=>Promise<T>,retry=0):Promise<T>{
 const id=crypto.randomUUID(),start=Date.now();
 await db().insert(logs).values({id,runId,actorType:provider==='system'?'system':action==='llm_call'?'agent':'tool',actorName:actor,action,provider,status:'running',retryNumber:retry,inputRef:`execution:${id}:input`});
 await db().insert(actionData).values({id,content:{input}});
 try{
  const output=await fn(),value=output as any;
  await db().update(actionData).set({content:{input,output}}).where(eq(actionData.id,id));
  await db().update(logs).set({status:'completed',finishedAt:new Date(),durationMs:Date.now()-start,usage:{...value?.usage,costRub:costRub(value?.usage||{}),generationId:value?.generationId},model:value?.model,outputRef:`execution:${id}:output`}).where(eq(logs.id,id));return output;
 }catch(error){
  const message=error instanceof IntegrationError?error.message:error instanceof z.ZodError?'Результат не прошёл схему':error instanceof Error&&error.message?error.message:'Действие завершилось ошибкой';
  await db().update(logs).set({status:'error',finishedAt:new Date(),durationMs:Date.now()-start,error:message,...(error instanceof IntegrationError?{model:error.model,usage:{...error.usage,costRub:costRub(error.usage)}}:{})}).where(eq(logs.id,id));throw error;
 }
}
export async function paidCall<T extends {usage:Usage}>(runId:string,config:Configuration,kind:CallKind,actor:string,input:unknown,fn:()=>Promise<T>,retry=0):Promise<T>{
 const ticket=await reserve(runId,kind,config);let usage:Usage={};
 try{return await observed(runId,actor,kind==='search'||kind==='keySearch'?'web_search':'llm_call','routerai',input,async()=>{
  try{const output=await fn();usage=output.usage;return output;}catch(error){if(error instanceof IntegrationError)usage=error.usage;throw error;}
 },retry);}finally{await settle(runId,ticket,usage);}
}
export async function ask<T extends z.ZodType>(runId:string,config:Configuration,role:string,instruction:string,input:unknown,schema:T,budget:'llm'|'mvp'='llm'):Promise<z.infer<T>>{
 let repair='';
 for(let retry=0;;retry++){
  try{return await paidCall(runId,config,budget==='mvp'?'mvp':role==='critic'?'critic':'llm',role,input,async()=>{
   const response=await new RouterAIClient(config).chat(boundary+'\n'+instruction+repair,input,schemaFor(schema),role);
   const parsed=schema.safeParse(response.output);
   if(!parsed.success){repair='\nИсправь поля JSON: '+parsed.error.issues.slice(0,8).map(i=>`${i.path.join('.')}: ${i.message}`).join('; ');throw new IntegrationError('RouterAI','Ответ не прошёл схему',true,response.usage,response.model);}
   return {...response,output:parsed.data};
  },retry).then(r=>r.output);}catch(error){
   if(retry>=config.budget.retries||!(error instanceof IntegrationError&&error.retryable))throw error;
   if(error instanceof IntegrationError&&(error.code.includes('лимит')||error.code.includes('пуст')||error.code.includes('обрезан')||error.code.includes('рассуждения'))){
    repair='\nКРИТИЧНО: Отвечай максимально кратко, без длинных рассуждений, сразу верни компактный валидный JSON.';
   }
   await new Promise(resolve=>setTimeout(resolve,config.budget.retryDelayMs*(retry+1)));
  }
 }
}
