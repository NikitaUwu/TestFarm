"""Explicit integration run against real local services. No provider or DB mocks.
Creates demo data in reviewer's isolated space. Run manually, never on unittest discover.
"""
import json
import os
from uuid import uuid4
import httpx


def run():
    base=os.getenv('TEST_API_URL','http://api:8000')
    with httpx.Client(base_url=base,timeout=180,headers={'X-Farm-Request':'1'}) as client:
        response=client.post('/auth/login',json={'role':'reviewer','password':os.environ['REVIEWER_PASSWORD']})
        assert response.status_code==200, f'login {response.status_code}'
        created=client.post('/ideas',json={'title':'Интеграционная проверка — демонстрационные данные','transcript':'Классифицировать обращения поддержки по категории. Это проверка системы, не исследование спроса.','priority':1})
        assert created.status_code==201, f'create {created.status_code}'
        idea=created.json(); iid=idea['id']
        read=client.get('/ideas/'+iid); assert read.status_code==200
        content=read.json()['content'];content['problem']='Ручная маршрутизация обращений'
        updated=client.put('/ideas/'+iid,json={**content,'expected_version':1});assert updated.status_code==200
        assert updated.json()['current_version']==2
        assert client.put('/ideas/'+iid,json={**content,'expected_version':1}).status_code==409
        with httpx.Client(base_url=base,timeout=10) as owner:
            assert owner.post('/auth/login',json={'role':'owner','password':os.environ['OWNER_PASSWORD']}).status_code==200
            assert owner.get('/ideas/'+iid).status_code==404, 'cross-tenant read permitted'
        assert httpx.get(base+'/ideas/'+iid).status_code==401
        data={'name':'Технический smoke, не бизнес-данные','source':'Синтетические обращения агента для проверки реализации','period':'2026-09-08','provenance':'demo','labels':['оплата','доступ'],
              'rows':[{'task_id':'one','input':'Списали деньги дважды. Верните второй платёж.','expected_label':'оплата','baseline_seconds':30,'baseline_correct':True,'manual_review_seconds':10,'error_correction_seconds':30},
                      {'task_id':'two','input':'Не могу войти в личный кабинет после смены пароля.','expected_label':'доступ','baseline_seconds':40,'baseline_correct':True,'manual_review_seconds':10,'error_correction_seconds':30}]}
        dataset=client.post('/ideas/'+iid+'/datasets',json=data)
        assert dataset.status_code==201, f'dataset {dataset.status_code}'
        request={'dataset_version_id':dataset.json()['version_id'],'variant_prompts':['Определи категорию обращения. При неоднозначности нужна ручная проверка.','Сопоставь ключевую проблему с одной разрешённой категорией. Объясни кратко.'],'idempotency_key':str(uuid4()),
                 'thresholds':{'minimum_effect_seconds':1,'minimum_quality':.8,'maximum_manual_review':.3,'maximum_error':.2},
                 'source_urls':['https://www.zendesk.com/service/ticketing-system/', 'https://www.intercom.com/fin',
                                'https://www.freshworks.com/freshdesk/', 'https://scikit-learn.org/stable/modules/text_classification.html',
                                'https://huggingface.co/docs/transformers/tasks/sequence_classification'], 'hard_blockers':[]}
        started=client.post('/ideas/'+iid+'/runs',json=request)
        assert started.status_code==201, f'run {started.status_code}: {started.json()}'
        rid=started.json()['id']
        duplicate=client.post('/ideas/'+iid+'/runs',json=request)
        assert duplicate.status_code==201 and duplicate.json()['id']==rid
        print(json.dumps({'checks':['authentication','server_card','version_increment','optimistic_conflict','role_isolation','anonymous_denied','dataset_persistence','idempotent_run'],
                          'idea_id':iid,'run_id':rid,'provenance':'demo'},ensure_ascii=False))


if __name__=='__main__': run()
