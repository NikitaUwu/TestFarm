import copy
import unittest
from farm.step_inputs import fingerprint,step_inputs


class DependencyTests(unittest.TestCase):
    def test_new_process_measurements_invalidate_calculation(self):
        run={'dataset_version_id':'d','config_versions':{'EffectModel':{'version':2}},'process_measurements':[]}
        changed=copy.deepcopy(run);changed['process_measurements']=[{'id':'m','seconds':3}]
        self.assertNotEqual(fingerprint(step_inputs('calculation',run,{})),fingerprint(step_inputs('calculation',changed,{})))
    def setUp(self):
        self.run={'idea':{'title':'Исходное название'},'dataset_version_id':'d1','solution_versions':['a1','b1'],
                  'config_versions':{'PromptSet':{'boundary':'boundary','classify':'classify'},'ProviderProfile':{'model':'m1'},
                    'run_settings':{'source_urls':[],'thresholds':{}},'BudgetPolicy':{'experiment_repetitions':3}}}

    def test_editorial_change_reuses_experiments_but_invalidates_research(self):
        changed=copy.deepcopy(self.run); changed['idea']['title']='Новое название'
        self.assertEqual(step_inputs('experiments',self.run,{}),step_inputs('experiments',changed,{}))
        self.assertNotEqual(fingerprint(step_inputs('research',self.run,{})),fingerprint(step_inputs('research',changed,{})))

    def test_changed_dataset_or_solution_invalidates_experiments(self):
        original=fingerprint(step_inputs('experiments',self.run,{}))
        for key,value in [('dataset_version_id','d2'),('solution_versions',['a2','b1'])]:
            changed=copy.deepcopy(self.run); changed[key]=value
            self.assertNotEqual(original,fingerprint(step_inputs('experiments',changed,{})))
