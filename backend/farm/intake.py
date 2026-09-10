"""Idea-only commands. All expensive work belongs to the persistent worker."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from starlette.concurrency import run_in_threadpool
from .auth import mutation
from .autonomy_schemas import Intake, ContinueIdea
from .schemas import IdeaContent
from .config import snapshot
from .db import connection, uid, Jsonb, audit

router = APIRouter()


def enqueue(conn, idea, version_id, request_key):
    config = snapshot(conn)
    config['run_settings'] = {'autonomous': True, 'source_urls': [], 'hard_blockers': [],
                              'thresholds': config['AutonomyPolicy']['thresholds']}
    run_id = uid()
    conn.execute('INSERT INTO research_runs(id,idea_id,idea_version_id,idempotency_key,config_versions) VALUES(%s,%s,%s,%s,%s)',
                 (run_id, idea['id'], version_id, request_key, Jsonb(config)))
    conn.execute('INSERT INTO jobs(id,run_id,priority) VALUES(%s,%s,%s)', (uid(),run_id,idea['priority']))
    conn.execute("UPDATE ideas SET stage='queued',execution_state='ready',updated_at=now() WHERE id=%s", (idea['id'],))
    return run_id


@router.post('/intake/audio', status_code=201)
async def submit_audio(file: UploadFile=File(...), idempotency_key: str=Form(...), principal=Depends(mutation)):
    from .api import active_slot
    from .media import inspect_audio
    from .config import load_configuration
    from . import storage
    if not 8<=len(idempotency_key)<=100: raise HTTPException(422,'Некорректный идентификатор запроса')
    if file.content_type not in ('audio/webm','video/webm','audio/ogg','audio/wav','audio/x-wav','audio/mp4'):
        raise HTTPException(415,'Недопустимый формат аудио')
    limit=load_configuration()['BudgetPolicy']
    data=await file.read(limit['audio_max_bytes']+1)
    if len(data)>limit['audio_max_bytes']: raise HTTPException(413,'Аудио слишком большое')
    duration,_,_,_=await run_in_threadpool(inspect_audio,data)
    if not 0<duration<=limit['audio_max_seconds']: raise HTTPException(422,'Запись должна быть не длиннее 5 минут')
    def persist():
        saved_key=None
        try:
            with connection() as conn:
                conn.execute('SELECT id FROM principals WHERE id=%s FOR UPDATE',(principal['id'],))
                prior=conn.execute('SELECT idea_id AS id,run_id FROM intake_requests WHERE owner_id=%s AND request_key=%s',(principal['id'],idempotency_key)).fetchone()
                if prior:return prior
                active_slot(conn,principal)
                idea={'id':uid(),'priority':1}; version_id=uid(); artifact_id=uid()
                card=IdeaContent(title='Голосовая идея').model_dump()
                conn.execute('INSERT INTO ideas(id,owner_id,title) VALUES(%s,%s,%s)',(idea['id'],principal['id'],card['title']))
                conn.execute('INSERT INTO idea_versions(id,idea_id,version,content) VALUES(%s,%s,1,%s)',(version_id,idea['id'],Jsonb(card)))
                run_id=enqueue(conn,idea,version_id,idempotency_key)
                saved_key=f'{principal["id"]}/{idea["id"]}/{artifact_id}'
                storage.put(saved_key,data,file.content_type)
                conn.execute('INSERT INTO artifacts(id,idea_id,run_id,object_key,mime,size,kind) VALUES(%s,%s,%s,%s,%s,%s,%s)',(artifact_id,idea['id'],run_id,saved_key,file.content_type,len(data),'audio'))
                conn.execute('INSERT INTO intake_requests VALUES(%s,%s,%s,%s)',(principal['id'],idempotency_key,idea['id'],run_id))
                audit(conn,principal['id'],'idea.audio_intake',idea['id'],run_id=run_id,duration=duration)
            return {'id':idea['id'],'run_id':run_id,'current_version':1}
        except Exception:
            if saved_key: storage.delete_keys([saved_key])
            raise
    return await run_in_threadpool(persist)


@router.post('/intake', status_code=201)
def submit(body: Intake, principal=Depends(mutation)):
    from .api import active_slot
    text = body.description.strip()
    if len(text) < 3:
        raise HTTPException(422, 'Опишите идею несколькими словами')
    with connection() as conn:
        conn.execute('SELECT id FROM principals WHERE id=%s FOR UPDATE', (principal['id'],))
        prior = conn.execute('SELECT idea_id AS id,run_id FROM intake_requests WHERE owner_id=%s AND request_key=%s', (principal['id'],body.idempotency_key)).fetchone()
        if prior: return prior
        active_slot(conn, principal)
        idea = {'id':uid(), 'priority':body.priority}
        card = IdeaContent(title=text[:100], transcript=text).model_dump()
        version_id = uid()
        conn.execute('INSERT INTO ideas(id,owner_id,title,priority) VALUES(%s,%s,%s,%s)', (idea['id'],principal['id'],card['title'],body.priority))
        conn.execute('INSERT INTO idea_versions(id,idea_id,version,content) VALUES(%s,%s,1,%s)', (version_id,idea['id'],Jsonb(card)))
        conn.execute('INSERT INTO idea_changes(id,idea_id,to_version,changed_fields) VALUES(%s,%s,1,%s)', (uid(),idea['id'],Jsonb(['transcript'])))
        run_id = enqueue(conn, idea, version_id, body.idempotency_key)
        conn.execute('INSERT INTO intake_requests VALUES(%s,%s,%s,%s)', (principal['id'],body.idempotency_key,idea['id'],run_id))
        audit(conn, principal['id'], 'idea.intake', idea['id'], run_id=run_id)
    return {'id':idea['id'], 'run_id':run_id, 'current_version':1}


@router.post('/ideas/{idea_id}/continue', status_code=201)
def continue_idea(idea_id: UUID, body: ContinueIdea, principal=Depends(mutation)):
    from .api import owned
    if len(body.description.strip())<3: raise HTTPException(422,'Добавьте содержательное уточнение')
    with connection() as conn:
        idea = owned(conn, idea_id, principal, True)
        prior = conn.execute('SELECT id FROM research_runs WHERE idea_id=%s AND idempotency_key=%s', (idea_id,body.idempotency_key)).fetchone()
        if prior: return {'id':str(idea_id), 'run_id':prior['id']}
        if idea['stage']=='archived': raise HTTPException(409, 'Сначала верните идею из архива')
        if idea['current_version'] != body.expected_version: raise HTTPException(409, 'Идея уже изменена. Обновите страницу.')
        previous = conn.execute('SELECT content FROM idea_versions WHERE idea_id=%s AND version=%s', (idea_id,idea['current_version'])).fetchone()['content']
        original=previous['transcript']
        if not original:
            spoken=conn.execute("SELECT s.result FROM step_runs s JOIN research_runs r ON r.id=s.run_id WHERE r.idea_id=%s AND r.idea_version_id IN (SELECT id FROM idea_versions WHERE idea_id=%s AND version=%s) AND s.step_id='transcription' AND s.result->>'status'='completed' ORDER BY s.created_at DESC LIMIT 1",(idea_id,idea_id,idea['current_version'])).fetchone()
            if spoken: original=spoken['result']['data']['transcript']
        transcript = original+'\n\nУточнение пользователя:\n'+body.description.strip()
        if len(transcript)>20000: raise HTTPException(422, 'Слишком длинное описание с уточнениями')
        version = idea['current_version']+1
        card = IdeaContent.model_validate({**previous,'transcript':transcript}).model_dump()
        version_id = uid()
        conn.execute('INSERT INTO idea_versions(id,idea_id,version,content) VALUES(%s,%s,%s,%s)', (version_id,idea_id,version,Jsonb(card)))
        conn.execute('INSERT INTO idea_changes(id,idea_id,from_version,to_version,changed_fields) VALUES(%s,%s,%s,%s,%s)', (uid(),idea_id,version-1,version,Jsonb(['transcript'])))
        conn.execute('UPDATE ideas SET current_version=%s WHERE id=%s', (version,idea_id))
        conn.execute('UPDATE research_runs SET stale=true WHERE idea_id=%s', (idea_id,))
        conn.execute("UPDATE jobs SET requested_action='cancel',status=CASE WHEN status='running' THEN status ELSE 'cancelled' END WHERE run_id IN (SELECT id FROM research_runs WHERE idea_id=%s) AND status NOT IN ('completed','cancelled')", (idea_id,))
        run_id = enqueue(conn, idea, version_id, body.idempotency_key)
        audit(conn,principal['id'],'idea.continue',idea_id,run_id=run_id,version=version)
    return {'id':str(idea_id), 'run_id':run_id, 'current_version':version}
