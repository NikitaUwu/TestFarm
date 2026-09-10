"""Real free Groq structure, autonomous search, role outputs and experiments."""
import os,json,time
from uuid import uuid4
import httpx

with httpx.Client(base_url='http://api:8000',headers={'X-Farm-Request':'1'},timeout=180) as c:
    c.post('/auth/login',json={'identifier':'demo','password':os.environ['REVIEWER_PASSWORD']}).raise_for_status()
    created=c.post('/ideas',json={'title':'Проверка поиска и ролей Groq — демоданные',
        'transcript':'Автоматически распределять обращения небольшой службы поддержки между категориями оплаты и доступа. '
        'Цель — сократить ручную маршрутизацию. Это синтетическая техническая проверка системы, а не свидетельство спроса.', 'priority':1})
    created.raise_for_status();iid=created.json()['id']
    print(json.dumps({'idea_id':iid,'phase':'structure'}),flush=True)
    structured=c.post(f'/ideas/{iid}/structure');structured.raise_for_status()
    saved=c.put(f'/ideas/{iid}',json={**structured.json()['content'],'expected_version':1});saved.raise_for_status()
    fixture=c.get('/ideas/687a7d74-e78c-47ba-9b13-d4a33d846ebd').json()['datasets'][0]['content']
    fixture={**fixture,'period':'2026-09-09','provenance':'demo','source':'Синтетическая техническая проверка поиска/ролей; не бизнес-измерения'}
    dataset=c.post(f'/ideas/{iid}/datasets',json=fixture);dataset.raise_for_status()
    request={'dataset_version_id':dataset.json()['version_id'],'variant_prompts':['Определи главную категорию обращения.','Проверь неоднозначность, затем выбери категорию.'],
        'idempotency_key':str(uuid4()),'source_urls':[],'thresholds':{'minimum_effect_seconds':1,'minimum_quality':.8,'maximum_manual_review':.3,'maximum_error':.2},'hard_blockers':[]}
    started=c.post(f'/ideas/{iid}/runs',json=request);started.raise_for_status();rid=started.json()['id']
    print(json.dumps({'idea_id':iid,'run_id':rid,'phase':'queued'}),flush=True)
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
    assert result['search_count']>=1
    assert len(next(s for s in result['steps'] if s['step_id']=='experiments')['result']['data']['observations'])==12
    assert idea['reports'][0]['content']['assessment']['recommendation']!='Развивать'
    print(json.dumps({'idea_id':iid,'run_id':rid,'roles':sorted(roles),'calls':result['call_count'],
                      'search_count':result['search_count'],'observations':12,'provenance':'demo'},ensure_ascii=False))
