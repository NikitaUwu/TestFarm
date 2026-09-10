"""Real isolated reviewer fixture: audio, versions, commands, archive and deletion."""
import os
import json
import time
from uuid import uuid4
import httpx
from farm.db import connection
from farm import storage


def run():
    with httpx.Client(base_url='http://api:8000', headers={'X-Farm-Request':'1'}, timeout=180) as c:
        c.post('/auth/login',json={'role':'reviewer','password':os.environ['REVIEWER_PASSWORD']}).raise_for_status()
        created=c.post('/ideas',json={'title':'Удаляемая проверка голосового сценария','transcript':'','priority':0})
        created.raise_for_status(); iid=created.json()['id']
        with connection() as db:
            source=db.execute("SELECT object_key FROM artifacts WHERE id='87c538d8-2a1f-4d23-9394-8a9078d6033b'").fetchone()
        wav=storage.client().get_object(Bucket=storage.bucket(),Key=source['object_key'])['Body'].read()
        audio=c.post(f'/ideas/{iid}/audio',files={'file':('synthetic-russian.wav',wav,'audio/wav')})
        audio.raise_for_status(); assert audio.json()['status']=='completed'
        idea=c.get('/ideas/'+iid).json()
        assert len(idea['artifacts'])==2 and idea['content']['transcript']==''
        corrected={**idea['content'],'transcript':audio.json()['transcript']+'. Исправлено для проверки версии.','expected_version':1}
        assert c.put('/ideas/'+iid,json=corrected).json()['current_version']==2
        assert c.get(f'/ideas/{iid}/artifacts/'+audio.json()['artifact_id']).content==wav
        dataset=c.get('/ideas/687a7d74-e78c-47ba-9b13-d4a33d846ebd').json()['datasets'][0]['content']
        d=c.post(f'/ideas/{iid}/datasets',json=dataset); d.raise_for_status()
        r=c.post(f'/ideas/{iid}/runs',json={'idempotency_key':str(uuid4()),'dataset_version_id':d.json()['version_id'],
                  'variant_prompts':['Определи категорию','Проверь цель обращения'], 'thresholds':{},'source_urls':[]})
        r.raise_for_status(); rid=r.json()['id']
        endpoint=f'/ideas/{iid}/runs/{rid}'
        for action,target in [('pause','paused'),('resume',None),('cancel','cancelled'),('cancel','cancelled'),('resume','cancelled')]:
            c.post(endpoint+'/commands',json={'action':action}).raise_for_status()
            if target:
                deadline=time.monotonic()+45
                while time.monotonic()<deadline:
                    state=c.get(endpoint).json()['status']
                    if state==target: break
                    time.sleep(.5)
                assert state==target,(action,state)
        for action in ('archive','activate'):
            c.post(f'/ideas/{iid}/actions',json={'action':action}).raise_for_status()
        assert c.get('/ideas/'+iid).json()['stage']=='draft'
        with connection() as db:
            keys=[a['object_key'] for a in db.execute('SELECT object_key FROM artifacts WHERE idea_id=%s',(iid,))]
        deleted=c.delete('/ideas/'+iid); deleted.raise_for_status()
        assert c.get('/ideas/'+iid).status_code==404
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            with connection() as db:
                status=db.execute('SELECT status FROM deletion_jobs WHERE id=%s',(deleted.json()['deletion_id'],)).fetchone()['status']
            if status=='completed':break
            time.sleep(.5)
        assert status=='completed'
        for key in keys:
            try: storage.client().head_object(Bucket=storage.bucket(),Key=key)
            except storage.client().exceptions.ClientError as exc:
                assert exc.response['ResponseMetadata']['HTTPStatusCode']==404
            else: raise AssertionError('S3 object survived deletion')
        print(json.dumps({'checks':['audio_and_transcript_separate','corrected_idea_version','original_audio_roundtrip',
                    'pause_resume_cancel_idempotence','archive_activate','database_delete','durable_s3_delete'],
                    'deleted_fixture':iid},ensure_ascii=False))


if __name__=='__main__':run()
