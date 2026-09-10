"""Real isolated JS execution and cancellation. Fixtures do not prove model quality."""
import json,os,time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import httpx


def run():
    endpoint=os.environ['RUNNER_URL'];headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']}
    field=lambda name:{'name':name,'label':name,'type':'number'}
    program={'title':'Тест вычисления','scenario':'Умножение количества на извлечённую цену',
        'input_fields':[field('quantity')],'ai_fields':[field('price')],'output_fields':[field('total')],
        'ai_prompt':'Извлеки цену','javascript':'function transform(input, ai){return {total:input.quantity*ai.price};}',
        'tests':[{'input_json':'{"quantity":2}','ai_json':'{"price":3}','expected_json':'{"total":6}'},
                 {'input_json':'{"quantity":4}','ai_json':'{"price":5}','expected_json':'{"total":20}'}]}
    prefix=str(uuid4());body={'request_id':prefix+':validate','program':program}
    with httpx.Client(timeout=20,headers=headers) as c:
        first=c.post(endpoint+'/program/validate',json=body);first.raise_for_status()
        assert first.json()['success'] and not first.json()['replayed']
        second=c.post(endpoint+'/program/validate',json=body);second.raise_for_status()
        assert second.json()['replayed'] and second.json()['tests']==first.json()['tests']
        changed={**body,'program':{**program,'title':'Другой вход'}}
        assert c.post(endpoint+'/program/validate',json=changed).status_code==409
        infinite={**body,'request_id':prefix+':cancel','program':{**program,'javascript':'function transform(){while(true){}}'}}
        with ThreadPoolExecutor(1) as pool:
            pending=pool.submit(c.post,endpoint+'/program/validate',json=infinite)
            time.sleep(.15)
            cancel_start=time.monotonic()
            cancelled=c.post(endpoint+'/cancel',json={'prefix':prefix+':cancel'});cancelled.raise_for_status()
            response=pending.result(timeout=5)
            assert response.status_code==503 and 'cancelled' in response.json()['detail'],response.text
            elapsed=time.monotonic()-cancel_start
        assert c.post(endpoint+'/purge',json={'prefix':prefix}).is_success
        print(json.dumps({'checks':['real_javascript','two_distinct_inputs','durable_replay','conflicting_id_rejected','active_process_killed','result_cleanup'],
                          'cancel_seconds':round(elapsed,3),'provenance':'test_fixture'},ensure_ascii=False))


if __name__=='__main__':run()
