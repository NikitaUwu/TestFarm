import os
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
import httpx
from .auth import actor,mutation
from .db import connection,uid,Jsonb,audit
from .schemas import RunnerOutput

router=APIRouter()


class DecisionInput(BaseModel):
    decision: str
    reason: str=Field(min_length=1,max_length=4000)
    acceptance: list[str]=Field(default_factory=list,max_length=20)


@router.post('/ideas/{idea_id}/reports/{report_id}/decision')
def decide(idea_id: UUID,report_id: UUID,body: DecisionInput,principal=Depends(mutation)):
    from .api import owned
    if body.decision not in ('Развивать','Сначала проверить','Отложить','Отклонить','Недостаточно данных'):
        raise HTTPException(422,'Неизвестное решение')
    with connection() as conn:
        owned(conn,idea_id,principal,True)
        report=conn.execute('SELECT p.*,r.stale,r.config_versions,r.dataset_version_id FROM reports p JOIN research_runs r ON r.id=p.run_id WHERE p.id=%s AND r.idea_id=%s',(report_id,idea_id)).fetchone()
        if not report: raise HTTPException(404,'Отчёт не найден')
        if report['stale']: raise HTTPException(409,'Отчёт устарел: исследуйте актуальную версию')
        decision_id=uid()
        if body.decision=='Развивать':
            if report['content']['assessment']['recommendation']!='Развивать':
                raise HTTPException(409,'Критерии перехода к MVP не пройдены. Сначала закройте пробелы отчёта.')
            if not body.acceptance: raise HTTPException(422,'Зафиксируйте критерии приёмки до создания MVP')
            conn.execute('SELECT pg_advisory_xact_lock(714213)')
            if conn.execute("SELECT 1 FROM mvp_builds WHERE status IN ('building','ready')").fetchone():
                raise HTTPException(409,'В прототипе уже есть один MVP')
        conn.execute('INSERT INTO decisions(id,idea_id,report_id,actor_id,decision,content) VALUES(%s,%s,%s,%s,%s,%s)',(decision_id,idea_id,report_id,principal['id'],body.decision,Jsonb(body.model_dump())))
        if body.decision=='Развивать':
            build_id=uid()
            conn.execute("INSERT INTO mvp_builds(id,idea_id,decision_id,status) VALUES(%s,%s,%s,'building')",(build_id,idea_id,decision_id))
            conn.execute('INSERT INTO mvp_jobs(id,build_id,config) VALUES(%s,%s,%s)',(uid(),build_id,Jsonb(report['config_versions'])))
            conn.execute("UPDATE ideas SET stage='mvp_building',execution_state='ready' WHERE id=%s",(idea_id,))
        audit(conn,principal['id'],'decision.create',idea_id,decision=body.decision)
    return {'id':decision_id}


class MvpInput(BaseModel):
    text: str=Field(default='',max_length=10000)
    input: dict=Field(default_factory=dict)


