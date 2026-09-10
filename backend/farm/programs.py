"""Generated single-scenario applications: typed AI output + pure JavaScript."""
import json
from typing import Literal
from pydantic import Field,model_validator
from .schemas import StrictModel


class ProgramField(StrictModel):
    name: str = Field(pattern=r'^[a-z][a-z0-9_]{0,39}$')
    label: str = Field(min_length=1,max_length=100)
    type: Literal['string','number','boolean']


class ProgramTest(StrictModel):
    input_json: str = Field(max_length=10000)
    ai_json: str = Field(max_length=10000)
    expected_json: str = Field(max_length=10000)


class GeneratedProgram(StrictModel):
    title: str = Field(min_length=1,max_length=150)
    scenario: str = Field(min_length=1,max_length=1500)
    input_fields: list[ProgramField] = Field(min_length=1,max_length=12)
    output_fields: list[ProgramField] = Field(min_length=1,max_length=12)
    ai_fields: list[ProgramField] = Field(min_length=1,max_length=12)
    ai_prompt: str = Field(min_length=1,max_length=4000)
    javascript: str = Field(min_length=1,max_length=16000)
    tests: list[ProgramTest] = Field(min_length=2,max_length=5)

    @model_validator(mode='after')
    def valid_program(self):
        for fields in (self.input_fields,self.output_fields,self.ai_fields):
            if len({f.name for f in fields})!=len(fields): raise ValueError('Duplicate field')
        for test in self.tests:
            validate_fields(json.loads(test.input_json),self.input_fields)
            validate_fields(json.loads(test.ai_json),self.ai_fields)
            validate_fields(json.loads(test.expected_json),self.output_fields)
        return self


def fields_schema(fields):
    return {'type':'object','additionalProperties':False,'properties':{f.name:{'type':f.type} for f in fields},
            'required':[f.name for f in fields]}


def validate_fields(value,fields):
    if not isinstance(value,dict) or set(value)!={f.name for f in fields}: raise ValueError('Поля не соответствуют схеме')
    for field in fields:
        v=value[field.name]
        valid=(isinstance(v,str) and len(v)<=20000) if field.type=='string' else type(v) is bool if field.type=='boolean' else type(v) in (int,float) and __import__('math').isfinite(v)
        if not valid: raise ValueError('Тип поля не соответствует схеме')
    return value


def transform(code,data,ai):
    import quickjs
    context=quickjs.Context()
    context.set_memory_limit(32*1024*1024)
    context.set_time_limit(.5)
    context.set_max_stack_size(512*1024)
    context.eval(code)
    # Values are parsed from JSON literals, never concatenated as executable code.
    output=context.eval('JSON.stringify(transform('+json.dumps(data,ensure_ascii=True)+','+json.dumps(ai,ensure_ascii=True)+'))')
    if not isinstance(output,str) or len(output)>100000: raise ValueError('Недопустимый размер результата')
    return json.loads(output)


def test_program(program):
    results=[]
    for test in program.tests:
        actual=transform(program.javascript,json.loads(test.input_json),json.loads(test.ai_json))
        validate_fields(actual,program.output_fields)
        results.append({'passed':actual==json.loads(test.expected_json),'input':json.loads(test.input_json),
                        'ai_fixture':json.loads(test.ai_json),'expected':json.loads(test.expected_json),'actual':actual,
                        'provenance':'generated_test_fixture'})
    return {'success':all(r['passed'] for r in results),'tests':results,'scope':'pure_transform; does not prove AI quality'}
