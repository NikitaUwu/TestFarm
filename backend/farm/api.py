import hashlib
import json
import os
import secrets
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File, Form
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field
from psycopg import OperationalError

from . import auth, storage
from .accounts import Login, Registration
from .config import load_configuration, snapshot
from .db import connection, uid, Jsonb, audit
from .providers import provider, ProviderError
from .schemas import IdeaCreate, IdeaContent, IdeaUpdate, DatasetInput, StartRun, ObservationInput

app = FastAPI(title='Продуктовая ферма', version='0.1.0')


@app.exception_handler(OperationalError)
async def unavailable_database(request, exc):
    return JSONResponse(status_code=503, content={'detail': 'PostgreSQL недоступен'})


@app.exception_handler(ProviderError)
async def unavailable_provider(request, exc):
    return JSONResponse(status_code=503, content={'detail': str(exc), 'status': exc.status})


def owned(conn, idea_id, principal, lock=False):
    row = conn.execute('SELECT * FROM ideas WHERE id=%s AND owner_id=%s' + (' FOR UPDATE' if lock else ''), (idea_id, principal['id'])).fetchone()
    if not row: raise HTTPException(404, 'Идея не найдена')
    return row


def active_slot(conn, principal):
    conn.execute('SELECT id FROM principals WHERE id=%s FOR UPDATE', (principal['id'],))
    count = conn.execute("SELECT count(*) AS n FROM ideas WHERE owner_id=%s AND stage<>'archived'", (principal['id'],)).fetchone()['n']
    if count >= load_configuration()['BudgetPolicy']['active_ideas']:
        raise HTTPException(409, 'Достигнут лимит активных идей. Архивируйте существующую идею.')


@app.get('/health')
def health():
    with connection() as conn: conn.execute('SELECT 1')
    return {'status': 'available', 'version': '0.1.0'}


@app.post('/auth/login')
def login(body: Login, request: Request, response: Response):
    return auth.login(request, response, body.identifier, body.password)


@app.post('/auth/register', status_code=201)
def register(body: Registration, request: Request, response: Response):
    return auth.register(request, response, body)


@app.get('/auth/me')
def me(principal=Depends(auth.actor)):
    return auth.public_account(principal)


@app.post('/auth/logout')
def logout(request: Request, response: Response, principal=Depends(auth.mutation)):
    token = request.cookies.get('farm_session', '')
    with connection() as conn: conn.execute('DELETE FROM sessions WHERE token_hash=%s', (hashlib.sha256(token.encode()).hexdigest(),))
    response.delete_cookie('farm_session', path='/')
    return {'ok': True}


@app.get('/ideas')
def list_ideas(principal=Depends(auth.actor)):
    with connection() as conn:
        return conn.execute('SELECT i.*,v.content FROM ideas i JOIN idea_versions v ON v.idea_id=i.id AND v.version=i.current_version WHERE i.owner_id=%s ORDER BY i.priority DESC,i.created_at', (principal['id'],)).fetchall()


@app.post('/ideas', status_code=201)
def create_idea(body: IdeaCreate, principal=Depends(auth.mutation)):
    idea_id = uid()
    content = body.model_dump(exclude={'priority'})
    with connection() as conn:
        active_slot(conn, principal)
        conn.execute('INSERT INTO ideas(id,owner_id,title,priority) VALUES(%s,%s,%s,%s)', (idea_id, principal['id'], body.title, body.priority))
        conn.execute('INSERT INTO idea_versions(id,idea_id,version,content) VALUES(%s,%s,1,%s)', (uid(),idea_id,Jsonb(content)))
        conn.execute('INSERT INTO idea_changes(id,idea_id,to_version,changed_fields) VALUES(%s,%s,1,%s)', (uid(),idea_id,Jsonb(list(content))))
        audit(conn, principal['id'], 'idea.create', idea_id)
    return {'id': idea_id, 'current_version': 1}


