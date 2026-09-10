import json,os,time,threading
import httpx
from .db import connection,uid,Jsonb
from .providers import provider
from .programs import GeneratedProgram
from .agent_contract import record


GENERATION_PROMPT='''Создай MVP одного законченного сценария по идее и критериям приёмки.
Это приложение: типизированная форма input_fields -> один управляемый вызов ИИ ai_fields -> чистая JavaScript функция transform(input, ai) -> output_fields.
Сценарий выбирается по идее, не своди любую идею к классификации. Поддерживаются извлечение, текстовая обработка, рекомендации и вычисления над структурированными полями.
Все поля примитивные string/number/boolean. Дай полный JavaScript-код функции transform без импортов, сети, файлов, process, require, fetch, async и сторонних библиотек.
Никаких внешних публикаций или записей. Два разных теста с input_json, ai_json, expected_json — JSON-строками; тестовые ai_json явно синтетические, они проверяют только код transform.
Код обязан действительно обрабатывать значения входа и ai, а не возвращать заготовленный постоянный результат. Пиши компактно. Верни JSON заданной схемы.'''


def generate(config,idea,acceptance,errors=None):
    result=provider(config['ProviderProfile']).chat(config['PromptSet']['boundary']+'\n'+config['PromptSet'].get('mvp_generation',GENERATION_PROMPT),
        {'idea':idea,'acceptance':acceptance,'validation_errors':errors or []},GeneratedProgram.model_json_schema())
    return GeneratedProgram.model_validate(result['output']),result.get('usage',{})


def runner_validate(program,request_id):
    response=httpx.post(os.environ['RUNNER_URL']+'/program/validate',headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']},
        json={'request_id':request_id,'program':program.model_dump()},timeout=170)
    response.raise_for_status()
    result=response.json()
    if not result.get('success'):raise ValueError('Тесты сгенерированной программы не пройдены')
    return result


def build(job):
    config=job['config'];start=time.monotonic();errors=[]
    with connection() as c:
        source=c.execute('SELECT b.idea_id,b.decision_id,d.content,d.report_id,r.idea_version_id,v.content idea FROM mvp_builds b JOIN decisions d ON d.id=b.decision_id JOIN reports p ON p.id=d.report_id JOIN research_runs r ON r.id=p.run_id JOIN idea_versions v ON v.id=r.idea_version_id WHERE b.id=%s',(job['build_id'],)).fetchone()
    for attempt in range(config['BudgetPolicy']['mvp_repair_cycles']+1):
        if time.monotonic()-start>config['BudgetPolicy']['mvp_build_seconds']:raise TimeoutError('MVP build timeout')
        with connection() as c:
            if not c.execute('SELECT 1 FROM mvp_jobs WHERE id=%s AND status=%s',(job['id'],'running')).fetchone():return
            prior=c.execute('SELECT * FROM mvp_versions WHERE build_id=%s ORDER BY version DESC LIMIT 1',(job['build_id'],)).fetchone()
        t=time.monotonic();calls=0;version_id=None
        try:
            if prior and prior['content'].get('validation_status')=='pending':
                program=GeneratedProgram.model_validate(prior['content']['program']);version_id=str(prior['id']);spec=prior['content']
            else:
                with connection() as c:
                    current=c.execute('SELECT call_count,extract(epoch FROM(now()-started_at)) elapsed FROM mvp_jobs WHERE id=%s FOR UPDATE',(job['id'],)).fetchone()
                    if current['call_count']>=config['BudgetPolicy']['mvp_repair_cycles']+1 or current['elapsed']>config['BudgetPolicy']['mvp_build_seconds']:
                        raise TimeoutError('Лимит MVP исчерпан')
                    c.execute('UPDATE mvp_jobs SET call_count=call_count+1 WHERE id=%s',(job['id'],))
                calls=1;program,usage=generate(config,source['idea'],source['content']['acceptance'],errors)
                version_id=uid();version=prior['version']+1 if prior else 1
                spec={'template':'generated-js-v1','program':program.model_dump(),'provider_profile':config['ProviderProfile'],
                      'system':config['PromptSet']['boundary'],'acceptance':source['content']['acceptance'],
                      'report_id':str(source['report_id']),'validation_status':'pending','usage':usage}
                with connection() as c:c.execute('INSERT INTO mvp_versions(id,build_id,version,content) VALUES(%s,%s,%s,%s)',(version_id,job['build_id'],version,Jsonb(spec)))
            tests=runner_validate(program,str(job['build_id'])+':validate:'+version_id)
            spec.update(validation_status='passed',tests=tests)
            record(source['idea_id'],'implementation_agent',{'idea_version':str(source['idea_version_id']),'acceptance':source['content']['acceptance'],
                'provider':config['ProviderProfile']},{'version_id':version_id,'program':program.model_dump(),'tests':tests},
                operation_id=job['id'],input_version=source['idea_version_id'],duration_ms=round((time.monotonic()-t)*1000),calls=calls,artifact_refs=[version_id])
            with connection() as c:
                c.execute('UPDATE mvp_versions SET content=%s WHERE id=%s',(Jsonb(spec),version_id))
                c.execute("UPDATE mvp_jobs SET status='completed',lease_until=NULL,error=NULL WHERE id=%s",(job['id'],))
                c.execute("UPDATE ideas SET execution_state='waiting_for_user' WHERE id=%s",(source['idea_id'],))
            return
        except Exception as exc:
            errors=[{'type':type(exc).__name__,'message':'Генерация, схема или тест transform не прошли проверку'}]
            if version_id:
                with connection() as c:c.execute("UPDATE mvp_versions SET content=jsonb_set(content,'{validation_status}','\"failed\"') WHERE id=%s",(version_id,))
            record(source['idea_id'],'implementation_agent',{'acceptance':source['content']['acceptance']},{},operation_id=job['id'],
                input_version=source['idea_version_id'],duration_ms=round((time.monotonic()-t)*1000),calls=calls,status='error',errors=errors)
    with connection() as c:
        c.execute("UPDATE mvp_jobs SET status='error',error=%s,lease_until=NULL WHERE id=%s",(json.dumps(errors),job['id']))
        c.execute("UPDATE mvp_builds SET status='error' WHERE id=%s",(job['build_id'],))
        c.execute("UPDATE ideas SET execution_state='error' WHERE id=%s",(source['idea_id'],))


def tick():
    with connection() as c:
        job=c.execute("SELECT * FROM mvp_jobs WHERE status='ready' OR (status='running' AND lease_until<now()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED").fetchone()
        if not job:return False
        c.execute("UPDATE mvp_jobs SET status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),lease_until=now()+interval '40 seconds' WHERE id=%s",(job['id'],))
    stop=threading.Event()
    def beat():
        while not stop.wait(10):
            with connection() as c:c.execute("UPDATE mvp_jobs SET lease_until=now()+interval '40 seconds' WHERE id=%s AND status='running'",(job['id'],))
    thread=threading.Thread(target=beat,daemon=True);thread.start()
    try:build(job)
    except Exception as exc:
        with connection() as c:
            c.execute("UPDATE mvp_jobs SET status='error',error=%s,lease_until=NULL WHERE id=%s",(type(exc).__name__,job['id']))
            c.execute("UPDATE mvp_builds SET status='error' WHERE id=%s",(job['build_id'],))
    finally:stop.set();thread.join(timeout=1)
    return True
