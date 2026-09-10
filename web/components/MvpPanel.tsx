'use client';
import {useEffect,useState} from 'react';
import {api,post,stateNames} from '../lib/api';
import {Notice,JsonDetails} from './UI';

export default function MvpPanel({idea,refresh}:{idea:any;refresh:()=>void}){
  const version=idea.mvp_versions[0],job=idea.mvp_jobs?.[0],spec=version?.content,program=spec?.program;
  const [input,setInput]=useState<Record<string,any>>({}),[text,setText]=useState(''),[result,setResult]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{setInput({});setResult(null);if(version)api(`/ideas/${idea.id}/mvp/${version.id}/results`).then(rows=>setResult(rows[0]?.content||null)).catch(e=>setError(e.message));},[version?.id,idea.id]);
  async function action(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(!version&&!job)return null;
  return <section className="section-stack"><h2>MVP · {program?.title||'Сборка приложения'}</h2>
    {job&&<p role="status">Сборка: {stateNames[job.status]||job.status}{job.error&&' · '+job.error}</p>}
    {error&&<Notice kind="error">{error}</Notice>}
    {program&&<><p>{program.scenario}</p><JsonDetails title="Код, схемы и проверки сборки" value={spec}/>
      {program.input_fields.map((f:any)=><label key={f.name}>{f.label}{f.type==='boolean'?<select value={String(input[f.name]??false)} onChange={e=>setInput(v=>({...v,[f.name]:e.target.value==='true'}))}><option value="false">Нет</option><option value="true">Да</option></select>:<input type={f.type==='number'?'number':'text'} value={input[f.name]??''} onChange={e=>setInput(v=>({...v,[f.name]:f.type==='number'?Number(e.target.value):e.target.value}))}/>}</label>)}</>}
    {!program&&version&&<label>Вход MVP<textarea value={text} onChange={e=>setText(e.target.value)}/></label>}
    {version&&<div className="actions"><button className="primary" disabled={busy||(program&&spec.validation_status!=='passed')} onClick={()=>void action(async()=>{
      const values=program?Object.fromEntries(program.input_fields.map((f:any)=>[f.name,input[f.name]??(f.type==='boolean'?false:f.type==='number'?0:'')])):{};
      setResult(await post(`/ideas/${idea.id}/mvp/${version.id}/run`,program?{input:values}:{text}));
    })}>{busy?'Выполнение…':'Выполнить сценарий'}</button>
    <button className="secondary" disabled={busy||!result?.success||version.status==='ready'} onClick={()=>void action(async()=>{await post(`/ideas/${idea.id}/mvp/${version.id}/accept`);})}>Подтвердить приёмку по критериям</button></div>}
    {busy&&version&&<button className="secondary" onClick={()=>{void post(`/ideas/${idea.id}/mvp/${version.id}/cancel`).catch(e=>setError(e.message));}}>Остановить выполнение</button>}
    {result&&<><h3>Результат</h3><JsonDetails title="Выход приложения" value={result.output||result.label}/><JsonDetails title="Входы, выходы, длительность и компоненты" value={result}/></>}
  </section>;
}