@app.get('/ideas/{idea_id}')
def get_idea(idea_id: UUID, principal=Depends(auth.actor)):
    with connection() as conn:
        idea = owned(conn, idea_id, principal)
        idea['versions'] = conn.execute('SELECT * FROM idea_versions WHERE idea_id=%s ORDER BY version DESC', (idea_id,)).fetchall()
        idea['content'] = idea['versions'][0]['content']
        idea['datasets'] = conn.execute('SELECT d.id,d.name,v.id AS version_id,v.version,v.content FROM datasets d JOIN dataset_versions v ON v.dataset_id=d.id WHERE d.idea_id=%s ORDER BY v.created_at DESC', (idea_id,)).fetchall()
        idea['runs'] = conn.execute('SELECT r.*,j.requested_action,j.last_error FROM research_runs r LEFT JOIN jobs j ON j.run_id=r.id WHERE r.idea_id=%s ORDER BY r.created_at DESC', (idea_id,)).fetchall()
        idea['reports'] = conn.execute('SELECT p.id,p.version,p.created_at,p.public_token,p.content,r.stale FROM reports p JOIN research_runs r ON r.id=p.run_id WHERE r.idea_id=%s ORDER BY p.created_at DESC', (idea_id,)).fetchall()
        idea['observations'] = conn.execute('SELECT * FROM business_observations WHERE idea_id=%s ORDER BY created_at DESC', (idea_id,)).fetchall()
        idea['metric_jobs'] = conn.execute('SELECT * FROM metric_jobs WHERE idea_id=%s ORDER BY created_at DESC', (idea_id,)).fetchall()
        idea['mvp_versions'] = conn.execute('SELECT v.*,b.status FROM mvp_versions v JOIN mvp_builds b ON b.id=v.build_id WHERE b.idea_id=%s ORDER BY v.created_at DESC', (idea_id,)).fetchall()
        idea['artifacts'] = conn.execute('SELECT id,kind,mime,size,created_at FROM artifacts WHERE idea_id=%s ORDER BY created_at DESC', (idea_id,)).fetchall()
        idea['agent_results'] = conn.execute('SELECT * FROM agent_results WHERE idea_id=%s ORDER BY created_at DESC',(idea_id,)).fetchall()
        idea['mvp_jobs'] = conn.execute('SELECT j.* FROM mvp_jobs j JOIN mvp_builds b ON b.id=j.build_id WHERE b.idea_id=%s ORDER BY j.created_at DESC',(idea_id,)).fetchall()
        idea['process_sessions'] = conn.execute('SELECT * FROM process_sessions WHERE idea_id=%s ORDER BY started_at DESC',(idea_id,)).fetchall()
        return idea


@app.put('/ideas/{idea_id}')
def update_idea(idea_id: UUID, body: IdeaUpdate, principal=Depends(auth.mutation)):
    content = body.model_dump(exclude={'expected_version'})
    with connection() as conn:
        idea = owned(conn, idea_id, principal, True)
        if idea['current_version'] != body.expected_version: raise HTTPException(409, 'Карточка уже изменена. Обновите страницу.')
        previous = conn.execute('SELECT content FROM idea_versions WHERE idea_id=%s AND version=%s', (idea_id,idea['current_version'])).fetchone()['content']
        changed = [key for key in content if previous.get(key) != content[key]]
        if not changed: return {'id': idea_id, 'current_version': idea['current_version']}
        version = idea['current_version']+1
        conn.execute('INSERT INTO idea_versions(id,idea_id,version,content) VALUES(%s,%s,%s,%s)', (uid(),idea_id,version,Jsonb(content)))
        conn.execute('UPDATE ideas SET title=%s,current_version=%s,updated_at=now() WHERE id=%s', (body.title,version,idea_id))
        conn.execute('UPDATE research_runs SET stale=true WHERE idea_id=%s', (idea_id,))
        conn.execute('INSERT INTO idea_changes(id,idea_id,from_version,to_version,changed_fields) VALUES(%s,%s,%s,%s,%s)', (uid(),idea_id,idea['current_version'],version,Jsonb(changed)))
        audit(conn, principal['id'], 'idea.version', idea_id, version=version, changed_fields=changed)
        return {'id': idea_id, 'current_version': version}


class IdeaAction(BaseModel):
    action: str
    priority: int | None = Field(default=None, ge=0, le=2)


