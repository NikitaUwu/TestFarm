import {lookup} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import https from 'node:https';
import {Configuration,required} from './config';
import {boundedJson,IntegrationError} from './providers';
const blocked=new BlockList();
for(const [ip,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(ip,prefix,'ipv4');
for(const [ip,prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['fc00::',7],['fe80::',10],['fec0::',10],['ff00::',8],['2001:db8::',32]] as const)blocked.addSubnet(ip,prefix,'ipv6');
export async function publicTarget(value:string){
 const url=new URL(value);const host=url.hostname.replace(/^\[|\]$/g,'');
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||/^(localhost|metadata)(\.|$)/i.test(host)||host.endsWith('.local'))throw new IntegrationError('Веб-инструмент','Адрес запрещён');
 const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true});
 if(!addresses.length||addresses.some(a=>blocked.check(a.address,a.family===6?'ipv6':'ipv4')))throw new IntegrationError('Веб-инструмент','Приватный адрес запрещён');
 return {url,address:addresses[0]};
}
async function checkedPage(value:string,config:Configuration){
 for(let redirect=0;redirect<=config.web.maxRedirects;redirect++){
  const {url,address}=await publicTarget(value);
  const meta=await new Promise<{status:number;location?:string;type:string;size:number}>((resolve,reject)=>{
   const request=https.request(url,{method:'HEAD',timeout:config.web.timeoutSeconds*1000,lookup:((_:unknown,options:{all?:boolean},callback:any)=>options.all?callback(null,[address]):callback(null,address.address,address.family)) as any},response=>{resolve({status:response.statusCode||0,location:response.headers.location,type:String(response.headers['content-type']||''),size:Number(response.headers['content-length']||0)});response.resume();});
   request.on('timeout',()=>request.destroy(new Error('Page timeout')));request.on('error',reject);request.end();
  });
  if([301,302,303,307,308].includes(meta.status)&&meta.location){value=new URL(meta.location,url).href;continue;}
  if(meta.status!==200||!/(text\/html|text\/plain|application\/xhtml)/i.test(meta.type)||meta.size>config.web.maxBytes)throw new IntegrationError('Веб-инструмент','Страница недоступна или не соответствует ограничениям');
  return url.href;
 }
 throw new IntegrationError('Веб-инструмент','Слишком много перенаправлений');
}
export interface WebResearchProvider {search(input:{query:string;maxResults:number;freshnessDays?:number|null;domains?:string[]}):Promise<any[]>;read(url:string):Promise<Record<string,any>>;}
export class TavilyProvider implements WebResearchProvider{
 constructor(private config:Configuration){}
 async call(path:string,data:unknown){return boundedJson(await fetch('https://api.tavily.com/'+path,{method:'POST',headers:{Authorization:'Bearer '+required('TAVILY_API_KEY'),'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(this.config.web.timeoutSeconds*1000)}),this.config.web.maxBytes);}
 async search(input:{query:string;maxResults:number;freshnessDays?:number|null;domains?:string[]}){
  const result=await this.call('search',{query:input.query,max_results:input.maxResults,search_depth:'basic',auto_parameters:false,include_answer:false,include_raw_content:false,include_images:false,include_usage:true,...(input.freshnessDays?{days:input.freshnessDays,topic:'news'}:{}),...(input.domains?.length?{include_domains:input.domains}:{})});
  return (result.results||[]).map((r:any)=>({title:String(r.title||''),url:String(r.url||''),snippet:String(r.content||'').slice(0,1800),publishedAt:r.published_date||null}));
 }
 async read(url:string){
  const finalUrl=await checkedPage(url,this.config);
  const result=await this.call('extract',{urls:[finalUrl],extract_depth:'basic',format:'text',include_images:false,timeout:this.config.web.timeoutSeconds,include_usage:true});
  const page=result.results?.[0];if(!page?.raw_content)throw new IntegrationError('Tavily','Не удалось прочитать страницу');
  const actual=await publicTarget(page.url||finalUrl);if(actual.url.href!==finalUrl)throw new IntegrationError('Tavily','Неожиданное перенаправление');
  return {url,finalUrl,title:page.title||new URL(finalUrl).hostname,text:String(page.raw_content).replaceAll('\u0000','').slice(0,this.config.web.maxPageChars),publishedAt:null,fetchedAt:new Date().toISOString(),organization:new URL(finalUrl).hostname,availability:'available'};
 }
}
