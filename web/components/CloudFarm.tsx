'use client';
import {useEffect,useState} from 'react';
import policy from '../farm/policy.json';
import AuthForm,{Account} from './AuthForm';
import {api,ApiError,post,stageNames,priorityNames} from '../lib/api';

const stages:Record<string,string>={analyzeIdea:'Разбор идеи',analyzeAudience:'Аудитория',researchMarketAndEvidence:'Рынок и источники',buildHypotheses:'Гипотезы',proposeVariants:'Варианты решения',prepareBaseline:'Данные для сравнения',runVariants:'Реальные прогоны',calculateEffect:'Расчёт эффекта',buildScenarios:'Сценарии',criticalAssessment:'Критическая оценка',buildReport:'Отчёт'};
const send=(path:string,body:unknown={})=>api(path,{method:'POST',body:JSON.stringify(body),headers:{'Idempotency-Key':crypto.randomUUID()}});

export default function CloudFarm(){
 const [account,setAccount]=useState<Account|null>(null),[loading,setLoading]=useState(true),[ideas,setIdeas]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[run,setRun]=useState<any>(null);
 const [audioId,setAudioId]=useState<string|null>(null),[audioCost,setAudioCost]=useState<string|null>(null);
 const [text,setText]=useState(''),[title,setTitle]=useState(''),[priority,setPriority]=useState(1),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>setIdeas(await api('/ideas'));
 useEffect(()=>{api<Account>('/auth/me').then(setAccount).catch(e=>{if(!(e instanceof ApiError&&e.status===401))setError(e.message);}).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(account)refresh().catch(e=>setError(e.message));},[account]);
 useEffect(()=>{
  if(!run?.id||!['queued','starting','running'].includes(run.status))return;
  let live=true;const timer=setInterval(()=>api('/research/'+run.id+'/status').then(value=>{if(live)setRun(value);}).catch(e=>{if(live)setError(e.message);}),3000);
  return()=>{live=false;clearInterval(timer);};
 },[run?.id,run?.status]);
 const act=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const open=async(id:string)=>{const idea=await api('/ideas/'+id);setSelected(idea);setText(idea.content.transcript||'');setTitle(idea.title);setPriority(idea.priority);setRun(idea.runs[0]?await api('/research/'+idea.runs[0].id+'/status'):null);};
 if(loading)return <main className="public-report"><p>Открываем ферму…</p></main>;
 if(!account)return <AuthForm onLogin={setAccount} error={error}/>;
 return <div className="farm-shell">
  <header className="farm-header"><strong>Продуктовая ферма</strong><a href="/docs">Как это работает</a><span>{account.username}</span><button className="secondary" onClick={()=>act(async()=>{await post('/auth/logout');setAccount(null);setSelected(null);setRun(null);})}>Выйти</button></header>
  <main className="farm-grid">
   <aside><h2>Ваши идеи</h2><button className="primary" onClick={()=>{setSelected(null);setRun(null);setAudioId(null);setAudioCost(null);setText('');setTitle('');setPriority(1);}}>Новая идея</button>
    <nav aria-label="Идеи">{ideas.map(idea=><button className={'farm-idea '+(selected?.id===idea.id?'selected':'')} key={idea.id} onClick={()=>act(()=>open(idea.id))}><strong>{idea.title}</strong><small>{stageNames[idea.stage]||idea.stage} · {priorityNames[idea.priority]}</small></button>)}</nav>
   </aside>
   <section aria-busy={busy}>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <h1>{selected?'Проверка идеи':'С какой идеи начнём?'}</h1>
    <p>Опишите идею. Ферма исследует аудиторию и рынок, сравнит варианты и подготовит рекомендацию. Вы сможете скорректировать исходные данные и принять решение по результату.</p>
    <p className="notice">ИИ и поиск оплачиваются через RouterAI. Предел исследования — {policy.budget.maxRunRub} ₽. Распознавание записи и выполнение MVP учитываются отдельно. Новые вызовы прекращаются при исчерпании бюджета.</p>
    <form onSubmit={event=>{event.preventDefault();act(async()=>{let idea=selected;const input={title:title.trim()||text.trim().slice(0,100),transcript:text,priority};if(idea){await api('/ideas/'+idea.id,{method:'PATCH',body:JSON.stringify(input)});}else idea=await send('/ideas',input);if(audioId)await post('/ideas/'+idea.id+'/audio',{artifactId:audioId});const started=await send('/ideas/'+idea.id+'/start');setSelected(idea);setRun(await api('/research/'+started.id+'/status'));await refresh();});}}>
     <label>Идея<textarea rows={6} required maxLength={20000} value={text} onChange={e=>setText(e.target.value)} placeholder="Например: сервис, который помогает…"/></label>
     <label className="file-button">Добавить голосовую запись<input type="file" accept="audio/webm,audio/wav,audio/mp4,audio/mpeg" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)act(async()=>{const form=new FormData();form.set('file',file);const result=await api('/audio',{method:'POST',body:form});setAudioId(result.artifactId);setAudioCost(result.usage?.cost==null?'Стоимость распознавания не подтверждена':`Распознавание: ${Number(result.usage.cost).toFixed(4)} ₽`);if(result.text)setText(result.text);if(result.warning)setError(result.warning);});event.target.value='';}}/></label>
     {audioCost&&<p role="status">{audioCost}</p>}
     <details><summary>Название и приоритет</summary><label>Название<input maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Приоритет<select value={priority} onChange={e=>setPriority(Number(e.target.value))}>{priorityNames.map((label,index)=><option value={index} key={label}>{label}</option>)}</select></label></details>
     <div className="actions"><button className="primary" disabled={busy||['queued','starting','running'].includes(run?.status)}>{selected?'Исследовать текущую версию':'Начать исследование'}</button>{selected&&<button type="button" className="secondary" disabled={busy} onClick={()=>act(async()=>{await post('/ideas/'+selected.id+'/archive');await refresh();await open(selected.id);})}>В архив</button>}</div>
    </form>
    {run&&<section className="farm-progress"><h2>{run.status==='completed'?'Исследование завершено':run.status==='cancelled'?'Исследование отменено':run.status==='failed'?'Исследование не завершено':stages[run.stage]||'В очереди'}</h2><progress max={100} value={run.progress}/><p>{run.progress}% · Можно закрыть вкладку: выполнение продолжается на сервере.</p>
     <Spending value={run.counters?.researchSpend}/>
     {!!run.stale&&<p className="notice">Этот результат относится к предыдущей версии идеи.</p>}
     {['queued','starting','running'].includes(run.status)&&<div className="actions"><button className="secondary" onClick={()=>act(async()=>{await post('/research/'+run.id+'/pause');setRun(await api('/research/'+run.id+'/status'));})}>Пауза</button><button className="secondary" onClick={()=>act(async()=>{await post('/research/'+run.id+'/cancel');setRun(await api('/research/'+run.id+'/status'));})}>Остановить</button></div>}
     {['paused','failed'].includes(run.status)&&<button className="primary" onClick={()=>act(async()=>{await post('/research/'+run.id+'/'+(run.status==='paused'?'resume':'retry'));setRun(await api('/research/'+run.id+'/status'));})}>{run.status==='paused'?'Продолжить':'Повторить незавершённое'}</button>}
     {run.reports?.[0]&&<CloudReport report={run.reports[0].content} onError={setError}/>}
     <details><summary>Действия фермы ({run.logs?.length||0})</summary><ol>{run.logs?.map((log:any)=><li key={log.id}><strong>{log.actorName}</strong> · {log.action} · {log.status}{log.durationMs!=null&&` · ${(log.durationMs/1000).toFixed(1)} с`}{log.model&&` · ${log.model}`}{log.provider==='routerai'&&` · ${log.usage?.costRub==null?'Стоимость не подтверждена':Number(log.usage.costRub).toFixed(4)+' ₽'}`}{log.error&&<p>{log.error}</p>}</li>)}</ol></details>
    </section>}
   </section>
  </main>
 </div>;
}

