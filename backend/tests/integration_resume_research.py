"""Resume a known QA run after an adapter fix, then check its real artifacts."""
import os,json,time
import httpx
iid=os.environ['TEST_IDEA_ID'];rid=os.environ['TEST_RUN_ID']
with httpx.Client(base_url='http://api:8000',headers={'X-Farm-Request':'1'},timeout=30) as c:
    c.post('/auth/login',json={'identifier':'demo','password':os.environ['REVIEWER_PASSWORD']}).raise_for_status()
    c.post(f'/ideas/{iid}/runs/{rid}/commands',json={'action':'retry'}).raise_for_status()
    deadline=time.monotonic()+300
    while time.monotonic()<deadline:
        result=c.get(f'/ideas/{iid}/runs/{rid}').json()
        if result['status'] not in ('ready','running'):break
        time.sleep(2)
    assert result['status']=='completed',{'status':result['status'],'error':result['job']['last_error']}
    idea=c.get('/ideas/'+iid).json()
    roles={a['role'] for a in idea['agent_results'] if a['result']['status']=='completed'}
    assert len(roles)==12,roles
    observations=next(s for s in result['steps'] if s['step_id']=='experiments')['result']['data']['observations']
    research=next(s for s in result['steps'] if s['step_id']=='research')['result']['data']
    assert len(observations)==12 and result['search_count']>=1
    assert all(v['provenance']=='demo' for v in idea['reports'][0]['content']['calculation']['variants'])
    assert idea['reports'][0]['content']['assessment']['recommendation']!='Развивать'
    print(json.dumps({'idea_id':iid,'run_id':rid,'roles':sorted(roles),'calls':result['call_count'],'search_count':result['search_count'],
        'search_urls':research['search']['urls'],'available_sources':sum(s['availability']=='available' for s in research['sources']),
        'observations':len(observations),'provenance':'demo'},ensure_ascii=False))
