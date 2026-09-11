import {and,eq,inArray,sql} from 'drizzle-orm';
import {start,getRun} from 'workflow/api';
import {db} from './db';
import {jobs,runs,logs} from './schema';
import {configuration} from './config';
import {researchIdeaWorkflow} from './workflow';
export async function dispatchNextResearchJob(retry=0):Promise<void>{
 const config=configuration();
 const selected=await db().transaction(async tx=>{
  // Transaction-scoped lock serializes the global empty-queue check and claim.
  await tx.execute(sql`select pg_advisory_xact_lock(920260910)`);
  // A cancelled workflow may still have an HTTP call in flight. Retain the heavy slot
  // until that call finishes (or its maximum network deadline has elapsed).
  const draining=await tx.select({id:logs.id}).from(logs).where(and(eq(logs.status,'running'),sql`${logs.startedAt}>now()-interval '150 seconds'`)).limit(1);if(draining.length)return null;
  await tx.update(jobs).set({status:'queued',launchToken:null,startingAt:null,workflowId:null}).where(and(eq(jobs.status,'starting'),sql`${jobs.startingAt}<now()-(${config.budget.startingTimeoutSeconds}*interval '1 second')`));
  const active=await tx.select({id:jobs.id}).from(jobs).where(inArray(jobs.status,['starting','running'])).limit(1);if(active.length)return null;
  const [job]=await tx.select().from(jobs).where(eq(jobs.status,'queued')).orderBy(sql`least(2,${jobs.priority}+floor(extract(epoch from (now()-${jobs.queuedAt}))/(${config.budget.agingMinutes}*60))) desc`,jobs.queuedAt).for('update',{skipLocked:true}).limit(1);
  if(!job)return null;const launchToken=crypto.randomUUID();
  await tx.update(jobs).set({status:'starting',launchToken,startingAt:new Date(),attempts:job.attempts+1,error:null}).where(eq(jobs.id,job.id));return {...job,launchToken};
 });
 if(!selected)return;
 try{
  const workflow=await start(researchIdeaWorkflow,[selected.id,selected.launchToken]);
  // The first step also binds workflowId; either side may win this race safely.
  await db().update(jobs).set({workflowId:workflow.runId}).where(and(eq(jobs.id,selected.id),eq(jobs.launchToken,selected.launchToken),inArray(jobs.status,['starting','running'])));
 }catch{
  const status=selected.attempts>=config.budget.retries?'failed':'queued';
  await db().update(jobs).set({status,error:'Не удалось запустить Workflow',launchToken:null}).where(and(eq(jobs.id,selected.id),eq(jobs.launchToken,selected.launchToken),eq(jobs.status,'starting')));
  if(status==='failed'&&selected.kind==='research')await db().update(runs).set({status:'failed'}).where(eq(runs.id,selected.runId));
  if(retry<config.budget.retries)await dispatchNextResearchJob(retry+1);
 }
}
export async function reconcile(){
 const active=await db().select().from(jobs).where(eq(jobs.status,'running')).limit(1);
 if(active[0]?.workflowId){
  try{const state=await getRun(active[0].workflowId).status;if(['failed','cancelled'].includes(state)){
   await db().update(jobs).set({status:state==='cancelled'?'cancelled':'failed',error:'Workflow завершился до финализации'}).where(and(eq(jobs.id,active[0].id),eq(jobs.status,'running')));
   if(active[0].kind==='research')await db().update(runs).set({status:state==='cancelled'?'cancelled':'failed'}).where(eq(runs.id,active[0].runId));
  }}catch{/* Platform metadata may be temporarily unavailable. Keep the active lease. */}
 }
 await dispatchNextResearchJob();
}
