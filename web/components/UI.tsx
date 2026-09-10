import type {ReactNode} from 'react';
export function Icon({name,size=22}:{name:string;size?:number}){
  const paths:Record<string,ReactNode>={
    funnel:<><path d="M3 4h18l-7 8v8l-4-2v-6z"/></>,
    plus:<><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    card:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 13h5M7 16h8"/></>,
    activity:<><path d="m3 17 6-6 4 3 8-10M15 4h6v6"/></>,
    chart:<><path d="M4 20V12h4v8M10 20V8h4v12M16 20V3h4v17M2 20h20"/></>,
    report:<><path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 16h6"/></>,
    settings:<><path d="m9 3-1 3-3 1v4l-2 1 2 3v3l3 1 1 2h6l1-2 3-1v-3l2-3-2-1V7l-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></>,
    search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6h5"/></>,
    user:<><circle cx="12" cy="7" r="3"/><path d="M5 21v-4c0-5 14-5 14 0v4z"/></>,
    arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
    menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
    mic:<><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.report}</svg>;
}
export function Notice({children,kind='info'}:{children:ReactNode;kind?:string}){return <div className={'notice '+kind} role={kind==='error'?'alert':'status'}>{children}</div>;}
export function Empty({title='Нет данных',text,children}:{title?:string;text:string;children?:ReactNode}){return <div className="empty"><Icon name="report" size={88}/><h2>{title}</h2><p>{text}</p>{children}</div>;}
export function JsonDetails({title,value}:{title:string;value:unknown}){return <details><summary>{title}</summary><pre>{JSON.stringify(value,null,2)}</pre></details>;}
export function NumberValue({value,digits=2}:{value:number|null|undefined;digits?:number}){return <>{typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ru-RU',{maximumFractionDigits:digits}):'Нет данных'}</>;}
