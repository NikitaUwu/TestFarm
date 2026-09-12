import {ResearchResult} from './providers';
// These URLs are references only. The application never requests source pages.
export function citationSources(result:ResearchResult,query:string,maxChars:number){
 return result.annotations.flatMap(annotation=>{
  const citation=annotation.type==='url_citation'?annotation.url_citation:null;
  if(!citation||typeof citation.url!=='string')return [];
  let url:URL;try{url=new URL(citation.url);}catch{return [];}
  if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||!url.hostname.includes('.')||/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)||url.hostname.startsWith('['))return [];
  const published=typeof citation.published_at==='string'&&!Number.isNaN(Date.parse(citation.published_at))?citation.published_at:null;
  const start=citation.start_index,end=citation.end_index;
  const claim=Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start?result.text.slice(start,end):null;
  return [{url:url.href,title:typeof citation.title==='string'?citation.title:url.hostname,publisher:typeof citation.publisher==='string'?citation.publisher:null,organization:url.hostname,domain:url.hostname,snippet:typeof citation.content==='string'?citation.content.slice(0,maxChars):null,published_at:published,accessed_at:new Date().toISOString(),search_topic:query,query,supported_claim:claim,provider:'routerai',search_engine:'exa',raw_citation:annotation,fullPageRead:false}];
 });
}
