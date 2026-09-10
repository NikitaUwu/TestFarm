import os,json
from uuid import uuid4
import httpx
iid='36bdd50b-54b2-4ec0-918e-1213fab38ca3'
with httpx.Client(base_url='http://api:8000',headers={'X-Farm-Request':'1'},timeout=30) as c:
    c.post('/auth/login',json={'role':'reviewer','password':os.environ['REVIEWER_PASSWORD']}).raise_for_status()
    idea=c.get('/ideas/'+iid).json();assert idea['datasets'][0]['content']['provenance']=='demo'
    r=c.post(f'/ideas/{iid}/runs',json={'dataset_version_id':idea['datasets'][0]['version_id'],'idempotency_key':str(uuid4()),
        'variant_prompts':['Определи категорию и кратко проверь обоснованность выбора.','Определи категорию и проверь возможную неоднозначность перед ответом.'],
        'source_urls':[],'thresholds':{},'hard_blockers':[]})
    r.raise_for_status();print(json.dumps({'idea_id':iid,'run_id':r.json()['id']}))
