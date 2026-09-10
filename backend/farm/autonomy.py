"""Idea-first workflow: derived artifacts, bounded real trials, honest evidence gaps."""
import os
from time import perf_counter
from collections import defaultdict
import httpx
import numpy as np
from .db import connection, uid, Jsonb
from .providers import provider
from .autonomy_schemas import Understanding, ExperimentPlan
from .programs import ProgramField, validate_fields
from .workflow import guard, StopRun, data_for, research, assessment, report, save_calculation


def transcription(run):
    if run['submitted_idea']['transcript'].strip():
        return {'transcript':run['submitted_idea']['transcript'],'source':'user_text'}
    from . import storage
    from .media import inspect_audio
    import json
    with connection() as conn:
        audio=conn.execute("SELECT * FROM artifacts WHERE run_id=%s AND kind='audio'",(run['id'],)).fetchone()
        previous=conn.execute("SELECT * FROM artifacts WHERE run_id=%s AND kind='transcript'",(run['id'],)).fetchone()
    if previous:
        return json.loads(storage.client().get_object(Bucket=storage.bucket(),Key=previous['object_key'])['Body'].read())
    if not audio: raise StopRun('waiting_for_data','Опишите идею текстом или добавьте голосовую запись')
    data=storage.client().get_object(Bucket=storage.bucket(),Key=audio['object_key'])['Body'].read()
    duration,wav,mime,filename=inspect_audio(data)
    guard(run,True)
    text=provider(run['config_versions']['ProviderProfile']).transcribe(wav,filename,mime)
    if not isinstance(text,str) or not text.strip() or len(text)>20000: raise ValueError('Не удалось получить допустимую расшифровку')
    artifact_id=uid(); key=audio['object_key']+'-transcript'
    result={'transcript':text,'source':'speech_transcription','audio_artifact_id':str(audio['id']),
            'transcript_artifact_id':artifact_id,'duration':duration}
    encoded=json.dumps(result,ensure_ascii=False).encode('utf-8')
    storage.put(key,encoded,'application/json')
    with connection() as conn:
        conn.execute('INSERT INTO artifacts(id,idea_id,run_id,object_key,mime,size,kind) VALUES(%s,%s,%s,%s,%s,%s,%s)',(artifact_id,run['idea_id'],run['id'],key,'application/json',len(encoded),'transcript'))
    return result


def understanding(run):
    config=run['config_versions']
    guard(run,True)
    response=provider(config['ProviderProfile']).chat(config['PromptSet']['boundary']+'\n'+config['PromptSet']['autonomous_understanding'],
        {'idea':run['raw_idea']},Understanding.model_json_schema())
    result=Understanding.model_validate(response['output']).model_dump()
    result['card']['transcript']=run['raw_idea']['transcript']
    result['usage']=response.get('usage',{})
    return result


def investigate(run):
    interpreted=data_for(run['id'],'understanding')
    if not interpreted['can_research']:
        raise StopRun('waiting_for_data',' '.join(interpreted['questions']))
    return research(run)


def planning(run):
    # Artifact and all foreign keys are committed together before the step checkpoint.
    if run.get('autonomy_plan'): return run['autonomy_plan']
    config=run['config_versions']; guard(run,True)
    material=data_for(run['id'],'research')
    # The planner consumes conclusions, not full downloaded web pages or raw search output.
    research_brief={'summary':material.get('summary','')[:2000],
                    'alternatives':[{'name':a.get('name','')[:200],'applicability':a.get('applicability','')[:500]} for a in material.get('alternatives',[])[:5]],
                    'gaps':[str(g)[:300] for g in material.get('gaps',[])[:5]]}
    response=provider(config['ProviderProfile']).chat(config['PromptSet']['boundary']+'\n'+config['PromptSet']['autonomous_planning'],
        {'idea':run['idea'],'research':research_brief,
         'policy':config['AutonomyPolicy'],'budget':config['BudgetPolicy']},ExperimentPlan.model_json_schema())
    result=ExperimentPlan.model_validate(response['output']).model_dump()
    # Limits are policy-owned, never expanded by generated instructions.
    result['candidates']=result['candidates'][:config['AutonomyPolicy']['trial_variants']]
    result['cases']=result['cases'][:config['AutonomyPolicy']['trial_cases']]
    calls=len(result['candidates'])*len(result['cases'])*config['BudgetPolicy']['experiment_repetitions']
    with connection() as conn:
        current=conn.execute('SELECT call_count,autonomy_plan FROM research_runs WHERE id=%s FOR UPDATE',(run['id'],)).fetchone()
        if current['autonomy_plan']: return current['autonomy_plan']
        if current['call_count']+calls>config['BudgetPolicy']['llm_calls']:
            raise StopRun('waiting_for_user','На прогоны не хватает оставшегося лимита ИИ-вызовов. План сохранится после продолжения с доступным бюджетом.')
        dataset_id,version_id=uid(),uid()
        dataset={'kind':'text_trial','name':'Примеры для технической проверки','provenance':'demo',
                 'source':'Примеры подготовлены агентом по идее; не реальные обращения и не измерения исходного процесса',
                 'period':'Текущий технический прогон','labels':[],
                 'rows':[dict(case,baseline_seconds=None) for case in result['cases']]}
        conn.execute('INSERT INTO datasets(id,idea_id,name) VALUES(%s,%s,%s)',(dataset_id,run['idea_id'],dataset['name']))
        conn.execute('INSERT INTO dataset_versions(id,dataset_id,version,content) VALUES(%s,%s,1,%s)',(version_id,dataset_id,Jsonb(dataset)))
        solutions=[]
        for candidate in result['candidates']:
            identifier=uid(); solutions.append(identifier)
            candidate['id']=identifier
            candidate['provider']=config['ProviderProfile']
            candidate['output_fields']=result['output_fields']
            candidate['component_versions']={'runner':'2.1.0','rules':'1.1.0'}
            conn.execute('INSERT INTO solution_candidates(id,idea_id,version,content) VALUES(%s,%s,1,%s)',(identifier,run['idea_id'],Jsonb(candidate)))
        result['dataset_version_id']=version_id
        result['provenance']='agent_plan_with_synthetic_cases'
        result['usage']=response.get('usage',{})
        conn.execute('UPDATE research_runs SET dataset_version_id=%s,solution_versions=%s,autonomy_plan=%s WHERE id=%s',
                     (version_id,Jsonb(solutions),Jsonb(result),run['id']))
    return result


