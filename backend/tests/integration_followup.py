"""Real post-report checks: stale, independent reuse, metric queue and projection."""
import os
import json
import time
from uuid import uuid4
import httpx

IDEA=os.environ['TEST_IDEA_ID']


def run():
    with httpx.Client(base_url='http://api:8000',headers={'X-Farm-Request':'1'},timeout=60) as client:
        assert client.post('/auth/login',json={'identifier':'demo','password':os.environ['REVIEWER_PASSWORD']}).is_success
        idea=client.get('/ideas/'+IDEA).json(); before=idea['reports'][0]
        assert before['content']['assessment']['recommendation']=='Недостаточно данных'
        assert len(before['content']['calculation']['variants'])==2
        assert all(v['observation_count']==6 and v['sample_size']==2 for v in before['content']['calculation']['variants'])
        version=client.put('/ideas/'+IDEA,json={**idea['content'],'title':idea['title']+' · редакционная правка','expected_version':idea['current_version']})
        assert version.is_success
        changed=client.get('/ideas/'+IDEA).json(); assert all(r['stale'] for r in changed['reports'])
        prior=idea['runs'][0]; config=prior['config_versions']; dataset=prior['dataset_version_id']
        with __import__('farm.db',fromlist=['connection']).connection() as conn:
            solutions=conn.execute('SELECT content FROM solution_candidates WHERE id=ANY(%s::uuid[]) ORDER BY content->>\'name\'',(prior['solution_versions'],)).fetchall()
        request={'idempotency_key':str(uuid4()),'dataset_version_id':str(dataset),'variant_prompts':[s['content']['prompt'] for s in solutions],**config['run_settings']}
        new=client.post('/ideas/'+IDEA+'/runs',json=request);assert new.is_success
        rid=new.json()['id']; deadline=time.monotonic()+240
        while time.monotonic()<deadline:
            state=client.get(f'/ideas/{IDEA}/runs/{rid}').json()
            if state['status'] not in ('ready','running'): break
            time.sleep(2)
        assert state['status']=='completed', {'status':state['status'],'error':state['job']['last_error']}
        experiment=next(s for s in state['steps'] if s['step_id']=='experiments')
        assert experiment['reused_from'] and experiment['result']['call_count']==0
        assert not state['experiments'], 'independent experiments repeated'
        observed=client.post('/ideas/'+IDEA+'/observations',json={'metric':'monthly_volume','target':800,'actual':1200,'unit':'tasks/month','source':'Synthetic observation for integration test','monthly_volume':1200})
        assert observed.is_success and observed.json()['status']=='ready'
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            current=client.get('/ideas/'+IDEA).json()
            if current['metric_jobs'][0]['status']!='ready':break
            time.sleep(1)
        assert current['metric_jobs'][0]['status']=='completed'
        assert current['reports'][0]['content']['changed_inputs']['monthly_volume']==1200
        assert current['reports'][0]['version']>1
        print(json.dumps({'checks':['demo_not_develop','raw_observation_counts','stale_preserves_report','cross_run_experiment_reuse','metric_queue','new_calculation_and_report'],'idea_id':IDEA,'run_id':rid,'calls':state['call_count']},ensure_ascii=False))


if __name__=='__main__':run()
