"""Only substantive dependencies participate in a step's cache identity."""
import hashlib
import json


def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,default=str,ensure_ascii=False).encode()).hexdigest()


def step_inputs(name,run,dependencies):
    config=run['config_versions']
    common={'step_version':1,'step_id':name,'dependencies':dependencies}
    if name=='research':
        return {**common,'idea':run['idea'],'prompts':config['PromptSet'],'provider':config['ProviderProfile'],
                'sources':config['run_settings']['source_urls'],'thresholds':config['run_settings']['thresholds']}
    if name=='experiments':
        return {'step_version':1,'step_id':name,'dataset_version':str(run['dataset_version_id']),
                'solutions':run['solution_versions'],'repetitions':config['BudgetPolicy']['experiment_repetitions'],
                'system':config['PromptSet']['boundary'],'classify':config['PromptSet']['classify']}
    if name=='calculation': return {**common,'effect_model':config['EffectModel'],'dataset_version':str(run['dataset_version_id']),
                                    'process_measurements':run.get('process_measurements',[])}
    if name=='assessment':
        return {**common,'profile':config['AssessmentProfile'],'evidence':config['EvidencePolicy'],'thresholds':config['run_settings']['thresholds'],'blockers':config['run_settings']['hard_blockers']}
    return {**common,'run_id':str(run['id']),'idea_version':str(run['idea_version_id']),'config':config}