@app.post('/ideas/{idea_id}/actions')
def idea_action(idea_id: UUID, body: IdeaAction, principal=Depends(auth.mutation)):
    with connection() as conn:
        # Consistent principal -> idea lock order avoids create/reactivate deadlocks.
        conn.execute('SELECT id FROM principals WHERE id=%s FOR UPDATE', (principal['id'],))
        idea = owned(conn,idea_id,principal,True)
        if body.action == 'archive':
            conn.execute("UPDATE ideas SET stage='archived',execution_state='cancelled',updated_at=now() WHERE id=%s", (idea_id,))
            conn.execute("UPDATE jobs SET requested_action='cancel' WHERE run_id IN (SELECT id FROM research_runs WHERE idea_id=%s) AND status NOT IN ('completed','cancelled')", (idea_id,))
        elif body.action == 'activate':
            if idea['stage'] == 'archived':
                active_slot(conn,principal)
                conn.execute("UPDATE ideas SET stage='draft',execution_state='ready',updated_at=now() WHERE id=%s", (idea_id,))
        elif body.action == 'priority' and body.priority is not None:
            conn.execute('UPDATE ideas SET priority=%s,updated_at=now() WHERE id=%s', (body.priority,idea_id))
            conn.execute('UPDATE jobs SET priority=%s WHERE run_id IN (SELECT id FROM research_runs WHERE idea_id=%s)', (body.priority,idea_id))
        else: raise HTTPException(400,'Неизвестное действие')
        audit(conn,principal['id'],'idea.'+body.action,idea_id)
    return {'ok':True}


@app.delete('/ideas/{idea_id}')
def delete_idea(idea_id: UUID, principal=Depends(auth.mutation)):
    with connection() as conn:
        owned(conn,idea_id,principal,True)
        running = conn.execute("SELECT 1 FROM jobs j JOIN research_runs r ON r.id=j.run_id WHERE r.idea_id=%s AND j.status='running'", (idea_id,)).fetchone()
        running = running or conn.execute("SELECT 1 FROM mvp_jobs j JOIN mvp_builds b ON b.id=j.build_id WHERE b.idea_id=%s AND j.status='running'",(idea_id,)).fetchone()
        if running: raise HTTPException(409,'Сначала отмените работающий запуск и дождитесь остановки')
        keys = [a['object_key'] for a in conn.execute('SELECT object_key FROM artifacts WHERE idea_id=%s',(idea_id,)).fetchall()]
        deletion_id = uid()
        prefixes=[str(r['id'])+':' for r in conn.execute('SELECT e.id FROM experiment_runs e JOIN research_runs r ON r.id=e.run_id WHERE r.idea_id=%s',(idea_id,))]
        prefixes += [str(r['id']) for r in conn.execute('SELECT m.id FROM mvp_results m JOIN mvp_versions v ON v.id=m.version_id JOIN mvp_builds b ON b.id=v.build_id WHERE b.idea_id=%s',(idea_id,))]
        prefixes += [str(r['id'])+':' for r in conn.execute('SELECT id FROM mvp_builds WHERE idea_id=%s',(idea_id,))]
        prefixes += [str(r['id'])+':' for r in conn.execute('SELECT v.id FROM mvp_versions v JOIN mvp_builds b ON b.id=v.build_id WHERE b.idea_id=%s',(idea_id,))]
        conn.execute('INSERT INTO deletion_jobs(id,object_keys,runner_prefixes) VALUES(%s,%s,%s)', (deletion_id,Jsonb(keys),Jsonb(prefixes)))
        run_ids = [str(r['id']) for r in conn.execute('SELECT id FROM research_runs WHERE idea_id=%s',(idea_id,)).fetchall()]
        for table in ('checkpoint_writes','checkpoint_blobs','checkpoints'):
            if conn.execute('SELECT to_regclass(%s) AS name',(table,)).fetchone()['name']:
                for run_id in run_ids:
                    conn.execute(f'DELETE FROM {table} WHERE thread_id=%s',(run_id,))
        conn.execute('DELETE FROM ideas WHERE id=%s',(idea_id,))
        audit(conn,principal['id'],'idea.delete',deletion_id=deletion_id)
    return {'ok':True,'deletion_id':deletion_id,'files_status':'queued'}


