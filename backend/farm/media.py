import io
import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from .auth import actor, mutation
from .db import connection, uid, audit
from .config import load_configuration
from .providers import provider
from . import storage

router=APIRouter()


def inspect_audio(data: bytes):
    if data[:4]==b'RIFF' and data[8:12]==b'WAVE':
        try:
            with wave.open(io.BytesIO(data),'rb') as audio:
                return audio.getnframes()/audio.getframerate(),data,'audio/wav','audio.wav'
        except wave.Error: raise HTTPException(422,'Повреждённый WAV') from None
    if not (data.startswith(b'\x1aE\xdf\xa3') or data.startswith(b'OggS') or data[4:8]==b'ftyp'):
        raise HTTPException(415,'Неподдерживаемый или повреждённый аудиофайл')
    with tempfile.TemporaryDirectory(prefix='farm-audio-') as directory:
        source=Path(directory)/'input'; target=Path(directory)/'audio.wav'; source.write_bytes(data)
        try:
            result=subprocess.run(['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',str(source),
                '-t','301','-ac','1','-ar','16000',str(target)],timeout=40,capture_output=True,env={'PATH':os.environ.get('PATH','')})
        except FileNotFoundError: raise HTTPException(503,'Декодер аудио не настроен') from None
        except subprocess.TimeoutExpired: raise HTTPException(422,'Превышено время обработки аудио') from None
        if result.returncode: raise HTTPException(422,'Аудиофайл не удалось декодировать')
        wav=target.read_bytes()
        with wave.open(io.BytesIO(wav),'rb') as audio: duration=audio.getnframes()/audio.getframerate()
        return duration,wav,'audio/wav','audio.wav'


@router.post('/ideas/{idea_id}/audio')
async def upload_audio(idea_id: UUID,file: UploadFile=File(...),principal=Depends(mutation)):
    from .api import owned
    config=load_configuration(); budget=config['BudgetPolicy']
    with connection() as conn: owned(conn,idea_id,principal)
    if file.content_type not in ('audio/webm','video/webm','audio/ogg','audio/wav','audio/x-wav','audio/mp4'):
        raise HTTPException(415,'Недопустимый MIME аудио')
    data=await file.read(budget['audio_max_bytes']+1)
    if len(data)>budget['audio_max_bytes']: raise HTTPException(413,'Аудио превышает 20 MiB')
    duration,wav,mime,filename=await run_in_threadpool(inspect_audio,data)
    if duration>budget['audio_max_seconds']: raise HTTPException(422,'Аудио длиннее 5 минут')
    if duration<=0: raise HTTPException(422,'Аудио пустое')
    artifact_id=uid(); key=f'{principal["id"]}/{idea_id}/{artifact_id}'
    await run_in_threadpool(storage.put,key,data,file.content_type)
    with connection() as conn:
        owned(conn,idea_id,principal)
        conn.execute('INSERT INTO artifacts(id,idea_id,object_key,mime,size,kind) VALUES(%s,%s,%s,%s,%s,%s)',(artifact_id,idea_id,key,file.content_type,len(data),'audio'))
        audit(conn,principal['id'],'audio.upload',idea_id,artifact_id=artifact_id,duration=duration)
    # Original audio remains available if STT fails; never return a fabricated transcript.
    return await run_in_threadpool(transcribe_saved,idea_id,artifact_id,principal,config,duration,wav,filename,mime)


def transcribe_saved(idea_id,artifact_id,principal,config,duration,wav,filename,mime):
    try: text=provider(config['ProviderProfile']).transcribe(wav,filename,mime)
    except Exception as exc:
        from .providers import ProviderError
        if isinstance(exc,ProviderError): return {'artifact_id':artifact_id,'duration':duration,'status':exc.status,'error':str(exc),'transcript':None}
        raise
    transcript_id=uid(); key=f'{principal["id"]}/{idea_id}/{transcript_id}'
    encoded=json.dumps({'audio_artifact_id':str(artifact_id),'text':text,'provider_profile':config['ProviderProfile']},ensure_ascii=False).encode('utf-8')
    storage.put(key,encoded,'application/json')
    with connection() as conn:
        from .api import owned
        owned(conn,idea_id,principal)
        conn.execute('INSERT INTO artifacts(id,idea_id,object_key,mime,size,kind) VALUES(%s,%s,%s,%s,%s,%s)',(transcript_id,idea_id,key,'application/json',len(encoded),'transcript'))
        audit(conn,principal['id'],'audio.transcribe',idea_id,audio_artifact_id=str(artifact_id),transcript_artifact_id=transcript_id)
    return {'artifact_id':artifact_id,'transcript_artifact_id':transcript_id,'duration':duration,'status':'completed','transcript':text}


@router.post('/ideas/{idea_id}/audio/{artifact_id}/transcribe')
def retry_transcription(idea_id: UUID,artifact_id: UUID,principal=Depends(mutation)):
    from .api import owned
    with connection() as conn:
        owned(conn,idea_id,principal)
        row=conn.execute("SELECT object_key FROM artifacts WHERE id=%s AND idea_id=%s AND kind='audio'",(artifact_id,idea_id)).fetchone()
        if not row: raise HTTPException(404,'Аудио не найдено')
    config=load_configuration()
    data=storage.client().get_object(Bucket=storage.bucket(),Key=row['object_key'])['Body'].read(config['BudgetPolicy']['audio_max_bytes']+1)
    if len(data)>config['BudgetPolicy']['audio_max_bytes']: raise HTTPException(413,'Аудио превышает допустимый размер')
    duration,wav,mime,filename=inspect_audio(data)
    if not 0<duration<=config['BudgetPolicy']['audio_max_seconds']: raise HTTPException(422,'Недопустимая длительность аудио')
    return transcribe_saved(idea_id,artifact_id,principal,config,duration,wav,filename,mime)


@router.get('/ideas/{idea_id}/artifacts/{artifact_id}')
def artifact(idea_id: UUID,artifact_id: UUID,principal=Depends(actor)):
    from .api import owned
    with connection() as conn:
        owned(conn,idea_id,principal)
        row=conn.execute('SELECT * FROM artifacts WHERE id=%s AND idea_id=%s',(artifact_id,idea_id)).fetchone()
        if not row: raise HTTPException(404,'Артефакт не найден')
    data=storage.client().get_object(Bucket=storage.bucket(),Key=row['object_key'])['Body'].read()
    return Response(data,media_type=row['mime'],headers={'Content-Disposition':f'attachment; filename="{artifact_id}"','X-Content-Type-Options':'nosniff'})
