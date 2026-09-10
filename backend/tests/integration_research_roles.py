"""Continue role acceptance using explicit public URLs when search is unavailable."""
import os,json,time
from uuid import uuid4
import httpx

iid=os.environ['TEST_IDEA_ID']
with httpx.Client(base_url='http://api:8000',headers={'X-Farm-Request':'1'},timeout=180) as c:
    c.post('/auth/login',json={'identifier':'demo','password':os.environ['REVIEWER_PASSWORD']}).raise_for_status()
    idea=c.get('/ideas/'+iid).json()
    assert 'демо' in idea['title'].lower() or idea['datasets'][0]['content']['provenance']=='demo'
    for run in idea['runs']:
        if run['status'] not in ('completed','cancelled'):
            c.post(f'/ideas/{iid}/runs/{run["id"]}/commands',json={'action':'cancel'}).raise_for_status()
    request={'dataset_version_id':idea['datasets'][0]['version_id'],'idempotency_key':str(uuid4()),
        'variant_prompts':['Определи главную категорию обращения.','Проверь неоднозначность, затем выбери категорию.'],
        'source_urls':['https://www.zendesk.com/service/ticketing-system/','https://www.intercom.com/fin',
                       'https://www.freshworks.com/freshdesk/','https://scikit-learn.org/stable/modules/text_classification.html',
                       'https://huggingface.co/docs/transformers/tasks/sequence_classification'],'thresholds':{},'hard_blockers':[]}
    if os.getenv('TEST_AUTO_SEARCH')=='1':request['source_urls']=[]
    started=c.post(f'/ideas/{iid}/runs',json=request);started.raise_for_status();rid=started.json()['id']
    print(json.dumps({'idea_id':iid,'run_id':rid}),flush=True)
    deadline=time.monotonic()+300
    while time.monotonic()<deadline:
        result=c.get(f'/ideas/{iid}/runs/{rid}').json()
        if result['status'] not in ('ready','running'):break
        time.sleep(2)
    assert result['status']=='completed',{'status':result['status'],'error':result['job']['last_error']}
    idea=c.get('/ideas/'+iid).json()
    roles={a['role'] for a in idea['agent_results'] if a['result']['status']=='completed'}
    expected={'idea_analyst','market_analyst','strategist','business_consultant','product_marketer','researcher','ux_analyst',
              'orchestrator','efficiency_analyst','critic','tracker','report_editor'}
    assert expected<=roles,expected-roles
    assert len(next(s for s in result['steps'] if s['step_id']=='experiments')['result']['data']['observations'])==12
    assert idea['reports'][0]['content']['assessment']['recommendation']!='Развивать'
    print(json.dumps({'idea_id':iid,'run_id':rid,'roles':sorted(roles),'calls':result['call_count'],
        'observations':12,'provenance':'demo','search_count':result['search_count'],
        'search':'automatic' if not request['source_urls'] else 'explicit_URLs'},ensure_ascii=False))