export function CloudReport({report,onError,readOnly=false}:{report:any;onError:(message:string)=>void;readOnly?:boolean}){
 const [criteria,setCriteria]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const decide=async(action:string)=>{setBusy(true);try{const value=await post('/reports/'+report.id+'/decision',{action,acceptance:criteria.split('\n').map(x=>x.trim()).filter(Boolean)});setMessage(value.mvp?'MVP поставлен в очередь.':'Решение сохранено.');if(value.mvp)window.location.href='/mvp/'+value.mvp.id;}catch(error){onError((error as Error).message);}finally{setBusy(false);}};
 return <article className="report-body"><div className="recommendation"><h2>{report.assessment?.recommendation||'Недостаточно данных'}</h2><p>{report.summary}</p><ul>{report.assessment?.reasons?.map((reason:string,index:number)=><li key={index}>{reason}</li>)}</ul></div>
  <Spending value={report.spending}/>
  <h3>Что проверить дальше</h3><p>{report.assessment?.nextExperiment}</p>
  <h3>Аргументы критика</h3><ul>{report.assessment?.counterarguments?.map((value:string,index:number)=><li key={index}>{value}</li>)}</ul>
  <h3>Аудитория и рынок</h3><p>{report.research?.summary}</p><ul>{report.audience?.personas?.map((persona:any,index:number)=><li key={index}>{persona.role}: {persona.pain}</li>)}</ul>
  <h3>Сравнение вариантов</h3><div className="auto-candidates">{report.plan?.variants?.map((variant:any)=><article key={variant.id}><h3>{variant.name}</h3><p>{variant.approach}</p></article>)}</div>
  <p>Данные: {report.baseline?.provenance==='SIMULATED'?'синтетические примеры, созданные агентом':'внешние данные; происхождение указано в отчёте'}. Повторения одной задачи не считаются независимыми наблюдениями.</p>
  <table><thead><tr><th>Вариант</th><th>Машинное время</th><th>Измеренная экономия</th><th>Ошибки</th></tr></thead><tbody>{report.calculation?.variants?.map((v:any)=><tr key={v.variantId}><td>{report.plan?.variants?.find((p:any)=>p.id===v.variantId)?.name||'Вариант'}</td><td>{v.machineSeconds==null?'Нет данных':v.machineSeconds.toFixed(2)+' с'}</td><td>{v.measuredEffect?v.measuredEffect.deltaSeconds.toFixed(2)+' с':'Недостаточно данных'}</td><td>{v.failures}/{v.attempts}</td></tr>)}</tbody></table>
  <h3>Ограничения</h3><ul>{[...(report.warnings||[]),...(report.calculation?.warnings||[]),...(report.baseline?.warnings||[]),...(report.research?.gaps||[])].map((warning:string,index:number)=><li key={index}>{warning}</li>)}</ul>
  <h3>Прогноз внедрения</h3><p>Сценарии основаны на допущениях об объёме, охвате и ручной доработке.</p><div className="scenario-grid">{Object.entries(report.calculation?.scenarios||{}).map(([name,entries])=><section className="scenario" key={name}><h3>{({negative:'Негативный',base:'Базовый',favorable:'Благоприятный'} as Record<string,string>)[name]||name}</h3>{(entries as any[]).map(v=><p key={v.variantId}>{report.plan?.variants?.find((p:any)=>p.id===v.variantId)?.name}: {v.monthlySeconds==null?'Не хватает baseline или объёма':(v.monthlySeconds/3600).toFixed(1)+' ч/месяц'}</p>)}</section>)}</div>
  <details><summary>Версии и происхождение</summary><p>Версия идеи: {report.versions?.ideaVersionId}</p><p>Исследование: {report.versions?.researchRunId}</p><p>Набор данных: {report.versions?.datasetVersionId||'Не сформирован'}</p><p>Метод: {report.calculation?.method?.name||'Расчёт недоступен'}. Число пересэмплирований: {report.calculation?.method?.resamples||'—'}</p></details>
  <h3>Источники</h3><p>Ниже — цитаты, возвращённые поиском. Полные страницы ферма не читала.</p>{report.sources?.map((source:any)=><section key={source.id}><a href={/^https:\/\//.test(source.url)?source.url:undefined} target="_blank" rel="noopener noreferrer">{source.title||source.url}</a><p>{source.publisher||source.domain||source.organization} · Публикация: {source.published_at||'дата неизвестна'} · Обращение: {source.accessed_at||'не указано'}</p>{source.snippet?<blockquote>{source.snippet}</blockquote>:<p>Текст цитаты не предоставлен; ссылка сама по себе не подтверждает утверждение.</p>}{source.supported_claim&&<p>Связанный вывод: {source.supported_claim}</p>}<details><summary>Происхождение</summary><p>{source.provider} · {source.search_engine} · {source.query}</p></details></section>)}
  {!readOnly&&<section><h3>Ваше решение</h3>{report.assessment?.recommendation==='Развивать'&&<label>Критерии приёмки MVP, по одному на строку<textarea value={criteria} onChange={e=>setCriteria(e.target.value)}/></label>}<div className="actions"><button disabled={busy||!criteria.trim()||report.assessment?.recommendation!=='Развивать'} className="primary" onClick={()=>decide('develop')}>Создать MVP</button><button disabled={busy} className="secondary" onClick={()=>decide('revise')}>Сначала проверить</button><button disabled={busy} className="secondary" onClick={()=>decide('stop')}>Остановить идею</button></div><p role="status">{message}</p></section>}
 </article>;
}


function Spending({value}:{value:any}){if(!value)return null;return <p className="notice">Расходы исследования: {Number(value.actualRub||0).toFixed(4)} ₽ подтверждено из {value.limitRub} ₽. {value.reservedRub>0&&`Зарезервировано ${Number(value.reservedRub).toFixed(2)} ₽; стоимость ${value.unpricedCalls||0} вызовов не подтверждена.`}</p>;}
