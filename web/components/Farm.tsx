'use client';
import {useCallback,useEffect,useState} from 'react';
import {api,post,ApiError,Idea,stageNames,priorityNames,formatDate,stateNames} from '../lib/api';
import {Icon,Notice,Empty} from './UI';
import IdeaEditor from './IdeaEditor';
import Research from './Research';
import Reports from './Reports';
import Settings from './Settings';
import AuthForm,{Account} from './AuthForm';

const navigation=[['funnel','Воронка'],['plus','Новая идея'],['card','Карточка'],['activity','Ход работы'],['chart','Прогоны и эффективность'],['report','Отчёт'],['settings','Настройки и документация']];
export default function Farm(){
  const [session,setSession]=useState<Account|null>(null),[checked,setChecked]=useState(false),[error,setError]=useState('');
  useEffect(()=>{api<Account>('/auth/me').then(setSession).catch(e=>{if(!(e instanceof ApiError&&e.status===401))setError(e.message);}).finally(()=>setChecked(true));},[]);
  if(!checked)return <main className="auth"><p role="status">Подключение к ферме…</p></main>;
  if(!session)return <AuthForm onLogin={account=>{setError('');setSession(account);}} error={error}/>;
  return <Workspace key={session.id} session={session} onLogout={()=>setSession(null)}/>;
}

function Workspace({session,onLogout}:{session:Account;onLogout:()=>void}){
  const [error,setError]=useState('');
  const [view,setView]=useState('funnel'),[ideas,setIdeas]=useState<Idea[]>([]),[selected,setSelected]=useState(''),[detail,setDetail]=useState<any>(null);
  const [integrations,setIntegrations]=useState<any>(null),[menu,setMenu]=useState(false),[loading,setLoading]=useState(false);
  const [archive,setArchive]=useState(false),[search,setSearch]=useState(''),[priority,setPriority]=useState('all');
  const refresh=useCallback(async()=>{try{setIdeas(await api('/ideas'));if(selected)setDetail(await api('/ideas/'+selected));}catch(e){setError((e as Error).message);}},[selected]);
  useEffect(()=>{if(session){void refresh();api('/integrations').then(setIntegrations).catch(()=>setIntegrations(null));}},[session,refresh]);
  useEffect(()=>{if(!session)return;const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[session,refresh]);
  const navigate=(id:string)=>{setView(id);setMenu(false);setError('');};
  const choose=(id:string,target='card')=>{setSelected(id);setDetail(null);navigate(target);};
  const saved=async(id:string)=>{setSelected(id);setView('card');setDetail(await api('/ideas/'+id));await refresh();};
  const visible=ideas.filter(i=>(i.stage==='archived')===archive&&i.title.toLowerCase().includes(search.toLowerCase())&&(priority==='all'||i.priority===Number(priority)));
  const current=detail?.id===selected?detail:null;
  return <div className="app-shell">
    <a href="#main" className="skip">К содержимому</a>
    <aside className={'sidebar '+(menu?'open':'')}>
      <button className="brand" onClick={()=>navigate('funnel')}><span className="brand-mark">⌄</span><span>Продуктовая ферма</span></button>
      <nav aria-label="Основная навигация">{navigation.map(([id,label])=><button key={id} onClick={()=>navigate(id)} className={'nav-item '+(view===id?'selected':'')} aria-current={view===id?'page':undefined}><Icon name={id}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><p className="provider-status"><span className={'status-dot '+(integrations?.provider?.status==='available'?'green':'')}/><span>ИИ-провайдер: {integrations?.provider?.status==='available'?'доступен':integrations?.provider?.status==='not_configured'?'не настроено':'недоступен'}</span></p><button className="nav-item" onClick={async()=>{try{await post('/auth/logout');onLogout();}catch(err){setError((err as Error).message);}}} title="Выйти"><Icon name="user"/>{session.username}<span className="logout">Выйти</span></button></div>
    </aside>
    <main id="main" className="main">
      <button className="mobile-menu" aria-label="Открыть навигацию" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Icon name="menu"/></button>
      {error&&<Notice kind="error">{error}<button className="text-button" onClick={()=>{setError('');void refresh();}}>Повторить</button></Notice>}
      {view==='funnel'?<>
        <header className="page-heading"><div><h1>Воронка идей</h1><p>Проверяйте гипотезы. Принимайте решения на данных.</p></div><button className="primary" onClick={()=>navigate('plus')}><Icon name="plus" size={20}/>Новая идея</button></header>
        <div className="stage-strip" aria-label="Этапы проверки">{['draft','queued','research','assessment','decision','mvp_ready'].map((stage,index)=><div key={stage}><Icon name={['report','clock','search','chart','card','activity'][index]}/><span>{stage==='assessment'?'Оценка':stage==='mvp_ready'?'MVP':stageNames[stage]}</span>{index<5&&<Icon name="arrow" size={17}/>}</div>)}</div>
        <div className="filters"><div className="tabs"><button className={!archive?'active':''} onClick={()=>setArchive(false)}>Активные</button><button className={archive?'active':''} onClick={()=>setArchive(true)}>Архив</button></div><label className="search"><Icon name="search" size={18}/><input aria-label="Найти идею" placeholder="Найти идею" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Приоритет" value={priority} onChange={e=>setPriority(e.target.value)}><option value="all">Приоритет: все</option>{priorityNames.map((p,i)=><option key={p} value={i}>{p}</option>)}</select></div>
        {visible.length?<div className="idea-list">{visible.map(idea=><button className="idea-row" key={idea.id} onClick={()=>choose(idea.id)}><div><h3>{idea.title}</h3><p>{idea.content.problem||'Проблема требует уточнения'}</p><span className="muted">Версия {idea.current_version} · {formatDate(idea.updated_at)}</span></div><div className="row-meta"><span className={'tag priority-'+idea.priority}>{priorityNames[idea.priority]}</span><strong>{stageNames[idea.stage]}</strong><span>{stateNames[idea.execution_state]}</span></div><Icon name="arrow"/></button>)}</div>:<Empty title={archive?'Архив пуст':search?'Ничего не найдено':'Начните с одной идеи'} text={archive?'Архивированные идеи сохраняют историю и освобождают место.':search?'Измените запрос или приоритет.':'Опишите задачу текстом или запишите голосом.'}>{!archive&&!search&&<button className="primary" onClick={()=>navigate('plus')}><Icon name="plus" size={20}/>Добавить идею</button>}</Empty>}
        <footer className="capacity">{ideas.length?`${ideas.filter(i=>i.stage!=='archived').length} из 10 активных идей`:'До 10 активных идей'} · 1 тяжёлый запуск одновременно</footer>
      </>:view==='plus'?<IdeaEditor onSaved={saved}/>:view==='settings'?<Settings integrations={integrations} onRefresh={async()=>setIntegrations(await api('/integrations'))}/>:<>
        <div className="idea-picker"><label>Идея<select value={selected} onChange={e=>choose(e.target.value,view)}><option value="">Выберите идею</option>{ideas.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label></div>
        {!selected?<Empty title="Выберите идею" text="Откройте карточку из воронки или выберите её в списке."/>:!current?<p role="status">Загрузка карточки…</p>:view==='card'?<IdeaEditor key={selected+':'+current.current_version} idea={current} onSaved={saved} onRefresh={refresh} onRun={()=>navigate('activity')} onDeleted={()=>{setSelected('');navigate('funnel');void refresh();}}/>:view==='activity'||view==='chart'?<Research idea={current} mode={view} refresh={refresh}/>:<Reports idea={current} refresh={refresh}/>}
      </>}
    </main>
  </div>;
}
