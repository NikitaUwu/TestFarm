import {z} from 'zod';
import {Configuration,required} from './config';
export type Usage=Record<string,any>;
export class IntegrationError extends Error{
 constructor(public service:string,public code:string,public retryable=false,public usage:Usage={},public model?:string){super(`${service}: ${code}`);}
}
export type ChatResult={output:unknown;usage:Usage;model:string;generationId:string|null};
export type ResearchResult={text:string;annotations:Record<string,any>[];usage:Usage;model:string;generationId:string|null};
export interface LLMProvider{chat(system:string,data:unknown,schema:Record<string,unknown>,role?:string):Promise<ChatResult>;research(query:string,keyTopic:boolean,instruction:string):Promise<ResearchResult>;}
export interface SpeechProvider{transcribe(audio:Blob,filename:string):Promise<{text:string;usage:Usage;model:string;generationId:string|null}>;}
export function costRub(usage:Usage):number|null{const value=usage.cost;return (typeof value==='number'||(typeof value==='string'&&value.trim()!==''))&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;}
export async function boundedJson(response:Response,limit=1048576){
 if(!response.body)throw new IntegrationError('RouterAI','Пустой ответ');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new IntegrationError('RouterAI','Ответ превышает лимит');}chunks.push(value);}
 let result:any;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new IntegrationError('RouterAI',response.ok?'Некорректный JSON':`HTTP ${response.status}`,[429,500,502,503,504].includes(response.status));}
 if(!response.ok){
  const messages:Record<number,string>={400:'Запрос отклонён',401:'Ключ не принят',402:'Недостаточно средств',403:'Нет доступа к модели',429:'Достигнут лимит запросов'};
  // Provider error bodies may echo credentials or private inputs; never persist them verbatim.
  throw new IntegrationError('RouterAI',`${messages[response.status]||'Сервис недоступен'} (HTTP ${response.status})`,[429,500,502,503,504].includes(response.status),result.usage||{});
 }
 return result;
}
export class RouterAIClient implements LLMProvider,SpeechProvider{
 constructor(private config:Configuration){}
 modelFor(role=''){return role==='critic'?this.config.provider.criticModel:this.config.provider.model;}
 private async completion(system:string,data:unknown,model:string,extra:Record<string,unknown>){
  const input=JSON.stringify({untrusted_data:data});
  if(input.length>this.config.budget.maxInputChars)throw new IntegrationError('RouterAI','Контекст превышает лимит этапа');
  const apiKey=required('ROUTERAI_API_KEY');
  let response:Response;
  try{
   response=await fetch(this.config.provider.baseUrl+'/chat/completions',{
    method:'POST',
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(150000),
    body:JSON.stringify({
     model,
     stream:false,
     max_tokens:this.config.budget.maxTokens,
     max_completion_tokens:this.config.budget.maxTokens,
     ...(model.includes('qwen')?{reasoning_effort:'none'}:{}),
     temperature:0.1,
     ...extra,
     messages:[{role:'system',content:system},{role:'user',content:input}]
    })
   });
  }catch(err:any){
   const isTimeout=err?.name==='TimeoutError'||err?.name==='AbortError'||String(err?.message).includes('timeout');
   throw new IntegrationError('RouterAI',isTimeout?'Таймаут ожидания ответа RouterAI':'Сетевой запрос не завершён',true);
  }
  const result=await boundedJson(response,this.config.web.maxBytes),usage=result.usage||{},choice=result.choices?.[0],message=choice?.message;
  if(result.model&&result.model!==model)throw new IntegrationError('RouterAI','Незапрошенная замена модели отклонена',false,usage,result.model);
  if(message?.refusal)throw new IntegrationError('RouterAI','Модель отказалась от запроса',false,usage,model);
  const content=typeof message?.content==='string'?message.content.trim():(typeof choice?.text==='string'?choice.text.trim():'');
  if(!content&&!Array.isArray(message?.annotations)&&!Array.isArray(choice?.annotations)){
   const reasoningTokens=usage?.completion_tokens_details?.reasoning_tokens;
   if(reasoningTokens&&reasoningTokens>2000)throw new IntegrationError('RouterAI','Модель исчерпала лимит на рассуждения (reasoning_tokens). Требуется краткий ответ без размышлений.',true,usage,model);
   throw new IntegrationError('RouterAI',choice?.finish_reason==='length'?'Ответ превысил лимит токенов (обрезан)':'Ответ модели пуст',true,usage,model);
  }
  const normalizedMessage={...message,content:content||(typeof message?.content==='string'?message.content:'')};
  return {message:normalizedMessage,choice,usage,model,generationId:response.headers.get('X-Generation-Id')||result.id||null};
 }
 async chat(system:string,data:unknown,schema:Record<string,unknown>,role=''){
  const tokenCap=role==='source_researcher'?2048:(role==='critic'?4096:undefined);
  const extra:Record<string,unknown>={response_format:{type:'json_schema',json_schema:{name:'farm_step',strict:true,schema}}};
  if(tokenCap){extra.max_tokens=tokenCap;extra.max_completion_tokens=tokenCap;}
  const result=await this.completion(system,data,this.modelFor(role),extra);
  let output;
  try{
   output=JSON.parse(result.message.content);
  }catch{
   throw new IntegrationError('RouterAI',result.choice?.finish_reason==='length'?'Ответ превысил лимит токенов (обрезан)':'Невалидный JSON',true,result.usage,result.model);
  }
  return {output,usage:result.usage,model:result.model,generationId:result.generationId};
 }
 async research(query:string,keyTopic:boolean,instruction:string){
  const result=await this.completion(instruction,{query},this.config.provider.model,{max_tokens:3072,max_completion_tokens:3072,plugins:[{id:'web',engine:this.config.web.engine,max_results:keyTopic?this.config.web.keyResults:this.config.web.normalResults,search_prompt:'Ищи первичные источники по заданной теме. Не угадывай отсутствующие сведения.'}]});
  return {text:String(result.message.content),annotations:Array.isArray(result.message.annotations)?result.message.annotations:[],usage:result.usage,model:result.model,generationId:result.generationId};
 }
 async transcribe(audio:Blob,filename:string){
  if(audio.size>this.config.budget.audioBytes)throw new IntegrationError('RouterAI','Файл превышает лимит');
  const body=new FormData();body.append('file',audio,filename);body.append('model',this.config.provider.speechModel);body.append('language','ru');body.append('response_format','verbose_json');
  let response:Response;try{response=await fetch(this.config.provider.baseUrl+'/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+required('ROUTERAI_API_KEY')},body,signal:AbortSignal.timeout(120000)});}catch{throw new IntegrationError('RouterAI','Распознавание не завершено из-за сетевой ошибки',true);}
  const result=await boundedJson(response),usage=result.usage||{},model=this.config.provider.speechModel;
  if(!result.text?.trim())throw new IntegrationError('RouterAI','Речь не распознана',false,usage,model);
  if(Number(result.duration??usage.seconds)>this.config.budget.audioSeconds)throw new IntegrationError('RouterAI','Аудио длиннее 5 минут',false,usage,model);
  return {text:String(result.text).slice(0,20000),usage,model,generationId:response.headers.get('X-Generation-Id')||result.id||null};
 }
}
export const schemaFor=(schema:z.ZodType)=>z.toJSONSchema(schema,{target:'draft-7'});
