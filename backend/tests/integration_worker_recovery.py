"""Forced crash after a persisted checkpoint, exclusively in a restored test DB.

Uses copies of real historical research/observations. No new AI calls or business
claims. Does not simulate interruption inside a provider's in-flight request.
"""
import os,sys,json,signal
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from langgraph.checkpoint.postgres import PostgresSaver
from farm.db import connection,uid,Jsonb
from farm.workflow import graph

os.environ['DATABASE_URL']=make_conninfo(os.environ['DATABASE_URL'],dbname=os.environ['TEST_RESTORE_DB'])
assert conninfo_to_dict(os.environ['DATABASE_URL'])['dbname'].startswith('farm_restore_'), 'Requires restored test database'
run_id='c1cab129-ca54-4862-8383-f52d31573b53'
phase=sys.argv[1]
options={'configurable':{'thread_id':run_id}}
if phase=='prepare':
    with connection() as c:
        run=c.execute('SELECT * FROM research_runs WHERE id=%s',(run_id,)).fetchone()
        assert run and run['status']=='completed'
        observations=c.execute('SELECT count(*) n FROM task_observations').fetchone()['n']
        c.execute("UPDATE jobs SET status='cancelled' WHERE run_id<>%s",(run_id,))
        c.execute("UPDATE metric_jobs SET status='cancelled' WHERE status='ready'")
        c.execute("UPDATE mvp_jobs SET status='cancelled' WHERE status IN ('ready','running')")
        c.execute("UPDATE jobs SET status='running',requested_action=NULL,lease_until=now()-interval '1 second' WHERE run_id=%s",(run_id,))
        c.execute("UPDATE research_runs SET status='running',attempt_started_at=now()-interval '2 seconds' WHERE id=%s",(run_id,))
        c.execute('INSERT INTO audit_events(id,idea_id,action,content) VALUES(%s,%s,%s,%s)',
                  (uid(),run['idea_id'],'test.worker_recovery',Jsonb({'calls':run['call_count'],'observations':observations})))
    with PostgresSaver.from_conn_string(os.environ['DATABASE_URL']) as saver:
        saver.setup();workflow=graph(saver)
        workflow.update_state(options,{'run_id':run_id},as_node='experiments')
        assert workflow.get_state(options).next==('calculation',)
    print(json.dumps({'checkpoint_next':'calculation','forced_crash':True}),flush=True)
    os.kill(os.getpid(),signal.SIGKILL)
else:
    from farm.worker import tick
    tick()
    with connection() as c:
        run=c.execute('SELECT status,call_count FROM research_runs WHERE id=%s',(run_id,)).fetchone()
        job=c.execute('SELECT status,last_error FROM jobs WHERE run_id=%s',(run_id,)).fetchone()
        before=c.execute("SELECT content FROM audit_events WHERE action='test.worker_recovery' ORDER BY created_at DESC LIMIT 1").fetchone()['content']
        count=c.execute('SELECT count(*) n FROM task_observations').fetchone()['n']
        assert run['status']==job['status']=='completed',job
        assert run['call_count']==before['calls'] and count==before['observations']
    with PostgresSaver.from_conn_string(os.environ['DATABASE_URL']) as saver:
        assert not graph(saver).get_state(options).next
    print(json.dumps({'restored_from':'calculation','completed':True,'new_ai_calls':0,'observations_unchanged':True}))
