import unittest
from unittest.mock import patch
from pydantic import ValidationError
from farm.autonomy import summarize_trials
from farm.autonomy_schemas import Intake, Understanding, ExperimentPlan
from farm.schemas import IdeaContent
from farm.workflow import definitions
from farm.config import load_configuration
from farm.runner_task import execute
from farm.autonomy import request_trial
import httpx
from time import perf_counter
import tempfile
from pathlib import Path
from farm import runner_jobs


class AutonomyTests(unittest.TestCase):
    def test_retry_preserves_success_and_unknown_outcome(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(runner_jobs,'DB',str(Path(folder)/'runner.sqlite')):
            with runner_jobs.database() as db:
                for suffix,state in [('a','completed'),('b','error'),('c','interrupted'),('d','cancelled')]:
                    db.execute('INSERT INTO requests VALUES(?,?,?,NULL)',('fixture:'+suffix,'hash',state))
                db.execute('INSERT INTO requests VALUES(?,?,?,NULL)',('other:error','hash','error'))
            self.assertEqual(runner_jobs.retry_errors('fixture:')['reset_count'],1)
            with runner_jobs.database() as db:
                self.assertEqual({r['id'] for r in db.execute('SELECT id FROM requests')},{'fixture:a','fixture:c','fixture:d','other:error'})

    def test_schema_repair_consumes_bounded_calls(self):
        req=httpx.Request('POST','http://runner')
        failed=httpx.Response(503,headers={'X-Farm-Retryable':'schema'},request=req)
        reset=httpx.Response(200,json={'ok':True},request=req)
        success=httpx.Response(200,json={'output':{'summary':'valid'}},request=req)
        config={'config_versions':{'BudgetPolicy':{'repair_cycles':2}}}
        with patch('farm.autonomy.guard') as guard,patch('farm.autonomy.httpx.post',side_effect=[failed,reset,success]),patch.dict('os.environ',{'RUNNER_TOKEN':'fixture','RUNNER_URL':'http://runner'}):
            result=request_trial(config,{'request_id':'fixture'},perf_counter(),60)
            self.assertEqual(result['output']['summary'],'valid')
            self.assertEqual(guard.call_count,2)
        with patch('farm.autonomy.guard') as guard,patch('farm.autonomy.httpx.post',side_effect=[failed,reset,failed,reset,failed]),patch.dict('os.environ',{'RUNNER_TOKEN':'fixture','RUNNER_URL':'http://runner'}):
            with self.assertRaises(httpx.HTTPStatusError):request_trial(config,{'request_id':'fixture'},perf_counter(),60)
            self.assertEqual(guard.call_count,3)

    def test_only_idea_is_required(self):
        value=Intake(description='Extract invoice totals from text',idempotency_key='technical-key')
        self.assertEqual(value.priority,1)
        self.assertNotIn('dataset_version_id',value.model_dump())

    def test_unclear_idea_requires_specific_question(self):
        with self.assertRaises(ValidationError):
            Understanding(card=IdeaContent(title='Idea'),can_research=False,questions=[],assumptions=[])

    def test_workflow_starts_before_dataset(self):
        config=load_configuration(); config['run_settings']={'autonomous':True}
        steps=definitions(config)
        self.assertEqual([s.id for s in steps],['transcription','understanding','research','planning','experiments','calculation','assessment','report'])
        self.assertEqual(steps[2].dependencies,['understanding'])
        self.assertEqual(steps[4].dependencies,['planning'])

    def test_latency_is_not_business_quality_or_effect(self):
        plan={'candidates':[{'id':'a','name':'Extract'}],'cases':[{},{}],'execution_limitations':[]}
        values=[{'solution_id':'a','task_id':str(i//3),'duration_ms':1000*(i+1),'success':True} for i in range(6)]
        value=summarize_trials(values,{'version':2},plan)['variants'][0]
        self.assertEqual(value['sample_size'],2)
        self.assertEqual(value['observation_count'],6)
        self.assertEqual(value['measured_chain_mean_seconds'],3.5)
        self.assertIsNone(value['quality'])
        self.assertIsNone(value['statistical'])
        self.assertEqual(value['scenarios'],{})
        self.assertEqual(value['provenance'],'demo')

    def test_no_execution_still_produces_honest_empty_measurement(self):
        plan={'candidates':[{'id':'a','name':'Physical experiment'}],'cases':[{},{}],'execution_limitations':['Needs hardware']}
        value=summarize_trials([],{'version':2},plan)['variants'][0]
        self.assertIsNone(value['measured_chain_mean_seconds'])
        self.assertEqual(value['observation_count'],0)

    def test_runner_accepts_extraction_without_classification(self):
        with patch('farm.runner_task.provider') as provider, patch('farm.runner_task.httpx.post') as rules:
            provider.return_value.chat.return_value={'output':{'amount':125.0,'currency':'EUR'},'model':'fixture','usage':{}}
            rules.return_value.json.return_value={'valid':True,'component_version':'fixture'}
            with patch.dict('os.environ',{'RULES_URL':'http://rules'}):
                result=execute({'kind':'trial','request_id':'trial','text':'Invoice total 125 EUR','prompt':'Extract amount and currency',
                    'output_fields':[{'name':'amount','label':'Сумма','type':'number'},{'name':'currency','label':'Валюта','type':'string'}],
                    'system':'fixture','provider_profile':{}})
            self.assertEqual(result['output'],{'amount':125.0,'currency':'EUR'})
            self.assertNotIn('label',result)
            self.assertEqual(rules.call_args.kwargs['json']['mode'],'schema')


if __name__=='__main__': unittest.main()