@app.post('/ideas/{idea_id}/structure')
def structure_idea(idea_id: UUID, principal=Depends(auth.mutation)):
    with connection() as conn:
        idea=owned(conn,idea_id,principal)
        version=conn.execute('SELECT content FROM idea_versions WHERE idea_id=%s AND version=%s',(idea_id,idea['current_version'])).fetchone()['content']
    config=load_configuration(); prompts=config['PromptSet']
    from time import perf_counter
    from .agent_contract import record
    started=perf_counter()
    try:
        structure_schema=IdeaContent.model_json_schema()
        structure_schema['required']=list(structure_schema['properties'])
        result=provider(config['ProviderProfile']).chat(prompts['boundary']+'\n'+prompts['structure'],version,structure_schema)
        structured=IdeaContent.model_validate(result['output'])
    except (ValueError,ProviderError) as exc:
        record(idea_id,'idea_analyst',{'idea':version,'provider':config['ProviderProfile']},{},input_version=idea['current_version'],
            duration_ms=round((perf_counter()-started)*1000),calls=1,status='error',errors=[{'type':type(exc).__name__}])
        if isinstance(exc,ProviderError): raise
        raise HTTPException(502,'Ответ модели не соответствует схеме карточки') from None
    structured.transcript=version['transcript']
    record(idea_id,'idea_analyst',{'idea':version,'provider':config['ProviderProfile']},structured.model_dump(),
        input_version=idea['current_version'],duration_ms=round((perf_counter()-started)*1000),calls=1)
    return {'content':structured.model_dump(),'input_version':idea['current_version'],'usage':result.get('usage',{})}


@app.post('/ideas/{idea_id}/datasets',status_code=201)
def upload_dataset(idea_id: UUID, body: DatasetInput, principal=Depends(auth.mutation)):
    data_id,version_id=uid(),uid()
    with connection() as conn:
        owned(conn,idea_id,principal)
        conn.execute('INSERT INTO datasets(id,idea_id,name) VALUES(%s,%s,%s)',(data_id,idea_id,body.name))
        conn.execute('INSERT INTO dataset_versions(id,dataset_id,version,content) VALUES(%s,%s,1,%s)',(version_id,data_id,Jsonb(body.model_dump())))
        for metric in ('baseline_seconds','baseline_correct'):
            values=[getattr(row,metric) for row in body.rows]
            missing=sum(v is None for v in values)
            content={'metric':metric,'source':body.source,'period':body.period,'unit':'sec/task' if metric.endswith('seconds') else 'fraction',
                     'n':len(values)-missing,'missing':missing,'missing_fraction':missing/len(values),'limitations':[],'provenance':body.provenance}
            conn.execute('INSERT INTO baseline_metrics(id,idea_id,dataset_version_id,content) VALUES(%s,%s,%s,%s)',(uid(),idea_id,version_id,Jsonb(content)))
        audit(conn,principal['id'],'dataset.create',idea_id,dataset_version_id=version_id)
    return {'id':data_id,'version_id':version_id}


@app.post('/ideas/{idea_id}/runs',status_code=201)
def start_run(idea_id: UUID, body: StartRun, principal=Depends(auth.mutation)):
    with connection() as conn:
        idea=owned(conn,idea_id,principal,True)
        existing=conn.execute('SELECT id FROM research_runs WHERE idea_id=%s AND idempotency_key=%s',(idea_id,body.idempotency_key)).fetchone()
        if existing: return existing
        if idea['stage']=='archived': raise HTTPException(409,'Активируйте идею перед запуском')
        if conn.execute("SELECT 1 FROM research_runs WHERE idea_id=%s AND status IN ('ready','running','paused','waiting_for_user','waiting_for_data')",(idea_id,)).fetchone():
            raise HTTPException(409,'У идеи уже есть незавершённый запуск')
        dataset=conn.execute('SELECT v.* FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id WHERE v.id=%s AND d.idea_id=%s',(body.dataset_version_id,idea_id)).fetchone()
        if not dataset: raise HTTPException(404,'Тестовый набор не найден')
        config=snapshot(conn)
        planned=len(dataset['content']['rows'])*len(body.variant_prompts)*config['BudgetPolicy']['experiment_repetitions']+(1 if body.source_urls else 3)
        if planned>config['BudgetPolicy']['llm_calls']:
            raise HTTPException(422,f'План требует {planned} ИИ-вызовов. Сократите набор или измените версионный BudgetPolicy.')
        version=conn.execute('SELECT id FROM idea_versions WHERE idea_id=%s AND version=%s',(idea_id,idea['current_version'])).fetchone()
        run_id=uid(); solutions=[]
        for index,prompt in enumerate(body.variant_prompts):
            content={'name':'Вариант '+chr(65+index),'prompt':prompt,'provider':config['ProviderProfile'], 'component_versions':{'rules':'1.1.0'}}
            previous=conn.execute('SELECT id FROM solution_candidates WHERE idea_id=%s AND content=%s ORDER BY created_at DESC LIMIT 1',(idea_id,Jsonb(content))).fetchone()
            solution_id=str(previous['id']) if previous else uid()
            solutions.append(solution_id)
            if not previous:
                conn.execute('INSERT INTO solution_candidates(id,idea_id,version,content) VALUES(%s,%s,1,%s)',(solution_id,idea_id,Jsonb(content)))
        config['run_settings']={'thresholds':body.thresholds.model_dump(),'source_urls':[str(u) for u in body.source_urls],'hard_blockers':body.hard_blockers}
        conn.execute('INSERT INTO research_runs(id,idea_id,idea_version_id,idempotency_key,config_versions,dataset_version_id,solution_versions) VALUES(%s,%s,%s,%s,%s,%s,%s)',
                     (run_id,idea_id,version['id'],body.idempotency_key,Jsonb(config),dataset['id'],Jsonb(solutions)))
        conn.execute('INSERT INTO jobs(id,run_id,priority) VALUES(%s,%s,%s)',(uid(),run_id,idea['priority']))
        conn.execute("UPDATE ideas SET stage='queued',execution_state='ready',updated_at=now() WHERE id=%s",(idea_id,))
        audit(conn,principal['id'],'run.create',idea_id,run_id=run_id)
        return {'id':run_id}


