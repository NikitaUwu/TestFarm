"""Disposable PostgreSQL + LangGraph contract test; provider/Runner are explicit fixtures."""
import os
import secrets
from uuid import uuid4
from unittest.mock import patch
import httpx
import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from fastapi.testclient import TestClient
from langgraph.checkpoint.postgres import PostgresSaver
from farm.api import app
from farm.db import connection
from farm.migrate import migrate
from farm.workflow import context, graph, StopRun
from farm.schemas import IdeaContent


def check():
    migrate()
    headers={'X-Farm-Request':'1'}
    with TestClient(app,headers=headers) as client, TestClient(app,headers=headers) as other:
        payload={'username':'autonomy.fixture','email':'auto@example.com','password':secrets.token_urlsafe(24)}
        assert client.post('/auth/register',json=payload).status_code==201
        assert other.post('/auth/register',json={**payload,'username':'second.fixture','email':'second@example.com'}).status_code==201
        idea_text='Summarize meeting notes and extract decisions. Unknown deadline must stay unknown.'
        intake={'description':idea_text,'idempotency_key':'same-request-key'}
        first=client.post('/intake',json=intake); assert first.status_code==201
        idea_id,run_id=first.json()['id'],first.json()['run_id']
        assert client.post('/intake',json=intake).json()['run_id']==run_id
        run=context(run_id); assert run['dataset_version_id'] is None
        assert run['idea']['transcript']==idea_text
        assert other.get(f'/ideas/{idea_id}/runs/{run_id}').status_code==404
        assert other.post(f'/ideas/{idea_id}/continue',json={'description':'attack','idempotency_key':'foreign-request','expected_version':1}).status_code==404
        assert client.post(f'/ideas/{idea_id}/continue',json={'description':'   ','idempotency_key':'empty-request','expected_version':1}).status_code==422
        plan={'scenario':'Summarize notes','task_type':'summarization','execution_limitations':['Synthetic test cases'],
              'candidates':[{'name':'Direct','approach':'Direct summary','prompt':'Summarize directly'}, {'name':'Extract first','approach':'Extract decisions first','prompt':'Extract then summarize'}],
              'output_fields':[{'name':'summary','type':'string','label':'Summary'}],
              'cases':[{'task_id':'a','input':'Meet on Monday','purpose':'Explicit date'},{'task_id':'b','input':'Meet later','purpose':'Unknown date'}],
              'success_criteria':['Never invent dates'],'mvp_acceptance':['Summarize different inputs'],
              'questions':['Can you provide real notes?'],'next_action':'Check real notes'}
        material={'summary':'Fixture research','sources':[],'claims':[],'alternatives':[],'personas':[],
                  'trends':[],'hypotheses':[],'objections':[],'gaps':['No real data'],'assumptions':[]}
        def chat(system,data,schema):
            output=({'card':IdeaContent(title='Meeting notes',transcript=idea_text).model_dump(),
                     'can_research':True,'questions':[],'assumptions':[]} if 'card' in schema['properties'] else plan)
            return {'output':output,'usage':{}}
        count=0
        def trial(url,headers,json,timeout):
            nonlocal count
            count+=1
            if count==3:raise httpx.ReadTimeout('Fixture outage')
            output={'request_id':json['request_id'],'duration_ms':10,'success':True,'output':{'summary':'Fixture result'},'timings':{}}
            return httpx.Response(200,json=output,request=httpx.Request('POST',url))
        with patch('farm.autonomy.provider') as provider, patch('farm.autonomy.research',return_value=material), patch('farm.autonomy.httpx.post',side_effect=trial):
            provider.return_value.chat.side_effect=chat
            with PostgresSaver.from_conn_string(os.environ['DATABASE_URL']) as saver:
                saver.setup(); workflow=graph(saver,run['config_versions']); options={'configurable':{'thread_id':run_id}}
                try:workflow.invoke({'run_id':run_id},options)
                except StopRun as exc:assert exc.status=='waiting_for_user'
                else:raise AssertionError('Outage not surfaced')
                with connection() as conn:
                    assert conn.execute('SELECT count(*) AS n FROM task_observations').fetchone()['n']==2
                    assert conn.execute('SELECT count(*) AS n FROM dataset_versions').fetchone()['n']==1
                # New graph instance + durable checkpoint. Completed trials/plan must not repeat.
                workflow=graph(saver,run['config_versions']); workflow.invoke(None,options)
                assert provider.return_value.chat.call_count==2
                assert count==13  # 12 successes + one interrupted request
                with connection() as conn:
                    assert conn.execute('SELECT count(*) AS n FROM task_observations').fetchone()['n']==12
                    report=conn.execute('SELECT content FROM reports WHERE run_id=%s',(run_id,)).fetchone()['content']
                    assert report['assessment']['recommendation']=='Недостаточно данных'
                    assert conn.execute('SELECT count(*) AS n FROM dataset_versions').fetchone()['n']==1
        correction={'description':'Only summarize decisions; do not infer tasks','idempotency_key':'correction-request','expected_version':1}
        continued=client.post(f'/ideas/{idea_id}/continue',json=correction); assert continued.status_code==201
        assert client.post(f'/ideas/{idea_id}/continue',json=correction).json()['run_id']==continued.json()['run_id']
        assert client.post(f'/ideas/{idea_id}/continue',json={**correction,'idempotency_key':'stale-version-key'}).status_code==409
        assert context(run_id)['stale']
        detail=client.get(f'/ideas/{idea_id}').json()
        assert detail['current_version']==2 and len(detail['reports'])==1
        assert len(detail['runs'])==2 and len(detail['datasets'])==1
    print('PASS: idea-only intake, idempotence, ownership, persisted plan, 12 typed trials, checkpoint recovery, honest report, correction/new version/stale/history. AI and Runner fixtures only.')


if __name__=='__main__':
    original=os.environ['DATABASE_URL']; name='farm_autonomy_test_'+uuid4().hex
    with psycopg.connect(original,autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        try:
            os.environ['DATABASE_URL']=make_conninfo(original,dbname=name);check()
        finally:
            os.environ['DATABASE_URL']=original
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))
