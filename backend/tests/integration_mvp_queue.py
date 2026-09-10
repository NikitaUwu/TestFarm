"""MVP queue/API acceptance in a restored DB, with an explicit synthetic gate fixture.

The artificial report/decision is solely a test precondition, never a product
recommendation or the user's decision. Real Groq/Runner/Rules calls are used.
"""
import os,json,subprocess,sys
from uuid import uuid4
from psycopg.conninfo import make_conninfo
from fastapi.testclient import TestClient

assert os.environ['TEST_RESTORE_DB'].startswith('farm_restore_')
os.environ['DATABASE_URL']=make_conninfo(os.environ['DATABASE_URL'],dbname=os.environ['TEST_RESTORE_DB'])
from farm.api import app
from farm.db import connection,uid,Jsonb

with TestClient(app,headers={'X-Farm-Request':'1'}) as c:
    c.post('/auth/login',json={'identifier':'demo','password':os.environ['REVIEWER_PASSWORD']}).raise_for_status()
    idea=c.post('/ideas',json={'title':'TEST FIXTURE — заказ и итог','transcript':'Извлечь количество и цену из текста заказа и вычислить итог. Только техническая проверка.',
        'problem':'Извлечение quantity и unit_price из order_text; total = quantity * unit_price','priority':0})
    idea.raise_for_status();iid=idea.json()['id']
    dataset=c.post(f'/ideas/{iid}/datasets',json={'name':'Fixture','source':'Synthetic gate precondition, not evidence','period':'test','provenance':'demo',
        'labels':['a','b'],'rows':[{'task_id':'1','input':'3 по 120','expected_label':'a'},{'task_id':'2','input':'2 по 75','expected_label':'b'}]})
    dataset.raise_for_status()
    run=c.post(f'/ideas/{iid}/runs',json={'dataset_version_id':dataset.json()['version_id'],'variant_prompts':['fixture a','fixture b'],
        'idempotency_key':str(uuid4()),'thresholds':{},'source_urls':[],'hard_blockers':[]});run.raise_for_status();rid=run.json()['id']
    report_id=uid();report={'test_fixture':True,'assessment':{'recommendation':'Недостаточно данных'}}
    with connection() as db:
        db.execute("UPDATE research_runs SET status='completed' WHERE id=%s",(rid,))
        db.execute("UPDATE jobs SET status='completed' WHERE run_id=%s",(rid,))
        db.execute('INSERT INTO reports(id,run_id,version,content) VALUES(%s,%s,1,%s)',(report_id,rid,Jsonb(report)))
    endpoint=f'/ideas/{iid}/reports/{report_id}/decision'
    assert c.post(endpoint,json={'decision':'Развивать','reason':'Fixture'}).status_code==409
    report['assessment']['recommendation']='Развивать'
    with connection() as db:db.execute('UPDATE reports SET content=%s WHERE id=%s',(Jsonb(report),report_id))
    assert c.post(endpoint,json={'decision':'Развивать','reason':'Fixture'}).status_code==422
    criteria=['Единственное поле ввода: string order_text.','Поля ИИ: number quantity и number unit_price.',
              'Единственное поле вывода: number total = quantity * unit_price.','Для 3 по 120 результат 360, для 2 по 75 результат 150.']
    c.post(endpoint,json={'decision':'Развивать','reason':'AUTOMATED TEST FIXTURE, not a user product decision','acceptance':criteria}).raise_for_status()
    subprocess.run([sys.executable,'-c','from farm.worker import tick; tick()'],check=True,timeout=240)
    with connection() as db:
        job=db.execute('SELECT j.* FROM mvp_jobs j JOIN mvp_builds b ON b.id=j.build_id WHERE b.idea_id=%s',(iid,)).fetchone()
        assert job['status']=='completed',job['error']
        version=db.execute('SELECT * FROM mvp_versions WHERE build_id=%s ORDER BY version DESC LIMIT 1',(job['build_id'],)).fetchone();vid=str(version['id'])
        assert db.execute("SELECT 1 FROM agent_results WHERE idea_id=%s AND role='implementation_agent' AND result->>'status'='completed'",(iid,)).fetchone()
    base=f'/ideas/{iid}/mvp/{vid}'
    assert c.post(base+'/accept').status_code==409
    assert c.post(base+'/run',json={'input':{'order_text':17}}).status_code==422
    outputs=[]
    for text,expected in [('3 блокнота по 120 рублей',360),('2 блокнота по 75 рублей',150)]:
        result=c.post(base+'/run',json={'input':{'order_text':text}});result.raise_for_status()
        assert result.json()['output']['total']==expected
        outputs.append(result.json()['output'])
    assert len(c.get(base+'/results').json())==2
    c.post(base+'/accept').raise_for_status()
    assert c.get('/ideas/'+iid).json()['stage']=='mvp_ready'
    print(json.dumps({'test_database':os.environ['TEST_RESTORE_DB'],'idea_id':iid,'version_id':vid,'generation_calls':job['call_count'],
        'outputs':outputs,'checks':['recommendation_gate','acceptance_required','separate_worker_build','implementation_contract',
                                  'input_validation','real_runs_persisted','accept_before_run_denied','accept_after_run'],
        'provenance':'synthetic_gate_fixture_not_user_decision'},ensure_ascii=False))
