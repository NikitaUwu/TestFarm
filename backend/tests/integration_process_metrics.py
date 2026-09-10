"""HTTP timer, authorization, immutable calculation and report; no provider calls."""
import os,json,time
import httpx


def run():
    idea_id='687a7d74-e78c-47ba-9b13-d4a33d846ebd'
    with httpx.Client(base_url='http://api:8000',headers={'X-Farm-Request':'1'},timeout=30) as c:
        c.post('/auth/login',json={'role':'reviewer','password':os.environ['REVIEWER_PASSWORD']}).raise_for_status()
        idea=c.get('/ideas/'+idea_id).json(); previous=idea['reports'][0]
        latest=idea['runs'][0]
        dataset=next(d for d in idea['datasets'] if d['version_id']==latest['dataset_version_id'])
        body={'dataset_version_id':dataset['version_id'],'task_id':dataset['content']['rows'][0]['task_id'],
              'phase':'manual_review','solution_id':latest['solution_versions'][0],
              'source':'Integration timer fixture; no business operation performed','provenance':'demo'}
        bad=c.post(f'/ideas/{idea_id}/process-sessions',json={**body,'task_id':'unknown-test-task'})
        assert bad.status_code==422
        response=c.post(f'/ideas/{idea_id}/process-sessions',json=body);response.raise_for_status()
        session_id=response.json()['id']
        assert c.post(f'/ideas/{idea_id}/process-sessions',json=body).status_code==409
        time.sleep(.25)
        url=f'/ideas/{idea_id}/process-sessions/{session_id}/stop'
        stopped=c.post(url);stopped.raise_for_status();seconds=stopped.json()['seconds']
        assert seconds>=.25 and stopped.json()['provenance']=='demo'
        assert c.post(url).json()['seconds']==seconds
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            current=c.get('/ideas/'+idea_id).json()
            if current['reports'][0]['id']!=previous['id']:break
            time.sleep(.5)
        assert current['reports'][0]['id']!=previous['id'],current['metric_jobs'][0]
        report=current['reports'][0]['content'];calc=report['calculation']
        assert report['versions']['effect_model_version']==calc['effect_model_version']
        assert calc['effect_model_version']['version']==2
        assert any(m['id']==session_id for m in calc['assumptions']['process_measurements'])
        assert all(v['process_measurement_coverage']['manual_review']==0 for v in calc['variants'])
        assert next(p for p in current['reports'] if p['id']==previous['id'])['content']==previous['content']
        print(json.dumps({'checks':['task_version_validation','one_active_timer','server_elapsed_time','idempotent_stop',
            'demo_excluded_from_measured','new_calculation_and_report','consistent_effect_model_version','old_report_immutable'],
            'seconds':round(seconds,3),'provenance':'test_fixture'},ensure_ascii=False))


if __name__=='__main__':run()
