import unittest
import numpy as np
from farm.calculation import paired_bootstrap,total_time,potential,calculate


class CalculationTests(unittest.TestCase):
    def test_actual_human_time_replaces_estimate_without_double_counting(self):
        dataset={'source':'fixture','period':'test','provenance':'measured','rows':[
            {'task_id':str(i),'baseline_seconds':20,'baseline_correct':True,'expected_label':'a','manual_review_seconds':8,'error_correction_seconds':9} for i in range(2)]}
        observations=[{'solution_id':'s','task_id':str(i),'duration_ms':2000,'success':True,'label':'a','needs_review':True} for i in range(2)]
        sessions=[{'solution_id':'s','task_id':str(i),'phase':phase,'seconds':seconds,'provenance':'measured'} for i in range(2) for phase,seconds in [('manual_review',3),('input',1)]]
        model={'confidence_level':.95,'resamples':100,'seed':1,'monthly_volume':1,'coverage':1}
        r=calculate(dataset,observations,model,{'process_measurements':sessions})['variants'][0]
        self.assertEqual(r['variant_mean_seconds'],6)
        self.assertEqual(r['statistical']['point_estimate'],14)
        self.assertEqual(r['scenarios']['base']['effective_seconds_per_task'],6)
        self.assertAlmostEqual(r['scenarios']['base']['monthly_hours'],14/3600)
    def test_constant_paired_difference(self):
        result=paired_bootstrap([10,20,30],[7,17,27],resamples=1000,seed=7)
        self.assertEqual(result['point_estimate'],3)
        self.assertEqual((result['lower_bound'],result['upper_bound']),(3,3))

    def test_deterioration_is_negative(self):
        result=paired_bootstrap([2,3],[4,5],resamples=1000)
        self.assertEqual(result['upper_bound'],-2)

    def test_seed_reproducible(self):
        self.assertEqual(paired_bootstrap([10,12,30],[8,10,11],resamples=300),paired_bootstrap([10,12,30],[8,10,11],resamples=300))

    def test_invalid_observations(self):
        for a,b in [([1],[1]),([1,2],[1]),([1,float('nan')],[1,2]),([-1,2],[1,2])]:
            with self.assertRaises(ValueError): paired_bootstrap(a,b)

    def test_full_time_with_conditional_and_parallel_paths(self):
        result=total_time({'input':2,'a':10,'b':6,'review':{'seconds':20,'probability':.25}},[['a','b']])
        self.assertEqual(result,17)

    def test_double_counted_path_rejected(self):
        with self.assertRaises(ValueError): total_time({'a':10,'b':6},[['a','b'],['a']])

    def test_expected_manual_work_reduces_potential(self):
        cheap=potential(60,10,1000,.9,.8,.1,30,60)
        expensive=potential(60,10,1000,.9,.8,.5,30,60)
        self.assertLess(expensive['monthly_hours'],cheap['monthly_hours'])

    def test_zero_volume(self):
        self.assertEqual(potential(60,10,0,1,1,0,0,0)['monthly_hours'],0)

    def test_repeat_count_is_not_sample_size(self):
        dataset={'source':'test fixture','period':'test','provenance':'demo','rows':[
            {'task_id':str(i),'baseline_seconds':10,'baseline_correct':True,'expected_label':'a','manual_review_seconds':0,'error_correction_seconds':0} for i in range(2)]}
        observations=[{'solution_id':'A','task_id':str(i),'duration_ms':2000,'success':True,'label':'a','needs_review':False} for i in range(2) for _ in range(3)]
        model={'confidence_level':.95,'resamples':100,'seed':1,'monthly_volume':1000,'coverage':.8}
        result=calculate(dataset,observations,model)['variants'][0]
        self.assertEqual(result['sample_size'],2)
        self.assertEqual(result['observation_count'],6)
        self.assertEqual(result['statistical']['point_estimate'],8)

    def test_failed_runs_count_against_quality(self):
        dataset={'source':'test','period':'test','provenance':'demo','rows':[{'task_id':'a','baseline_seconds':None,'baseline_correct':None,'expected_label':'x','manual_review_seconds':0,'error_correction_seconds':0}]}
        result=calculate(dataset,[{'solution_id':'s','task_id':'a','duration_ms':100,'success':False}],{})['variants'][0]
        self.assertEqual(result['quality'],0)
        self.assertEqual(result['missing_fraction'],1)
        self.assertIsNone(result['statistical'])

    def test_manual_assumptions_do_not_rewrite_measured_chain(self):
        dataset={'source':'test','period':'test','provenance':'demo','rows':[
            {'task_id':str(i),'baseline_seconds':10,'baseline_correct':True,'expected_label':'x','manual_review_seconds':12,'error_correction_seconds':0} for i in range(2)]}
        observations=[{'solution_id':'s','task_id':str(i),'duration_ms':2000,'success':True,'label':'x','needs_review':True} for i in range(2)]
        model={'confidence_level':.95,'resamples':100,'seed':1,'monthly_volume':1000,'coverage':1}
        result=calculate(dataset,observations,model,{'quality':.5,'manual_review_rate':.7})['variants'][0]
        self.assertEqual(result['measured_chain_effect']['point_estimate'],8)
        self.assertEqual(result['statistical']['point_estimate'],-4)
        self.assertEqual(result['quality'],1)
        self.assertEqual(result['decision_quality'],.5)
        self.assertEqual(result['decision_manual_review_rate'],.7)
        self.assertEqual(result['decision_metric_sources']['quality'],'business_observation')


if __name__=='__main__': unittest.main()
