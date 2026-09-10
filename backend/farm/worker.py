import os
import time
import threading
from langgraph.checkpoint.postgres import PostgresSaver
from .db import connection,uid,Jsonb
from .providers import provider,ProviderError
from .workflow import graph,context,StopRun,definitions,refresh_metrics
from . import storage


def heartbeat(run_id,stop):
    while not stop.wait(10):
        try:
            with connection() as conn:
                conn.execute("UPDATE jobs SET lease_until=now()+interval '40 seconds',updated_at=now() WHERE run_id=%s AND status='running'",(run_id,))
        except Exception: pass


def deletion_tick():
    with connection() as conn:
        job=conn.execute("SELECT * FROM deletion_jobs WHERE status IN ('ready','error') ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED").fetchone()
        if not job: return
        try:
            storage.delete_keys(job['object_keys'])
            import httpx
            for prefix in job['runner_prefixes']:
                httpx.post(os.environ['RUNNER_URL']+'/purge',headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']},json={'prefix':prefix},timeout=10).raise_for_status()
            conn.execute("UPDATE deletion_jobs SET status='completed',object_keys='[]',error=NULL WHERE id=%s",(job['id'],))
        except Exception as exc:
            conn.execute("UPDATE deletion_jobs SET status='error',error=%s WHERE id=%s",(type(exc).__name__,job['id']))


def tick():
    # Session advisory lock enforces one heavy run even if a second worker is started.
    with connection() as lock:
        lock.autocommit=True
        if not lock.execute('SELECT pg_try_advisory_lock(714211) AS acquired').fetchone()['acquired']: return
        try:
            from .mvp_builder import tick as mvp_tick
            if mvp_tick():return
            with connection() as conn:
                metric=conn.execute("SELECT * FROM metric_jobs WHERE status='ready' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED").fetchone()
                if metric:
                    try:
                        result=refresh_metrics(str(metric['idea_id']))
                        conn.execute("UPDATE metric_jobs SET status=%s,result=%s,updated_at=now() WHERE id=%s",(result['status'],Jsonb(result),metric['id']))
                    except Exception as exc:
                        conn.execute("UPDATE metric_jobs SET status='error',error=%s,updated_at=now() WHERE id=%s",(type(exc).__name__,metric['id']))
                    return
            with connection() as conn:
                job=conn.execute("SELECT j.* FROM jobs j JOIN research_runs r ON r.id=j.run_id JOIN ideas i ON i.id=r.idea_id WHERE i.stage<>'archived' AND (j.status='ready' OR (j.status='running' AND j.lease_until<now())) ORDER BY j.priority+floor(extract(epoch from (now()-j.created_at))/300) DESC,j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED").fetchone()
                if not job: return
                run_id=str(job['run_id'])
                conn.execute("UPDATE research_runs SET active_seconds=active_seconds+CASE WHEN attempt_started_at IS NOT NULL THEN greatest(0,extract(epoch FROM (least(now(),%s)-attempt_started_at))) ELSE 0 END,attempt_started_at=now() WHERE id=%s",(job['lease_until'],run_id))
                conn.execute("UPDATE jobs SET status='running',lease_until=now()+interval '40 seconds',attempts=attempts+1 WHERE id=%s",(job['id'],))
                conn.execute("UPDATE research_runs SET status='running',started_at=coalesce(started_at,now()) WHERE id=%s",(run_id,))
                conn.execute("UPDATE ideas SET execution_state='running' WHERE id=(SELECT idea_id FROM research_runs WHERE id=%s)",(run_id,))
            stop=threading.Event(); beat=threading.Thread(target=heartbeat,args=(run_id,stop),daemon=True); beat.start()
            status='completed'; error=None
            try:
                run=context(run_id)
                with PostgresSaver.from_conn_string(os.environ['DATABASE_URL']) as checkpointer:
                    checkpointer.setup()
                    workflow=graph(checkpointer,run['config_versions'])
                    options={'configurable':{'thread_id':run_id}}
                    previous=workflow.get_state(options)
                    pending=previous.next or (definitions(run['config_versions'])[0].id,)
                    # Completed provider work must survive a later provider outage.
                    health=(provider(run['config_versions']['ProviderProfile']).health()
                            if any(step in ('transcription','understanding','planning','research','experiments') for step in pending)
                            else {'status':'not_required','message':'Продолжение сохранённого расчёта, оценки или отчёта'})
                    with connection() as conn:
                        conn.execute('INSERT INTO integration_snapshots(id,run_id,content) VALUES(%s,%s,%s)',(uid(),run_id,Jsonb({'provider':health,'step_definitions':[d.model_dump() for d in definitions(run['config_versions'])]})))
                    if health['status'] not in ('available','not_required'):raise StopRun('waiting_for_user',health['message'])
                    workflow.invoke(None if previous.next else {'run_id':run_id},options)
            except StopRun as exc: status,error=exc.status,str(exc)
            except ProviderError as exc: status,error='waiting_for_user',str(exc)
            except Exception as exc: status,error='error',type(exc).__name__+': шаг не завершён; проверьте схему и интеграции'
            finally:
                stop.set(); beat.join(timeout=1)
                with connection() as conn:
                    requested=conn.execute('SELECT requested_action FROM jobs WHERE run_id=%s',(run_id,)).fetchone()
                    if requested and requested['requested_action']=='cancel': status,error='cancelled','Команда пользователя'
                    conn.execute('UPDATE jobs SET status=%s,last_error=%s,requested_action=NULL,lease_until=NULL,updated_at=now() WHERE run_id=%s',(status,error,run_id))
                    conn.execute('UPDATE research_runs SET status=%s,active_seconds=active_seconds+greatest(0,extract(epoch FROM (now()-attempt_started_at))),attempt_started_at=NULL,finished_at=CASE WHEN %s IN (\'completed\',\'cancelled\') THEN now() ELSE NULL END WHERE id=%s',(status,status,run_id))
                    conn.execute("UPDATE ideas SET execution_state=%s,stage=CASE WHEN %s='completed' THEN 'decision' ELSE stage END,updated_at=now() WHERE id=(SELECT idea_id FROM research_runs WHERE id=%s) AND stage<>'archived' AND NOT EXISTS (SELECT 1 FROM research_runs newer JOIN research_runs current ON current.id=%s WHERE newer.idea_id=ideas.id AND newer.created_at>current.created_at)",(status,status,run_id,run_id))
        finally: lock.execute('SELECT pg_advisory_unlock(714211)')


def main():
    while True:
        try: deletion_tick(); tick()
        except Exception as exc: print('Worker:',type(exc).__name__,flush=True)
        time.sleep(2)


if __name__=='__main__': main()
