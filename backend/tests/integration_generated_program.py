"""Live generator acceptance fixture; does not approve a user's product MVP."""
import json,os
from pathlib import Path
from uuid import uuid4
import httpx
from farm.config import load_configuration
from farm.mvp_builder import generate,runner_validate

config=load_configuration()
idea={'title':'Извлечение заказа и расчёт количества × цены','problem':'Получить итог по тексту заказа',
      'audience':'Техническая проверка генератора, без реальных клиентов','transcript':'Из текста заказа извлечь количество и цену, рассчитать итог.'}
criteria=['Единственный вход: string order_text.','ИИ возвращает только number quantity и number unit_price.',
          'Единственный выход: number total = quantity * unit_price.','Две разные текстовые заявки должны давать разные верные итоги.',
          'Сценарий извлечения и вычисления, без классификации.']
program,usage=generate(config,idea,criteria)
assert [f.name for f in program.input_fields]==['order_text']
assert {f.name for f in program.ai_fields}=={'quantity','unit_price'}
assert [f.name for f in program.output_fields]==['total']
prefix=str(uuid4());tests=runner_validate(program,prefix+':validate')
results=[]
with httpx.Client(base_url=os.environ['RUNNER_URL'],headers={'X-Runner-Token':os.environ['RUNNER_TOKEN']},timeout=170) as c:
    try:
        for index,(text,expected) in enumerate([('Заказ: 3 блокнота по 120 рублей за штуку.',360),('Заказ: 2 блокнота по 75 рублей за штуку.',150)]):
            response=c.post('/program/run',json={'request_id':prefix+':'+str(index),'program':program.model_dump(),
                'input':{'order_text':text},'provider_profile':config['ProviderProfile'],'system':config['PromptSet']['boundary']})
            response.raise_for_status();r=response.json()
            assert r['success'] and r['output']['total']==expected,r
            assert r['outputs']['rules']['valid']
            results.append(r)
        artifact={'purpose':'technical_generator_fixture_not_product_acceptance','program':program.model_dump(),
                  'config':config,'generation_usage':usage,'transform_tests':tests,'real_runs':results}
        Path('/tmp/generated-program-verification.json').write_text(json.dumps(artifact,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'generated_title':program.title,'transform_tests_passed':tests['success'],
            'real_outputs':[r['output'] for r in results],'real_groq_calls':3,'artifact':'/tmp/generated-program-verification.json'},ensure_ascii=False))
    finally:c.post('/purge',json={'prefix':prefix}).raise_for_status()
