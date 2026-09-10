from typing import Literal
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from .auth import mutation
from .db import connection,uid,Jsonb

router=APIRouter()


class TimerInput(BaseModel):
    dataset_version_id: UUID
    task_id: str=Field(min_length=1,max_length=100)
    solution_id: UUID | None=None
    phase: Literal['baseline','input','manual_review','error_correction','postprocessing','overhead']
    source: str=Field(min_length=1,max_length=1000)
    provenance: Literal['measured','demo']='measured'


@router.post('/ideas/{idea_id}/process-sessions')
def start(idea_id:UUID,body:TimerInput,principal=Depends(mutation)):
    from .api import owned
    with connection() as c:
        owned(c,idea_id,principal,True)
        dataset=c.execute('SELECT v.content FROM dataset_versions v JOIN datasets d ON d.id=v.dataset_id WHERE v.id=%s AND d.idea_id=%s',(body.dataset_version_id,idea_id)).fetchone()
        if not dataset or body.task_id not in {r['task_id'] for r in dataset['content']['rows']}:raise HTTPException(422,'Задача не найдена в выбранной версии dataset')
        if body.solution_id and not c.execute('SELECT 1 FROM solution_candidates WHERE id=%s AND idea_id=%s',(body.solution_id,idea_id)).fetchone():raise HTTPException(404,'Вариант не найден')
        if c.execute('SELECT 1 FROM process_sessions WHERE idea_id=%s AND finished_at IS NULL',(idea_id,)).fetchone():raise HTTPException(409,'Сначала завершите текущий замер')
        identifier=uid()
        c.execute('INSERT INTO process_sessions(id,idea_id,task_id,solution_id,phase,source,provenance,dataset_version_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
            (identifier,idea_id,body.task_id,body.solution_id,body.phase,body.source,body.provenance,body.dataset_version_id))
        return {'id':identifier,'status':'running'}


@router.post('/ideas/{idea_id}/process-sessions/{session_id}/stop')
def stop(idea_id:UUID,session_id:UUID,principal=Depends(mutation)):
    from .api import owned
    with connection() as c:
        owned(c,idea_id,principal,True)
        row=c.execute('SELECT * FROM process_sessions WHERE id=%s AND idea_id=%s FOR UPDATE',(session_id,idea_id)).fetchone()
        if not row:raise HTTPException(404,'Замер не найден')
        if row['finished_at']:return row
        row=c.execute('UPDATE process_sessions SET finished_at=now(),seconds=extract(epoch FROM(now()-started_at)) WHERE id=%s RETURNING *',(session_id,)).fetchone()
        if row['seconds']>86400:
            c.execute("UPDATE process_sessions SET provenance='invalid' WHERE id=%s",(session_id,))
            return {**row,'provenance':'invalid','message':'Замер длиннее суток, исключён из расчёта'}
        c.execute('INSERT INTO metric_jobs(id,idea_id) VALUES(%s,%s)',(uid(),idea_id))
        return row


def measurements(idea_id,dataset_version_id):
    with connection() as c:
        rows=c.execute("SELECT * FROM process_sessions WHERE idea_id=%s AND dataset_version_id=%s AND finished_at IS NOT NULL AND provenance<>'invalid' ORDER BY started_at",(idea_id,dataset_version_id)).fetchall()
    return [{**r,'id':str(r['id']),'idea_id':str(r['idea_id']),'dataset_version_id':str(r['dataset_version_id']),'solution_id':str(r['solution_id']) if r['solution_id'] else None,
             'started_at':r['started_at'].isoformat(),'finished_at':r['finished_at'].isoformat()} for r in rows]
