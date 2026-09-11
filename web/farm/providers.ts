import {z} from 'zod';
import {Configuration,required} from './config';
export class IntegrationError extends Error{constructor(public service:string,public code:string,public retryable=false){super(`${service}: ${code}`);}}
export interface LLMProvider {chat(system:string,data:unknown,schema:Record<string,unknown>):Promise<{output:unknown;usage:Record<string,any>;model:string;channel:string|null}>;}
export interface SpeechProvider {transcribe(audio:Blob,filename:string):Promise<{text:string;usage:Record<string,any>}>;}
export async function boundedJson(response:Response,limit=1048576){
 if(!response.ok)throw new IntegrationError(new URL(response.url).hostname,`HTTP ${response.status}`,[429,502,503,504].includes(response.status));
 if(!response.body)throw new IntegrationError('HTTP','Пустой ответ');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new IntegrationError('HTTP','Ответ превышает лимит');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new IntegrationError('HTTP','Некорректный JSON');}
}
export class TsarRouterClient implements LLMProvider,SpeechProvider{
 constructor(private config:Configuration){}
 async catalogue(){return boundedJson(await fetch(this.config.provider.baseUrl+'/models/info',{signal:AbortSignal.timeout(15000),cache:'no-store'}),2097152);}
 async ensureFree(kind:'text'|'stt'){
  const p=this.config.provider,model=kind==='text'?p.model:p.speechModel,channel=kind==='text'?p.channel:p.speechChannel;
  const catalogue=await this.catalogue();const entry=catalogue.data?.find((m:any)=>m.id===model&&m.type===kind);
  const selected=entry?.providers?.find((v:any)=>v.provider===channel&&v.status==='ok');
  const price=selected?.pricing;
  const free=kind==='text'?price?.prompt===0&&price?.completion===0:price?.per_second===0;
  if(!free)throw new IntegrationError('Царь Роутер','Выбранный бесплатный канал недоступен');
  return {model,channel,entry};
 }
 async chat(system:string,data:unknown,schema:Record<string,unknown>){
  const {model,channel}=await this.ensureFree('text');
  const response=await fetch(this.config.provider.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+required('TSARROUTER_API_KEY'),'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model,provider:{only:[channel],allow_fallbacks:false,max_price:{prompt:0,completion:0}},stream:false,max_tokens:this.config.budget.maxTokens,temperature:0.2,reasoning_effort:'none',messages:[{role:'system',content:system+'\nСхема JSON результата: '+JSON.stringify(schema)},{role:'user',content:JSON.stringify({untrusted_data:data})}],response_format:{type:'json_object'}})});
  const result=await boundedJson(response);const choice=result.choices?.[0];
  if(choice?.finish_reason!=='stop')throw new IntegrationError('Царь Роутер','Ответ не завершён',true);
  if(Number(result.usage?.cost_rub??response.headers.get('X-Cost-Rub')??0)>0)throw new IntegrationError('Царь Роутер','Нарушена политика бесплатного канала');
  let output;try{output=JSON.parse(choice.message.content);}catch{throw new IntegrationError('Царь Роутер','Невалидный JSON',true);}
  return {output,usage:result.usage||{},model:result.model||model,channel:response.headers.get('X-TsarRouter-Provider')};
 }
 async transcribe(audio:Blob,filename:string){
  const {model,channel,entry}=await this.ensureFree('stt');
  // Speech routing must be provably free even if this endpoint ignores text-only routing options.
  if(entry.providers.some((v:any)=>v.status==='ok'&&v.pricing?.per_second!==0))
    throw new IntegrationError('Царь Роутер','Бесплатное распознавание сейчас нельзя гарантировать. Запись сохранена; введите текст идеи вручную');
  const body=new FormData();body.append('file',audio,filename);body.append('model',model);body.append('language','ru');body.append('response_format','verbose_json');body.append('provider',JSON.stringify({only:[channel],allow_fallbacks:false,max_price:{per_second:0,prompt:0,completion:0}}));
  const response=await fetch(this.config.provider.baseUrl+'/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+required('TSARROUTER_API_KEY')},body,signal:AbortSignal.timeout(120000)});
  const result=await boundedJson(response);
  if(!result.text?.trim())throw new IntegrationError('Царь Роутер','Речь не распознана');
  if(Number(result.duration)>this.config.budget.audioSeconds)throw new IntegrationError('Царь Роутер','Аудио длиннее 5 минут');
  return {text:String(result.text).slice(0,20000),usage:result.usage||{}};
 }
}
export const schemaFor=(schema:z.ZodType)=>z.toJSONSchema(schema,{target:'draft-7'});
