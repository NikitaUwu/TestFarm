"""One killable process per request. Generated JS receives no host bindings."""
import json
import os
import sys
from time import perf_counter
import httpx
from .providers import provider
from .schemas import Classification
from .programs import GeneratedProgram,ProgramField,fields_schema,validate_fields,transform,test_program


def execute(body):
    start=perf_counter(); kind=body.get('kind','classification')
    if kind=='validate_program':
        return {**test_program(GeneratedProgram.model_validate(body['program'])),'request_id':body['request_id']}
    if kind=='program':
        program=GeneratedProgram.model_validate(body['program'])
        inputs=validate_fields(body['input'],program.input_fields)
        prompt=program.ai_prompt; schema=fields_schema(program.ai_fields)
    elif kind=='trial':
        fields=[ProgramField.model_validate(f) for f in body['output_fields']]
        inputs={'text':body['text']}; prompt=body['prompt']; schema=fields_schema(fields)
    else:
        inputs={'text':body['text'],'labels':body['labels']}; prompt=body['prompt']; schema=Classification.model_json_schema()
    pre_ms=round((perf_counter()-start)*1000); ai_start=perf_counter()
    response=provider(body['provider_profile']).chat(body['system']+'\n'+prompt,inputs,schema)
    ai_ms=round((perf_counter()-ai_start)*1000); validation_start=perf_counter()
    ai=response['output']
    if kind=='program':
        validate_fields(ai,program.ai_fields)
        output=validate_fields(transform(program.javascript,inputs,ai),program.output_fields)
        rules_input={'mode':'schema','output':output,'field_types':{f.name:f.type for f in program.output_fields}}
    elif kind=='trial':
        output=validate_fields(ai,fields)
        rules_input={'mode':'schema','output':output,'field_types':{f.name:f.type for f in fields}}
    else:
        output=Classification.model_validate(ai).model_dump()
        rules_input={'label':output['label'],'labels':body['labels'],'needs_review':output['needs_review'],'text_length':len(body['text'])}
    validation_ms=round((perf_counter()-validation_start)*1000); rules_start=perf_counter()
    r=httpx.post(os.environ['RULES_URL']+'/run',json=rules_input,timeout=10);r.raise_for_status();rules=r.json()
    rules_ms=round((perf_counter()-rules_start)*1000)
    total=round((perf_counter()-start)*1000)
    result={'request_id':body['request_id'],'success':bool(rules['valid']),'duration_ms':total,'ai_ms':ai_ms,'rules_ms':rules_ms,
            'inputs':{'provider':inputs,'rules':rules_input},'outputs':{'provider':ai,'rules':rules},
            'usage':response.get('usage',{}),'model':response['model'],'component_versions':{'runner':'2.1.0','rules':rules['component_version']},
            'timings':{'preprocessing_ms':pre_ms,'ai_ms':ai_ms,'validation_ms':validation_ms,'rules_ms':rules_ms,
                       'overhead_ms':max(0,total-pre_ms-ai_ms-validation_ms-rules_ms)}}
    if kind in ('program','trial'): result['output']=output
    else: result.update(label=output['label'],needs_review=rules['needs_review'])
    return result


if __name__=='__main__':
    try: print(json.dumps({'result':execute(json.load(sys.stdin))},ensure_ascii=False))
    except Exception as exc:
        from .providers import ProviderError
        print(json.dumps({'error':str(exc) if isinstance(exc,ProviderError) else type(exc).__name__+': выполнение не завершено',
                          'error_code':exc.code if isinstance(exc,ProviderError) else None},ensure_ascii=False))
        sys.exit(1)