def request_trial(run,payload,started,timeout):
    headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']}
    for repair in range(run['config_versions']['BudgetPolicy']['repair_cycles']+1):
        guard(run,True)
        remaining=timeout-(perf_counter()-started)
        if remaining<=0: raise StopRun('error','Достигнут лимит длительности прогона')
        response=httpx.post(os.environ['RUNNER_URL']+'/trial/run',headers=headers,json=payload,timeout=min(170,remaining))
        if response.status_code==503 and response.headers.get('X-Farm-Retryable')=='schema' and repair<run['config_versions']['BudgetPolicy']['repair_cycles']:
            httpx.post(os.environ['RUNNER_URL']+'/retry-errors',headers=headers,json={'prefix':payload['request_id']},timeout=5).raise_for_status()
            continue
        response.raise_for_status()
        return response.json()


def trials(run):
    config=run['config_versions']; plan=data_for(run['id'],'planning')
    if plan['task_type']=='not_executable':
        return {'observations':[], 'limitations':plan['execution_limitations'],
                'conclusion':'Для проверки нужен внешний доступ или действие человека; технический успех не заявляется'}
    observations=[]; started=perf_counter(); timeout=config['BudgetPolicy']['experiment_timeout_seconds']
    for solution in run['solutions']:
        with connection() as conn:
            prior=conn.execute('SELECT id FROM experiment_runs WHERE run_id=%s AND solution_id=%s',(run['id'],solution['id'])).fetchone()
            experiment_id=str(prior['id']) if prior else uid()
            if not prior:
                conn.execute('INSERT INTO experiment_runs(id,run_id,solution_id,dataset_version_id,status,content) VALUES(%s,%s,%s,%s,%s,%s)',
                             (experiment_id,run['id'],solution['id'],run['dataset_version_id'],'running',Jsonb({'scenario':plan['scenario'],'solution':solution['content'],'provenance':'demo'})))
        for case in run['dataset']['rows']:
            for repetition in range(config['BudgetPolicy']['experiment_repetitions']):
                guard(run)
                with connection() as conn:
                    prior=conn.execute('SELECT content FROM task_observations WHERE experiment_id=%s AND task_id=%s AND repetition=%s',(experiment_id,case['task_id'],repetition)).fetchone()
                if prior:
                    observations.append(prior['content']); continue
                if perf_counter()-started>=timeout: raise StopRun('error','Достигнут лимит длительности прогона')
                request_id=f'{experiment_id}:{case["task_id"]}:{repetition}'
                t=perf_counter()
                try:
                    observation=request_trial(run,{'request_id':request_id,'text':case['input'],'prompt':solution['content']['prompt'],
                              'output_fields':plan['output_fields'],'system':config['PromptSet']['boundary'],
                              'provider_profile':config['ProviderProfile']},started,timeout)
                    if observation.get('request_id')!=request_id or type(observation.get('duration_ms')) is not int or observation['duration_ms']<0:
                        raise ValueError('Некорректный контракт Runner')
                    validate_fields(observation['output'],[ProgramField.model_validate(f) for f in plan['output_fields']])
                except httpx.HTTPError:
                    raise StopRun('waiting_for_user','Временная ошибка Runner или ИИ. Сохранённые результаты не потеряны; можно продолжить.') from None
                observation['timings']['runner_total_ms']=observation['duration_ms']
                if observation.get('replayed'):
                    with connection() as conn: conn.execute('UPDATE research_runs SET call_count=greatest(0,call_count-1) WHERE id=%s',(run['id'],))
                    observation['timings']['transport_and_queue_ms']=None
                else:
                    observation['duration_ms']=round((perf_counter()-t)*1000)
                    observation['timings']['transport_and_queue_ms']=max(0,observation['duration_ms']-observation['timings']['runner_total_ms'])
                observation.update(solution_id=str(solution['id']),task_id=case['task_id'],repetition=repetition,
                                   provenance='demo',quality=None,needs_review=True)
                observation_id=uid(); observation['observation_id']=observation_id
                with connection() as conn:
                    conn.execute('INSERT INTO task_observations(id,experiment_id,task_id,repetition,content) VALUES(%s,%s,%s,%s,%s)',(observation_id,experiment_id,case['task_id'],repetition,Jsonb(observation)))
                    for metric,value,unit in [('duration',observation['duration_ms'],'ms'),('schema_valid',int(observation['success']),'fraction')]:
                        conn.execute('INSERT INTO measurements(id,observation_id,metric,value,unit,provenance) VALUES(%s,%s,%s,%s,%s,%s)',(uid(),observation_id,metric,value,unit,'measured'))
                observations.append(observation)
        with connection() as conn: conn.execute("UPDATE experiment_runs SET status='completed' WHERE id=%s",(experiment_id,))
    return {'observations':observations,'limitations':['Примеры синтетические; проверка схемы не измеряет полезность ответа или бизнес-эффект']}


