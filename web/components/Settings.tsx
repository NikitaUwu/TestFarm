'use client';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {Notice,JsonDetails} from './UI';
import Documentation from './Documentation';
export default function Settings({integrations,onRefresh}:{integrations:any;onRefresh:()=>Promise<void>}){
  const [docs,setDocs]=useState<any[]>([]),[config,setConfig]=useState<any>(null),[error,setError]=useState(''),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{Promise.all([api('/documentation'),api('/configuration')]).then(([d,c])=>{setDocs(d);setConfig(c);}).catch(e=>setError(e.message));},[]);
  return <section><header className="page-heading"><div><h1>Настройки и документация</h1><p>Интеграции, версии политик и устройство фермы.</p></div></header>{error&&<Notice kind="error">{error}</Notice>}<h2>Подключения</h2><div className="integration-list">{Object.entries(integrations||{}).map(([name,value]:[string,any])=><div key={name}><strong>{{provider:'ИИ-провайдер',storage:'Хранилище файлов',runner:'Runner',rules:'Сервис правил'}[name]}</strong><span className={'tag '+(value.status==='available'?'positive':'')}>{({available:'Доступно',not_configured:'Не настроено',unavailable:'Недоступно',error:'Ошибка'} as Record<string,string>)[value.status]||value.status}</span><p>{value.provider==='groq'?'Groq Cloud · ':''}{value.message} {value.model}{value.transcription_model&&<> · Речь: {value.transcription_model}</>}</p></div>)}</div><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{await onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Проверка…':'Проверить подключения'}</button>
    <div className="section-stack"><h2>Версионные политики</h2><p>Промпты, модели, критерии, лимиты и визуальные токены отделены от интерфейса. Каждый запуск сохраняет собственный снимок конфигурации.</p>{config&&Object.entries(config).map(([name,value])=><JsonDetails key={name} title={name} value={value}/>)}</div>
    <div className="section-stack"><h2>Документация</h2><label>Раздел<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Выберите документ</option>{docs.map(d=><option key={d.name}>{d.name}</option>)}</select></label>{selected?<Documentation content={docs.find(d=>d.name===selected)?.content||'Документ не найден'} name={selected} onSelect={setSelected}/>:<p className="muted">Контекст, требования, архитектура, интеграции, расчёт, запуск и политика данных.</p>}</div>
  </section>;
}

