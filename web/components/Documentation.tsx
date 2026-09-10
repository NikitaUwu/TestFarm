'use client';
import {Fragment} from 'react';

export default function Documentation({content,name,onSelect}:{content:string;name:string;onSelect:(name:string)=>void}){
  function inline(line:string){return line.split(/(\[[^\]]+\]\([^)]+\))/g).map((part,i)=>{
    const match=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if(!match)return <Fragment key={i}>{part}</Fragment>;
    const [,label,target]=match;
    if(/^https:\/\//i.test(target))return <a key={i} href={target} target="_blank" rel="noreferrer">{label}</a>;
    if(!target.startsWith('/')&&!target.includes(':')&&target.endsWith('.md')){
      const base=name.split('/').slice(0,-1);for(const segment of target.split('/')){if(segment==='..')base.pop();else if(segment!=='.')base.push(segment);}
      return <button className="text-link" key={i} onClick={()=>onSelect(base.join('/'))}>{label}</button>;
    }
    return <Fragment key={i}>{label} ({target})</Fragment>;
  });}
  const blocks:React.ReactNode[]=[];let code:string[]|null=null;
  content.split('\n').forEach((line,i)=>{
    if(line.startsWith('```')){if(code){blocks.push(<pre key={i}><code>{code.join('\n')}</code></pre>);code=null;}else code=[];return;}
    if(code){code.push(line);return;}
    if(line.startsWith('# '))blocks.push(<h2 key={i}>{inline(line.slice(2))}</h2>);
    else if(line.startsWith('## '))blocks.push(<h3 key={i}>{inline(line.slice(3))}</h3>);
    else if(line.trim())blocks.push(<p key={i}>{inline(line)}</p>);
  });
  return <article className="documentation">{blocks}</article>;
}