def summarize_trials(observations,model,plan):
    grouped=defaultdict(list)
    for row in observations: grouped[row['solution_id']].append(row)
    variants=[]
    for candidate in plan['candidates']:
        values=grouped[candidate['id']]
        variants.append({'solution_id':candidate['id'],'name':candidate['name'],
            'measured_chain_mean_seconds':float(np.mean([v['duration_ms']/1000 for v in values])) if values else None,
            'observation_count':len(values),'sample_size':len({v['task_id'] for v in values}),
            'schema_valid_rate':float(np.mean([bool(v['success']) for v in values])) if values else None,
            'quality':None,'manual_review_rate':None,'baseline_mean_seconds':None,'variant_mean_seconds':None,
            'statistical':None,'measured_chain_effect':None,'provenance':'demo','missing_baseline':len(plan['cases']),
            'missing_fraction':1,'scenarios':{},'sensitivity':[],
            'limitations':['Нет реального baseline и независимой оценки качества; эффект и прогноз не рассчитаны']})
    return {'mode':'autonomous_trials','effect_model_version':model,'variants':variants,
            'dataset_source':'Примеры агента; длительности — реальные замеры Runner и транспорта',
            'period':'Текущий технический прогон','formula':'mean_seconds = sum(duration_ms) / (1000 * observations)',
            'measured':'Длительность цепочки и соответствие схеме; не бизнес-качество',
            'modeled':'Бизнес-эффект не рассчитан без исходных измерений','assumptions':{},
            'limitations':plan['execution_limitations']}


def calculate_trials(run,observations,assumptions=None):
    result=summarize_trials(observations,run['config_versions']['EffectModel'],data_for(run['id'],'planning'))
    result['assumptions']=assumptions or {}
    identifier=uid()
    with connection() as conn:
        conn.execute('SELECT id FROM research_runs WHERE id=%s FOR UPDATE',(run['id'],))
        version=conn.execute('SELECT coalesce(max(version),0)+1 AS n FROM calculation_runs WHERE run_id=%s',(run['id'],)).fetchone()['n']
        result.update(calculation_id=identifier,version=version,dataset_version_id=str(run['dataset_version_id']))
        conn.execute('INSERT INTO calculation_runs(id,run_id,version,content) VALUES(%s,%s,%s,%s)',(identifier,run['id'],version,Jsonb(result)))
    return result


def calculation(run): return save_calculation(run,data_for(run['id'],'experiments')['observations'])


STEPS=[('transcription',transcription,[],['idea_analyst']),
       ('understanding',understanding,['transcription'],['idea_analyst']),
       ('research',investigate,['understanding'],['market_analyst','strategist','business_consultant','product_marketer','researcher','ux_analyst']),
       ('planning',planning,['research'],['orchestrator']),
       ('experiments',trials,['planning'],['orchestrator']),
       ('calculation',calculation,['experiments'],['efficiency_analyst']),
       ('assessment',assessment,['research','planning','calculation'],['critic','tracker']),
       ('report',report,['assessment'],['report_editor'])]
