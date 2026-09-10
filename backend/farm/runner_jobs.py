"""Durable idempotency and process cancellation, independent of Worker lifecycle."""
import hashlib,json,os,sqlite3,subprocess,sys,threading,time
from pathlib import Path
from contextlib import contextmanager
from fastapi import HTTPException

LOCK=threading.Lock()
ACTIVE={}
DB=os.getenv('RUNNER_STATE_PATH','/state/runner.sqlite')


@contextmanager
def database():
    c=sqlite3.connect(DB,timeout=10);c.row_factory=sqlite3.Row
    try:
        with c:
            c.execute('CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,hash TEXT,state TEXT,result TEXT)')
            yield c
    finally:c.close()


def recover():
    with database() as c:c.execute("UPDATE requests SET state='interrupted',result=NULL WHERE state='running'")


def cancel(prefix):
    with LOCK:
        for rid,p in list(ACTIVE.items()):
            if rid.startswith(prefix):
                with database() as c:c.execute("UPDATE requests SET state='cancelled' WHERE id=?",(rid,))
                p.kill()
    return {'ok':True}


def purge(prefix):
    cancel(prefix)
    with LOCK:
        if any(rid.startswith(prefix) for rid in ACTIVE):raise HTTPException(409,'Процесс ещё завершается')
        with database() as c:
            ids=[r['id'] for r in c.execute('SELECT id FROM requests') if r['id'].startswith(prefix)]
            c.executemany('DELETE FROM requests WHERE id=?',[(rid,) for rid in ids])
    return {'ok':True}


def retry_errors(prefix):
    """Retry known failures within policy; keep successes and unknown outcomes intact."""
    with LOCK:
        with database() as c:
            ids=[r['id'] for r in c.execute("SELECT id FROM requests WHERE state='error'") if r['id'].startswith(prefix)]
            c.executemany('DELETE FROM requests WHERE id=?',[(rid,) for rid in ids])
    return {'ok':True,'reset_count':len(ids)}


def submit(body):
    rid=body['request_id']; encoded=json.dumps(body,ensure_ascii=False,sort_keys=True)
    digest=hashlib.sha256(encoded.encode()).hexdigest(); owner=False
    with LOCK:
        with database() as c:
            existing=c.execute('SELECT * FROM requests WHERE id=?',(rid,)).fetchone()
            if existing and existing['hash']!=digest:raise HTTPException(409,'request_id уже использован с другими входами')
            if not existing:
                if ACTIVE:raise HTTPException(429,'Runner занят')
                c.execute('INSERT INTO requests VALUES(?,?,?,NULL)',(rid,digest,'running'))
                child_env={k:v for k,v in os.environ.items() if k in ('PATH','PYTHONPATH','GROQ_API_KEY','ACTIVE_PROVIDER','FREE_MODE_ONLY','RULES_URL','HTTPS_PROXY','NO_PROXY')}
                p=subprocess.Popen([sys.executable,'-m','farm.runner_task'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=child_env)
                ACTIVE[rid]=p;owner=True
    if owner:
        try:
            out,_=p.communicate(encoded.encode(),timeout=160)
            result=json.loads(out) if out else {'error':'Процесс остановлен'}
            state='completed' if p.returncode==0 and 'result' in result else 'error'
        except subprocess.TimeoutExpired:
            p.kill();p.communicate();state='error';result={'error':'Таймаут Runner'}
        except (ValueError,OSError):state='error';result={'error':'Некорректный результат процесса'}
        finally:
            with LOCK:
                with database() as c:
                    c.execute("UPDATE requests SET state=CASE WHEN state='cancelled' THEN state ELSE ? END,result=? WHERE id=?",(state,json.dumps(result),rid))
                ACTIVE.pop(rid,None)
    deadline=time.monotonic()+165
    while time.monotonic()<deadline:
        with database() as c: row=c.execute('SELECT * FROM requests WHERE id=?',(rid,)).fetchone()
        if row['state']=='completed':return {**json.loads(row['result'])['result'],'replayed':not owner}
        if row['state'] in ('cancelled','interrupted','error'):
            failure=json.loads(row['result']) if row['result'] else {}
            headers={'X-Farm-Retryable':'schema'} if row['state']=='error' and failure.get('error_code')=='json_validate_failed' else None
            raise HTTPException(503,'Runner: '+row['state']+'; '+failure.get('error','исход внешнего вызова неизвестен; автоматический повтор запрещён'),headers=headers)
        time.sleep(.1)
    raise HTTPException(503,'Runner: ожидание результата превысило лимит')
