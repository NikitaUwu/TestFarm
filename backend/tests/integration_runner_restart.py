"""Prepare/verify the same real JS request across a forced Runner container crash."""
import os,json,time
import httpx

field=lambda name:{'name':name,'label':name,'type':'number'}
program={'title':'Crash recovery fixture','scenario':'Add two numbers','input_fields':[field('a')],
         'ai_fields':[field('b')],'output_fields':[field('total')],'ai_prompt':'Fixture only',
         'javascript':'function transform(input, ai){return {total:input.a+ai.b};}',
         'tests':[{'input_json':'{"a":2}','ai_json':'{"b":3}','expected_json':'{"total":5}'},
                  {'input_json':'{"a":4}','ai_json':'{"b":7}','expected_json':'{"total":11}'}]}
with httpx.Client(base_url=os.environ['RUNNER_URL'],headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']},timeout=10) as c:
    for attempt in range(30):
        try:c.get('/health').raise_for_status();break
        except httpx.HTTPError:
            if attempt==29:raise
            time.sleep(.2)
    result=c.post('/program/validate',json={'request_id':os.environ['TEST_RUNNER_ID']+':restart','program':program})
    result.raise_for_status();data=result.json()
    assert data['success'] and all(t['passed'] for t in data['tests'])
    verify=os.environ['TEST_RESTART_PHASE']=='verify'
    assert data['replayed']==verify
    if verify:c.post('/purge',json={'prefix':os.environ['TEST_RUNNER_ID']}).raise_for_status()
    print(json.dumps({'phase':os.environ['TEST_RESTART_PHASE'],'replayed':data['replayed'],'actual_outputs':[t['actual'] for t in data['tests']]}))
