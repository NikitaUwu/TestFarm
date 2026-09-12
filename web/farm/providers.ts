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
  try{response=await fetch(this.config.provider.baseUrl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model,stream:false,max_tokens:this.config.budget.maxTokens,temperature:0.2,messages:[{role:'system',content:system},{role:'user',content:input}],...extra})});}
  catch{throw new IntegrationError('RouterAI','Сетевой запрос не завершён',true);}
  const result=await boundedJson(response,this.config.web.maxBytes),usage=result.usage||{},message=result.choices?.[0]?.message;
  if(result.model&&result.model!==model)throw new IntegrationError('RouterAI','Незапрошенная замена модели отклонена',false,usage,result.model);
  if(message?.refusal)throw new IntegrationError('RouterAI','Модель отказалась от запроса',false,usage,model);
  if(!message?.content||result.choices[0].finish_reason==='length')throw new IntegrationError('RouterAI','Ответ пуст или обрезан',true,usage,model);
  return {message,usage,model,generationId:response.headers.get('X-Generation-Id')||result.id||null};
 }
 async chat(system:string,data:unknown,schema:Record<string,unknown>,role=''){
  const result=await this.completion(system,data,this.modelFor(role),{response_format:{type:'json_schema',json_schema:{name:'farm_step',strict:true,schema}}});
  let output;try{output=JSON.parse(result.message.content);}catch{throw new IntegrationError('RouterAI','Невалидный JSON',true,result.usage,result.model);}
  return {output,usage:result.usage,model:result.model,generationId:result.generationId};
 }
 async research(query:string,keyTopic:boolean,instruction:string){
  const result=await this.completion(instruction,{query},this.config.provider.model,{plugins:[{id:'web',engine:this.config.web.engine,max_results:keyTopic?this.config.web.keyResults:this.config.web.normalResults,search_prompt:'Ищи первичные источники по заданной теме. Не угадывай отсутствующие сведения.'}]});
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
