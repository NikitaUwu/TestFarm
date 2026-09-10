"""Common envelope for research roles, structure and implementation operations."""
from .db import connection, uid, Jsonb
from .schemas import StepDefinition, StepResult
from .step_inputs import fingerprint


def record(idea_id, role, inputs, data, *, run_id=None, operation_id=None, input_version='',
           duration_ms=0, calls=0, status='completed', errors=None, source_step=None, artifact_refs=None):
    operation_id=operation_id or uid()
    definition=StepDefinition(id=role,version=2,role=[role],goal=role,trigger='validated_input',
        input_schema={'type':'object','required':list(inputs),'properties':{k:{} for k in inputs},'additionalProperties':False},output_schema=StepResult.model_json_schema(),
        tools=['provider.chat'] if calls else ['validated_artifact.read'],
        permissions=['read_selected_inputs','write_own_result'],dependencies=[source_step] if source_step else [],
        entry_conditions=['input_version_exists','authorized_operation'],
        completion_conditions=['schema_valid','source_references_saved'],validation=['pydantic','input_hash'],
        timeout=1800,retries=2,call_limit=4,token_computation_limit={'output_tokens':6000},
        next_step_rules={'completed':'dependent_step','error':'bounded_repair','cancelled':'stop',
                         'waiting_for_user':'await_input','waiting_for_data':'await_data'})
    result=StepResult(idea_id=str(idea_id),run_id=str(run_id or operation_id),step_id=role,
        input_version=str(input_version),status=status,conclusion=data.get('conclusion',role+' — результат сохранён'),
        evidence=data.get('claims',[]),assumptions=data.get('assumptions',[]) if isinstance(data.get('assumptions',[]),list) else [],
        errors=errors or [],duration_ms=duration_ms,call_count=calls,measured_metrics=[],
        artifact_refs=artifact_refs or [],data={**data,'source_step':source_step,
            'execution':'shared_validated_result' if source_step else 'operation'})
    identifier=uid()
    with connection() as conn:
        # Retries can reach this point again after a durable result was committed.
        if status=='completed':
            existing=conn.execute("SELECT id FROM agent_results WHERE idea_id=%s AND role=%s AND input_hash=%s AND run_id IS NOT DISTINCT FROM %s AND (run_id IS NOT NULL OR operation_id=%s) AND result->>'status'='completed'",(idea_id,role,fingerprint(inputs),run_id,operation_id)).fetchone()
            if existing:return str(existing['id'])
        conn.execute('INSERT INTO agent_results(id,idea_id,run_id,operation_id,role,input_hash,definition,inputs,result) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
            (identifier,idea_id,run_id,operation_id,role,fingerprint(inputs),Jsonb(definition.model_dump()),Jsonb(inputs),Jsonb(result.model_dump())))
    return identifier


def research_roles(run, data):
    extra=data.get('role_analysis',{})
    outputs={
        'market_analyst':{'alternatives':data['alternatives'],'claims':data['claims']},
        'strategist':{'trends':data['trends'],'development_options':extra.get('development_options',[]),'contradictions':data['objections']},
        'business_consultant':{'process_fit':extra.get('process_fit','Нет данных'),'adoption_constraints':extra.get('adoption_constraints',[])},
        'product_marketer':{'personas':data['personas'],'positioning':extra.get('positioning','Нет данных'),'hypotheses':data['hypotheses']},
        'researcher':{'synthetic_objections':data['objections'],'gaps':data['gaps'],'next_experiment':data['next_experiment']},
        'ux_analyst':{'scenarios':extra.get('ux_scenarios',[]),'states':extra.get('ux_states',[])}}
    for role, output in outputs.items():
        record(run['idea_id'],role,{'idea':run['idea'],'source_ids':[s['id'] for s in data['sources']],
               'responsibility':role,'provider':run['config_versions']['ProviderProfile']},output,
               run_id=run['id'],input_version=run['idea_version_id'],source_step='research')
