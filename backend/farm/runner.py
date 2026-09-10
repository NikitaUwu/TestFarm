import hmac,os
from contextlib import asynccontextmanager
from fastapi import FastAPI,Header,HTTPException,Depends
from pydantic import BaseModel,Field
from .runner_jobs import submit,cancel,recover,purge
from .programs import GeneratedProgram

@asynccontextmanager
async def lifespan(app):
    recover()
    yield

app=FastAPI(title='Product Farm Runner',version='2.0.0',lifespan=lifespan)

def authorize(x_runner_token: str=Header(default='')):
    expected=os.getenv('RUNNER_TOKEN','')
    if not expected or not hmac.compare_digest(x_runner_token,expected):raise HTTPException(403,'Runner access denied')

class RunInput(BaseModel):
    text: str=Field(min_length=1,max_length=10000)
    labels: list[str]=Field(min_length=2,max_length=20)
    prompt: str=Field(min_length=1,max_length=4000)
    system: str=Field(max_length=12000)
    provider_profile: dict
    request_id: str=Field(min_length=1,max_length=200)

class ProgramInput(BaseModel):
    request_id: str=Field(min_length=1,max_length=200)
    program: GeneratedProgram
    input: dict=Field(default_factory=dict)
    provider_profile: dict=Field(default_factory=dict)
    system: str=Field(default='',max_length=12000)

class CancelInput(BaseModel):
    prefix: str=Field(min_length=36,max_length=200)

@app.get('/health')
def health():return {'status':'available','version':'2.0.0','execution':'killable-process-and-js-runtime'}

@app.get('/metadata')
def metadata():return {**health(),'input_schema':RunInput.model_json_schema(),'program_schema':GeneratedProgram.model_json_schema(),
    'permissions':['groq.chat','rules.run'],'limits':{'javascript_seconds':.5,'javascript_memory_mb':32,'process_seconds':160},
    'isolation':'read-only non-root container; generated JS has no host bindings; durable idempotency; cancellable child process'}

@app.post('/run',dependencies=[Depends(authorize)])
def run(body:RunInput):return submit(body.model_dump())

@app.post('/program/run',dependencies=[Depends(authorize)])
def run_program(body:ProgramInput):return submit({**body.model_dump(),'kind':'program'})

@app.post('/program/validate',dependencies=[Depends(authorize)])
def validate_program(body:ProgramInput):return submit({**body.model_dump(),'kind':'validate_program'})

@app.post('/cancel',dependencies=[Depends(authorize)])
def cancel_run(body:CancelInput):return cancel(body.prefix)

@app.post('/purge',dependencies=[Depends(authorize)])
def purge_results(body:CancelInput):return purge(body.prefix)
