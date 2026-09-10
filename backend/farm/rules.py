from fastapi import FastAPI
from pydantic import BaseModel, Field, TypeAdapter

app=FastAPI(title='Result Rules Component',version='1.1.0')


class RuleInput(BaseModel):
    label: str=Field(max_length=100)
    labels: list[str]=Field(min_length=2,max_length=20)
    needs_review: bool
    text_length: int=Field(ge=0,le=10000)


class SchemaInput(BaseModel):
    mode: str
    output: dict
    field_types: dict[str,str]


class RuleOutput(BaseModel):
    valid: bool
    needs_review: bool
    violations: list[str]
    component_version: str


@app.get('/health')
def health(): return {'status':'available','component_id':'classification-rules','version':'1.1.0'}


@app.get('/metadata')
def metadata():
    return {**health(),'purpose':'Проверка категории либо полей результата MVP', 'input_schema':TypeAdapter(RuleInput | SchemaInput).json_schema(),
            'output_schema':RuleOutput.model_json_schema(), 'dependencies':[],
            'limitations':['Не доказывает семантическую правильность категории'], 'metrics':['valid','needs_review'],
            'authentication_type':'private_network','api':'POST /run'}


@app.post('/run')
def run(body: RuleInput | SchemaInput):
    if isinstance(body,SchemaInput):
        import math
        violations=[]
        if body.mode!='schema' or not 1<=len(body.output)<=12 or set(body.output)!=set(body.field_types):violations.append('field_mismatch')
        for name,kind in body.field_types.items():
            value=body.output.get(name)
            valid=(isinstance(value,str) and len(value)<=20000) if kind=='string' else type(value) is bool if kind=='boolean' else type(value) in (float,int) and math.isfinite(value) if kind=='number' else False
            if not valid:violations.append('invalid_type:'+name)
        return {'valid':not violations,'needs_review':True,'violations':violations,'component_version':'1.1.0'}
    violations=[]
    if body.label not in body.labels: violations.append('unknown_label')
    if body.text_length<8: violations.append('insufficient_input')
    return {'valid':not violations,'needs_review':body.needs_review or bool(violations),'violations':violations, 'component_version':'1.1.0'}