@router.post('/ideas/{idea_id}/mvp/{version_id}/run')
def run_mvp(idea_id: UUID,version_id: UUID,body: MvpInput,principal=Depends(mutation)):
    from .api import owned
    with connection() as conn:
        owned(conn,idea_id,principal)
        version=conn.execute('SELECT v.*,b.status FROM mvp_versions v JOIN mvp_builds b ON b.id=v.build_id WHERE v.id=%s AND b.idea_id=%s',(version_id,idea_id)).fetchone()
        if not version: raise HTTPException(404,'MVP не найден')
    if version['status'] in ('cancelled','error'):raise HTTPException(409,'MVP остановлен')
    spec=version['content']; result_id=uid(); request_id=str(version_id)+':'+result_id
    try:
        generated=spec.get('template')=='generated-js-v1'
        if generated and spec.get('validation_status')!='passed':raise HTTPException(409,'Сборка и тесты MVP ещё не завершены')
        if generated:
            from .programs import GeneratedProgram,validate_fields
            try:validate_fields(body.input,GeneratedProgram.model_validate(spec['program']).input_fields)
            except ValueError:raise HTTPException(422,'Поля ввода не соответствуют форме MVP') from None
        payload=({'request_id':request_id,'input':body.input,**{k:spec[k] for k in ('program','system','provider_profile')}} if generated else
                 {'request_id':request_id,'text':body.text,**{k:spec[k] for k in ('labels','prompt','system','provider_profile')}})
        response=httpx.post(os.environ['RUNNER_URL']+('/program/run' if generated else '/run'),headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']},json=payload,timeout=170)
        if response.is_error: raise HTTPException(503,'MVP: Runner или провайдер недоступен')
        result=response.json() if generated else RunnerOutput.model_validate(response.json()).model_dump()
        if generated:
            from .programs import GeneratedProgram,validate_fields
            validate_fields(result['output'],GeneratedProgram.model_validate(spec['program']).output_fields)
        if result['request_id']!=request_id: raise HTTPException(502,'MVP: ответ другого запроса')
    except httpx.HTTPError: raise HTTPException(503,'MVP: Runner недоступен') from None
    with connection() as conn:
        owned(conn,idea_id,principal)
        conn.execute('INSERT INTO mvp_results(id,version_id,content) VALUES(%s,%s,%s)',(result_id,version_id,Jsonb(result)))
        audit(conn,principal['id'],'mvp.run',idea_id,version_id=str(version_id),result_id=result_id)
    return {'id':result_id,**result}


@router.post('/ideas/{idea_id}/mvp/{version_id}/accept')
def accept_mvp(idea_id: UUID,version_id: UUID,principal=Depends(mutation)):
    from .api import owned
    with connection() as conn:
        owned(conn,idea_id,principal,True)
        version=conn.execute('SELECT v.*,b.status AS build_status FROM mvp_versions v JOIN mvp_builds b ON b.id=v.build_id WHERE v.id=%s AND b.idea_id=%s',(version_id,idea_id)).fetchone()
        if not version: raise HTTPException(404,'MVP не найден')
        if version['build_status'] in ('cancelled','error') or (version['content'].get('template')=='generated-js-v1' and version['content'].get('validation_status')!='passed'):
            raise HTTPException(409,'Сборка MVP не прошла проверку')
        success=conn.execute("SELECT 1 FROM mvp_results WHERE version_id=%s AND content->>'success'='true'",(version_id,)).fetchone()
        if not success: raise HTTPException(409,'Сначала выполните успешный сквозной прогон MVP')
        conn.execute("UPDATE mvp_builds SET status='ready' WHERE id=%s",(version['build_id'],))
        conn.execute("UPDATE ideas SET stage='mvp_ready',execution_state='completed' WHERE id=%s",(idea_id,))
        audit(conn,principal['id'],'mvp.accept',idea_id,version_id=str(version_id),acceptance=version['content']['acceptance'])
    return {'ok':True}


@router.post('/ideas/{idea_id}/mvp/{version_id}/cancel')
def cancel_execution(idea_id:UUID,version_id:UUID,principal=Depends(mutation)):
    from .api import owned
    with connection() as c:
        owned(c,idea_id,principal)
        if not c.execute('SELECT 1 FROM mvp_versions v JOIN mvp_builds b ON b.id=v.build_id WHERE v.id=%s AND b.idea_id=%s',(version_id,idea_id)).fetchone():raise HTTPException(404,'MVP не найден')
    try:
        response=httpx.post(os.environ['RUNNER_URL']+'/cancel',json={'prefix':str(version_id)+':'},headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']},timeout=10)
        response.raise_for_status()
    except httpx.HTTPError:raise HTTPException(503,'Не удалось подтвердить отмену Runner') from None
    return {'ok':True}


@router.get('/ideas/{idea_id}/mvp/{version_id}/results')
def mvp_results(idea_id: UUID,version_id: UUID,principal=Depends(actor)):
    from .api import owned
    with connection() as conn:
        owned(conn,idea_id,principal)
        if not conn.execute('SELECT 1 FROM mvp_versions v JOIN mvp_builds b ON b.id=v.build_id WHERE v.id=%s AND b.idea_id=%s',(version_id,idea_id)).fetchone(): raise HTTPException(404,'MVP не найден')
        return conn.execute('SELECT * FROM mvp_results WHERE version_id=%s ORDER BY created_at DESC',(version_id,)).fetchall()


@router.post('/ideas/{idea_id}/mvp-jobs/{job_id}/retry')
def retry_build(idea_id:UUID,job_id:UUID,principal=Depends(mutation)):
    from .api import owned
    with connection() as c:
        owned(c,idea_id,principal,True)
        job=c.execute('SELECT j.* FROM mvp_jobs j JOIN mvp_builds b ON b.id=j.build_id WHERE j.id=%s AND b.idea_id=%s FOR UPDATE OF j',(job_id,idea_id)).fetchone()
        if not job:raise HTTPException(404,'Задание не найдено')
        if job['status']=='error':raise HTTPException(409,'Лимит автоматических исправлений исчерпан. Нужны новая спецификация и новое решение.')
        return {'status':job['status']}