@app.get('/ideas/{idea_id}/runs/{run_id}')
def get_run(idea_id: UUID,run_id: UUID,principal=Depends(auth.actor)):
    with connection() as conn:
        owned(conn,idea_id,principal)
        run=conn.execute('SELECT * FROM research_runs WHERE id=%s AND idea_id=%s',(run_id,idea_id)).fetchone()
        if not run: raise HTTPException(404,'Запуск не найден')
        run['steps']=conn.execute('SELECT * FROM step_runs WHERE run_id=%s ORDER BY created_at',(run_id,)).fetchall()
        run['experiments']=conn.execute('SELECT * FROM experiment_runs WHERE run_id=%s ORDER BY created_at',(run_id,)).fetchall()
        run['calculations']=conn.execute('SELECT * FROM calculation_runs WHERE run_id=%s ORDER BY version DESC',(run_id,)).fetchall()
        run['job']=conn.execute('SELECT * FROM jobs WHERE run_id=%s',(run_id,)).fetchone()
        return run


class Command(BaseModel):
    action: str


@app.post('/ideas/{idea_id}/runs/{run_id}/commands')
def command(idea_id: UUID,run_id: UUID,body: Command,principal=Depends(auth.mutation)):
    if body.action not in ('pause','resume','cancel','retry'): raise HTTPException(400,'Неизвестная команда')
    with connection() as conn:
        owned(conn,idea_id,principal,True)
        run=conn.execute('SELECT * FROM research_runs WHERE id=%s AND idea_id=%s FOR UPDATE',(run_id,idea_id)).fetchone()
        if not run: raise HTTPException(404,'Запуск не найден')
        if run['status'] in ('completed','cancelled'): return {'ok':True,'status':run['status']}
        if body.action in ('resume','retry'):
            if run['status'] in ('paused','error','waiting_for_data','waiting_for_user'):
                conn.execute("UPDATE jobs SET status='ready',requested_action=NULL,last_error=NULL,lease_until=NULL WHERE run_id=%s",(run_id,))
                conn.execute("UPDATE research_runs SET status='ready' WHERE id=%s",(run_id,))
                conn.execute("UPDATE ideas SET execution_state='ready' WHERE id=%s",(idea_id,))
        else:
            job=conn.execute('SELECT status FROM jobs WHERE run_id=%s',(run_id,)).fetchone()
            if job['status']=='running': conn.execute('UPDATE jobs SET requested_action=%s WHERE run_id=%s',(body.action,run_id))
            else:
                state='paused' if body.action=='pause' else 'cancelled'
                conn.execute('UPDATE jobs SET status=%s,requested_action=NULL WHERE run_id=%s',(state,run_id))
                conn.execute('UPDATE research_runs SET status=%s WHERE id=%s',(state,run_id))
                conn.execute('UPDATE ideas SET execution_state=%s WHERE id=%s',(state,idea_id))
        audit(conn,principal['id'],'run.'+body.action,idea_id,run_id=str(run_id))
        prefixes=[str(r['id'])+':' for r in conn.execute('SELECT id FROM experiment_runs WHERE run_id=%s',(run_id,))] if body.action=='cancel' else []
    for prefix in prefixes:
        try: httpx.post(os.environ['RUNNER_URL']+'/cancel',json={'prefix':prefix},headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']},timeout=5).raise_for_status()
        except httpx.HTTPError: pass  # Durable requested_action still stops the next worker boundary.
    return {'ok':True}


@app.get('/integrations')
def integrations(principal=Depends(auth.actor)):
    config=load_configuration()
    result={'provider':provider(config['ProviderProfile']).health(), 'storage':{'status':'unavailable'}, 'runner':{'status':'unavailable'}, 'rules':{'status':'unavailable'}}
    try:
        storage.ensure_bucket(); result['storage']={'status':'available'}
    except Exception: pass
    for name,port in [('runner',8001),('rules',8002)]:
        try:
            response=httpx.get(os.getenv(name.upper()+'_URL',f'http://{name}:{port}')+'/health',timeout=4)
            if response.is_success: result[name]=response.json()
        except httpx.HTTPError: pass
    return result


@app.get('/configuration')
def configuration(principal=Depends(auth.actor)):
    return load_configuration()


@app.get('/documentation')
def documentation(principal=Depends(auth.actor)):
    root=Path(os.getenv('DOCS_ROOT',str(Path(__file__).resolve().parents[2]/'docs')))
    return [{'name':str(p.relative_to(root)), 'content':p.read_text(encoding='utf-8')} for p in sorted(root.rglob('*.md'))]


@app.get('/public/reports/{token}')
def public_report(token: str):
    if len(token)>100: raise HTTPException(404,'Отчёт не найден')
    with connection() as conn:
        report=conn.execute('SELECT public_content,created_at FROM reports WHERE public_token=%s',(token,)).fetchone()
    if not report: raise HTTPException(404,'Отчёт не найден')
    return report


@app.post('/ideas/{idea_id}/reports/{report_id}/publish')
def publish_report(idea_id: UUID,report_id: UUID,principal=Depends(auth.mutation)):
    with connection() as conn:
        owned(conn,idea_id,principal)
        row=conn.execute('SELECT p.* FROM reports p JOIN research_runs r ON r.id=p.run_id WHERE p.id=%s AND r.idea_id=%s',(report_id,idea_id)).fetchone()
        if not row: raise HTTPException(404,'Отчёт не найден')
        # Explicit user action publishes only this projection; raw inputs/audio/datasets are excluded.
        public={k:row['content'][k] for k in ['summary','assessment','calculation','versions'] if k in row['content']}
        token=row['public_token'] or secrets.token_urlsafe(32)
        conn.execute('UPDATE reports SET public_token=%s,public_content=%s WHERE id=%s',(token,Jsonb(public),report_id))
        audit(conn,principal['id'],'report.publish',idea_id,report_id=str(report_id))
    return {'url':'/public/'+token}


@app.post('/ideas/{idea_id}/observations')
def observation(idea_id: UUID,body: ObservationInput,principal=Depends(auth.mutation)):
    with connection() as conn:
        owned(conn,idea_id,principal)
        observation_id=uid(); job_id=uid()
        conn.execute('INSERT INTO business_observations(id,idea_id,content) VALUES(%s,%s,%s)',(observation_id,idea_id,Jsonb(body.model_dump())))
        conn.execute('INSERT INTO metric_jobs(id,idea_id,observation_id) VALUES(%s,%s,%s)',(job_id,idea_id,observation_id))
        audit(conn,principal['id'],'observation.create',idea_id,metric=body.metric)
    return {'status':'ready','job_id':job_id,'message':'Наблюдение сохранено. Пересчёт поставлен в очередь Worker.'}


from .media import router as media_router
from .mvp import router as mvp_router
app.include_router(media_router)
app.include_router(mvp_router)
from .process_metrics import router as process_router
app.include_router(process_router)
