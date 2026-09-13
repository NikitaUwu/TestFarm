'use client';
import {useEffect,useState,useMemo} from 'react';
import policy from '../farm/policy.json';
import AuthForm,{Account} from './AuthForm';
import LandingPage from './LandingPage';
import {api,ApiError,post,del,stageNames,priorityNames,formatDate} from '../lib/api';
import {
  Icon,
  Badge,
  MetricCard,
  VerdictBanner,
  ViabilityGauge,
  calculateViabilityScore,
  VoiceRecorder,
  PromptTemplates,
  ConfirmModal,
  Notice,
  Empty,
  NumberValue,
} from './UI';
import { PitchCardModal } from './PitchCardModal';
import { LiveIntelStream } from './LiveIntelStream';
import { WhatIfSandbox } from './WhatIfSandbox';
import { PostMvpMonitoring } from './PostMvpMonitoring';

const STAGE_LABELS:Record<string,string>={
  draft:'Черновик',
  queued:'В очереди',
  research:'Исследование',
  assessment:'Критическая оценка',
  decision:'Ожидает решения',
  mvp_building:'Сборка прототипа',
  mvp_ready:'Прототип готов',
  archived:'В архиве',
};

const RUN_STAGES:Record<string,{name:string;desc:string;step:number}>={
  analyzeIdea:{name:'Разбор идеи',desc:'Структурирование проблемы и ценности',step:1},
  analyzeAudience:{name:'Аудитория и боли',desc:'Определение целевых персон и сценариев',step:2},
  researchMarketAndEvidence:{name:'Рынок и источники',desc:'Поиск существующих аналогов и фактов',step:3},
  buildHypotheses:{name:'Формирование гипотез',desc:'Формулирование проверяемых предположений',step:4},
  proposeVariants:{name:'Варианты решения',desc:'Сравнение архитектурных подходов',step:5},
  prepareBaseline:{name:'Контрольные кейсы',desc:'Подготовка данных для сравнения',step:6},
  runVariants:{name:'Тестовые прогоны',desc:'Проверка вариантов на контрольных задачах',step:7},
  calculateEffect:{name:'Расчёт эффекта',desc:'Статистическое моделирование экономии',step:8},
  buildScenarios:{name:'Сценарии внедрения',desc:'Оценка эффекта в разных условиях',step:9},
  criticalAssessment:{name:'Критическая оценка',desc:'Проверка независимым экспертом и стоп-факторы',step:10},
  buildReport:{name:'Итоговый отчёт',desc:'Формирование структурированного заключения',step:11},
};

const send=(path:string,body:unknown={})=>api(path,{method:'POST',body:JSON.stringify(body),headers:{'Idempotency-Key':crypto.randomUUID()}});

export default function CloudFarm(){
  const [account,setAccount]=useState<Account|null>(null);
  const [loading,setLoading]=useState(true);
  const [ideas,setIdeas]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [run,setRun]=useState<any>(null);
  const [audioId,setAudioId]=useState<string|null>(null);
  const [audioCost,setAudioCost]=useState<string|null>(null);
  const [text,setText]=useState('');
  const [title,setTitle]=useState('');
  const [priority,setPriority]=useState(1);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [searchQuery,setSearchQuery]=useState('');
  const [deleteModalOpen,setDeleteModalOpen]=useState(false);
  const [ideaToDelete,setIdeaToDelete]=useState<any>(null);

  const refresh=async()=>setIdeas(await api('/ideas'));

  useEffect(()=>{
    api<Account>('/auth/me')
      .then(setAccount)
      .catch(e=>{if(!(e instanceof ApiError&&e.status===401))setError(e.message);})
      .finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{
    if(account)refresh().catch(e=>setError(e.message));
  },[account]);

  useEffect(()=>{
    if(!run?.id||!['queued','starting','running'].includes(run.status))return;
    let live=true;
    const timer=setInterval(()=>api('/research/'+run.id+'/status').then(value=>{
      if(live)setRun(value);
    }).catch(e=>{
      if(live)setError(e.message);
    }),3000);
    return()=>{live=false;clearInterval(timer);};
  },[run?.id,run?.status]);

  const act=async(fn:()=>Promise<void>)=>{
    setBusy(true);
    setError('');
    try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };

  const open=async(id:string)=>{
    act(async()=>{
      const idea=await api('/ideas/'+id);
      setSelected(idea);
      setText(idea.content.transcript||'');
      setTitle(idea.title);
      setPriority(idea.priority);
      setRun(idea.runs[0]?await api('/research/'+idea.runs[0].id+'/status'):null);
      setAudioId(null);
      setAudioCost(null);
    });
  };

  const startNewIdea=()=>{
    setSelected(null);
    setText('');
    setTitle('');
    setPriority(1);
    setRun(null);
    setAudioId(null);
    setAudioCost(null);
    setError('');
  };

  const handleVoiceComplete=async(blob:Blob)=>{
    setBusy(true);
    setError('');
    try{
      const form=new FormData();
      const rawType = (blob.type || '').split(';')[0].trim().toLowerCase();
      const ext = rawType.includes('mp4') ? 'mp4' : rawType.includes('wav') ? 'wav' : rawType.includes('ogg') ? 'ogg' : 'webm';
      const cleanMime = rawType || 'audio/webm';
      form.set('file',new File([blob],`voice_record.${ext}`,{type:cleanMime}));
      const result=await api('/audio',{method:'POST',body:form});
      setAudioId(result.artifactId);
      if(result.usage?.cost!=null){
        setAudioCost(`Распознано: ${Number(result.usage.cost).toFixed(4)} ₽`);
      }
      if(result.text){
        setText(prev=>prev?`${prev}\n\n${result.text}`:result.text);
      }
      if(result.warning)setError(result.warning);
    }catch(e:any){
      setError(e.message||'Не удалось распознать запись');
    }finally{
      setBusy(false);
    }
  };

  const handleFileUpload=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    setBusy(true);
    setError('');
    try{
      const body=new FormData();
      body.append('file',file,file.name);
      const res=await fetch('/api/audio/transcribe',{method:'POST',body});
      if(!res.ok){
        const errData=await res.json().catch(()=>({error:'Ошибка распознавания'}));
        throw new Error(errData.error||`HTTP ${res.status}`);
      }
      const result=await res.json();
      if(result.artifactId)setAudioId(result.artifactId);
      if(result.usage?.cost!=null){
        setAudioCost(`Распознано: ${Number(result.usage.cost).toFixed(4)} ₽`);
      }
      if(result.text){
        setText(prev=>prev?`${prev}\n\n${result.text}`:result.text);
      }
      if(result.warning)setError(result.warning);
    }catch(e:any){
      setError(e.message||'Ошибка загрузки аудио');
    }finally{
      setBusy(false);
      e.target.value='';
    }
  };

  const handleDeleteIdea=async()=>{
    if(!ideaToDelete)return;
    setBusy(true);
    setError('');
    try{
      await del('/ideas/'+ideaToDelete.id);
      setDeleteModalOpen(false);
      if(selected?.id===ideaToDelete.id){
        startNewIdea();
      }
      setIdeaToDelete(null);
      await refresh();
    }catch(e:any){
      setError(e.message||'Не удалось удалить идею');
    }finally{
      setBusy(false);
    }
  };

  const filteredIdeas=useMemo(()=>{
    if(!searchQuery.trim())return ideas;
    const q=searchQuery.toLowerCase();
    return ideas.filter(i=>i.title.toLowerCase().includes(q)||(i.content?.transcript||'').toLowerCase().includes(q));
  },[ideas,searchQuery]);

  if(loading)return(
    <main className="farm-loading-screen">
      <div className="farm-loading-box">
        <Icon name="sparkles" size={32} className="spin-slow" />
        <p>Загрузка Продуктовой фермы…</p>
      </div>
    </main>
  );

  if(!account)return <LandingPage onLogin={setAccount} error={error}/>;

  const currentSpending=run?.counters?.researchSpend;
  const currentStepInfo=run?.stage?RUN_STAGES[run.stage]:null;

  return(
    <div className="farm-shell">
      {/* Верхняя навигационная панель */}
      <header className="farm-header">
        <div className="farm-header-left">
          <div className="farm-brand">
            <span className="farm-brand-mark"><Icon name="sparkles" size={20}/></span>
            <div>
              <strong>Продуктовая ферма</strong>
              <span className="farm-tagline">Автономный валидатор идей</span>
            </div>
          </div>
          <a href="/docs" className="farm-docs-link">
            <Icon name="report" size={16}/>
            <span>Как это работает</span>
          </a>
        </div>

        <div className="farm-header-right">
          {currentSpending&&(
            <div className="farm-budget-pill">
              <span className="farm-budget-dot" />
              <span>Расход: <strong>{Number(currentSpending.actualRub||0).toFixed(2)} ₽</strong> из {policy.budget.maxRunRub} ₽</span>
            </div>
          )}
          <div className="farm-user-pill">
            <span className="farm-user-avatar">{account.username.charAt(0).toUpperCase()}</span>
            <span className="farm-user-name">{account.username}</span>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-subtle ui-btn-sm"
            onClick={()=>act(async()=>{await post('/auth/logout');setAccount(null);startNewIdea();})}
          >
            Выйти
          </button>
        </div>
      </header>

      {/* Основная рабочая область */}
      <div className="farm-layout">
        {/* Сайдбар со списком идей (зафиксирован sticky) */}
        <aside className="farm-sidebar">
          <div className="farm-sidebar-top">
            <div className="farm-sidebar-title-row">
              <h3>Мои идеи</h3>
              <span className="farm-ideas-count">{ideas.length} / {policy.budget.activeIdeas}</span>
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-primary ui-btn-block"
              onClick={startNewIdea}
            >
              <Icon name="plus" size={18} />
              <span>Новая идея</span>
            </button>
            {ideas.length>0&&(
              <div className="farm-search-box">
                <Icon name="search" size={16} />
                <input
                  type="text"
                  placeholder="Поиск по идеям…"
                  value={searchQuery}
                  onChange={e=>setSearchQuery(e.target.value)}
                />
              </div>
            )}
          </div>

          <nav className="farm-ideas-list" aria-label="Список идей">
            {filteredIdeas.length===0?(
              <div className="farm-sidebar-empty">
                <p>{searchQuery?'Ничего не найдено':'Нет сохранённых идей'}</p>
              </div>
            ):(
              filteredIdeas.map(idea=>{
                const isSelected=selected?.id===idea.id;
                const isRunning=['queued','starting','research','assessment','mvp_building'].includes(idea.stage);
                return(
                  <div
                    key={idea.id}
                    className={`farm-idea-item ${isSelected?'selected':''}`}
                    onClick={()=>open(idea.id)}
                  >
                    <div className="farm-idea-item-header">
                      <Badge
                        variant={
                          idea.stage==='decision'||idea.stage==='mvp_ready'?'emerald':
                          isRunning?'amber':
                          idea.stage==='archived'?'neutral':'indigo'
                        }
                        dot={isRunning}
                      >
                        {STAGE_LABELS[idea.stage]||idea.stage}
                      </Badge>
                      <button
                        type="button"
                        className="farm-idea-delete-btn"
                        title="Удалить идею"
                        onClick={(e)=>{
                          e.stopPropagation();
                          setIdeaToDelete(idea);
                          setDeleteModalOpen(true);
                        }}
                      >
                        <Icon name="trash" size={14}/>
                      </button>
                    </div>
                    <strong className="farm-idea-title">{idea.title}</strong>
                    <div className="farm-idea-item-footer">
                      <span className="farm-idea-priority">
                        {priorityNames[idea.priority]} приоритет
                      </span>
                      {idea.updatedAt&&(
                        <span className="farm-idea-date">{formatDate(idea.updatedAt)}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </nav>
        </aside>

        {/* Центральная колонка карточки / ввода */}
        <main className="farm-content" aria-busy={busy}>
          {error&&<Notice kind="error">{error}</Notice>}

          {/* Карточка ввода новой идеи или редактирования */}
          <section className="farm-card farm-intake-card">
            <div className="farm-card-header">
              <div>
                <span className="farm-card-tag">{selected?'Управление идеей':'Проверка идеи'}</span>
                <h1 className="farm-main-title">{selected?selected.title:'С какой идеи начнём?'}</h1>
              </div>
              {selected&&(
                <div className="farm-card-header-actions">
                  <Badge variant={priority===2?'amber':priority===0?'neutral':'indigo'}>
                    {priorityNames[priority]} приоритет
                  </Badge>
                  <button
                    type="button"
                    className="ui-btn ui-btn-danger-outline ui-btn-sm"
                    onClick={()=>{
                      setIdeaToDelete(selected);
                      setDeleteModalOpen(true);
                    }}
                  >
                    <Icon name="trash" size={14}/>
                    <span>Удалить</span>
                  </button>
                </div>
              )}
            </div>

            <p className="farm-main-desc">
              Опишите идею простыми словами или надиктуйте голосом. Ферма самостоятельно изучит открытые источники, сопоставит альтернативы, проверит контрольные сценарии и подготовит экономический расчёт.
            </p>

            {/* Шаблоны для быстрого старта (только при создании) */}
            {!selected&&<PromptTemplates onSelect={tmpl=>{
              setTitle(tmpl.title);
              setText(tmpl.text);
              setPriority(tmpl.priority);
            }}/>}

            <form onSubmit={event=>{
              event.preventDefault();
              act(async()=>{
                let idea=selected;
                const input={
                  title:title.trim()||text.trim().slice(0,80)||'Новая идея',
                  transcript:text,
                  priority,
                };
                if(idea){
                  await api('/ideas/'+idea.id,{method:'PATCH',body:JSON.stringify(input)});
                }else{
                  idea=await send('/ideas',input);
                }
                if(audioId)await post('/ideas/'+idea.id+'/audio',{artifactId:audioId});
                const started=await send('/ideas/'+idea.id+'/start');
                setSelected(idea);
                setRun(await api('/research/'+started.id+'/status'));
                await refresh();
              });
            }}>
              {/* Поле ввода сути идеи — сразу доступно без прокрутки */}
              <div className="farm-field-group">
                <label className="farm-label">
                  <span>Суть идеи и сценарий</span>
                  <textarea
                    rows={4}
                    required
                    maxLength={20000}
                    value={text}
                    onChange={e=>setText(e.target.value)}
                    placeholder="Какую проблему решает продукт? Кто пользователь и как эта задача закрывается сегодня? Опишите сценарий в свободной форме или надиктуйте голосом…"
                    className="farm-textarea"
                  />
                </label>
              </div>

              {/* Панель голосового ввода (микрофон + файл) сразу под полем ввода */}
              <div className="farm-voice-section">
                <div className="farm-voice-tools">
                  <VoiceRecorder
                    onRecordingComplete={handleVoiceComplete}
                    disabled={busy}
                  />
                  <label className="ui-btn ui-btn-subtle file-upload-btn">
                    <Icon name="upload" size={16}/>
                    <span>Загрузить аудиофайл</span>
                    <input
                      type="file"
                      accept="audio/webm,audio/wav,audio/mp4,audio/mpeg"
                      disabled={busy}
                      onChange={handleFileUpload}
                      style={{display:'none'}}
                    />
                  </label>
                </div>
                {audioCost&&<span className="farm-audio-status"><Icon name="checkCircle" size={14}/> {audioCost}</span>}
              </div>

              {/* Компактный блок параметров (Название и Приоритет) */}
              <div className="farm-params-card farm-params-card-compact">
                <div className="farm-params-header">
                  <div className="farm-params-icon">
                    <Icon name="settings" size={15}/>
                  </div>
                  <div>
                    <strong>Название и приоритет</strong>
                    <span className="farm-params-sub">Уточните заголовок для карточки и позицию в очереди</span>
                  </div>
                </div>

                <div className="farm-params-grid">
                  <label className="farm-label">
                    <span>Название идеи</span>
                    <input
                      type="text"
                      maxLength={180}
                      value={title}
                      onChange={e=>setTitle(e.target.value)}
                      placeholder="Краткое название (или создастся по тексту)"
                      className="farm-input farm-input-compact"
                    />
                  </label>

                  <div className="farm-priority-picker">
                    <span className="farm-priority-label">Приоритет в очереди</span>
                    <div className="farm-priority-chips" role="radiogroup" aria-label="Приоритет в очереди">
                      {priorityNames.map((label,idx)=>{
                        const isSelected=priority===idx;
                        const colors=['priority-low','priority-normal','priority-high'];
                        return(
                          <button
                            key={label}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            className={`farm-priority-chip ${colors[idx]} ${isSelected?'active':''}`}
                            onClick={()=>setPriority(idx)}
                          >
                            <span className="priority-dot" />
                            <span className="priority-title">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="farm-form-actions">
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary ui-btn-lg"
                  disabled={busy||!text.trim()||['queued','starting','running'].includes(run?.status)}
                >
                  <Icon name="rocket" size={18} />
                  <span>{selected?'Запустить повторное исследование':'Запустить исследование идеи'}</span>
                </button>
                {selected&&(
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary"
                    disabled={busy}
                    onClick={()=>act(async()=>{
                      await post('/ideas/'+selected.id+'/archive');
                      await refresh();
                      await open(selected.id);
                    })}
                  >
                    <Icon name="archive" size={16}/>
                    <span>В архив</span>
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Ход исследования и статус работы */}
          {run&&(
            <section className="farm-card farm-progress-card">
              <div className="farm-progress-header">
                <div>
                  <span className="farm-card-tag">Процесс валидации</span>
                  <h2 className="farm-progress-title">
                    {run.status==='completed'?'Исследование завершено':
                     run.status==='cancelled'?'Исследование отменено':
                     run.status==='failed'?'Исследование остановлено с ошибкой':
                     currentStepInfo?.name||'Подготовка в очереди'}
                  </h2>
                  {currentStepInfo&&(
                    <p className="farm-progress-sub">{currentStepInfo.desc}</p>
                  )}
                </div>
                <div className="farm-progress-badge-wrap">
                  <Badge
                    variant={
                      run.status==='completed'?'emerald':
                      run.status==='failed'?'rose':
                      run.status==='cancelled'?'neutral':'amber'
                    }
                    dot={['queued','starting','running'].includes(run.status)}
                  >
                    {run.status==='completed'?'Готово к решению':
                     run.status==='failed'?'Ошибка':
                     run.status==='cancelled'?'Отменено':
                     `${run.progress}% завершено`}
                  </Badge>
                </div>
              </div>

              {/* Прогресс-бар */}
              <div className="farm-progress-bar-wrap">
                <div className="farm-progress-track">
                  <div
                    className="farm-progress-fill"
                    style={{width:`${Math.max(5,run.progress)}%`}}
                  />
                </div>
                <div className="farm-progress-meta">
                  <span>Шаг {currentStepInfo?.step||1} из 11</span>
                  <span>Можно закрыть вкладку: исследование выполняется в облаке автономно</span>
                </div>
              </div>

              {/* Дорожная карта шагов (Stepper) */}
              <div className="farm-stepper">
                {Object.entries(RUN_STAGES).map(([stageKey,stageData])=>{
                  const currentIdx=currentStepInfo?.step||0;
                  const isDone=run.status==='completed'||stageData.step<currentIdx;
                  const isCurrent=run.status!=='completed'&&stageData.step===currentIdx;
                  return(
                    <div
                      key={stageKey}
                      className={`farm-stepper-item ${isDone?'done':''} ${isCurrent?'active':''}`}
                    >
                      <div className="farm-stepper-dot">
                        {isDone?<Icon name="check" size={12}/>:stageData.step}
                      </div>
                      <span className="farm-stepper-label">{stageData.name}</span>
                    </div>
                  );
                })}
              </div>

              {/* Стрим активного ожидания ИИ-исследования */}
              {['queued','starting','running'].includes(run.status)&&(
                <LiveIntelStream run={run} currentStepInfo={currentStepInfo} />
              )}

              {/* Кнопки управления процессом */}
              {['queued','starting','running'].includes(run.status)&&(
                <div className="farm-run-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary"
                    onClick={()=>act(async()=>{
                      await post('/research/'+run.id+'/pause');
                      setRun(await api('/research/'+run.id+'/status'));
                    })}
                  >
                    <Icon name="pause" size={16}/>
                    <span>Приостановить</span>
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-danger-outline"
                    onClick={()=>act(async()=>{
                      await post('/research/'+run.id+'/cancel');
                      setRun(await api('/research/'+run.id+'/status'));
                    })}
                  >
                    <Icon name="x" size={16}/>
                    <span>Остановить исследование</span>
                  </button>
                </div>
              )}

              {['paused','failed'].includes(run.status)&&(
                <div className="farm-run-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    onClick={()=>act(async()=>{
                      await post('/research/'+run.id+'/'+(run.status==='paused'?'resume':'retry'));
                      setRun(await api('/research/'+run.id+'/status'));
                    })}
                  >
                    <Icon name="play" size={16}/>
                    <span>{run.status==='paused'?'Продолжить исследование':'Повторить попытку'}</span>
                  </button>
                </div>
              )}

              {/* Если готов итоговый отчет — монтируем скроллируемый дашборд */}
              {run.reports?.[0]&&(
                <div className="farm-report-section">
                  <CloudReport
                    report={run.reports[0].content}
                    reportId={run.reports[0].id}
                    onError={setError}
                  />
                </div>
              )}

              {/* Технический аудит (свернут для чистоты интерфейса) */}
              {run.logs?.length>0&&(
                <details className="farm-tech-passport">
                  <summary>
                    <Icon name="shield" size={16}/>
                    <span>Технический паспорт и журнал аудита ({run.logs.length} операций)</span>
                  </summary>
                  <div className="farm-tech-logs">
                    <p className="farm-tech-desc">
                      Полный аудит вызовов для проверки соответствия стандартам автономности:
                    </p>
                    <ol className="farm-log-list">
                      {run.logs.map((log:any)=>(
                        <li key={log.id} className="farm-log-item">
                          <div className="farm-log-row">
                            <strong>{log.actorName}</strong>
                            <span className="farm-log-action">{log.action}</span>
                            <Badge variant={log.status==='completed'?'emerald':log.status==='failed'?'rose':'neutral'}>
                              {log.status}
                            </Badge>
                            {log.durationMs!=null&&(
                              <span className="farm-log-time">{(log.durationMs/1000).toFixed(1)} с</span>
                            )}
                            {log.usage?.costRub!=null&&(
                              <span className="farm-log-cost">{Number(log.usage.costRub).toFixed(4)} ₽</span>
                            )}
                          </div>
                          {log.error&&<p className="farm-log-error">{log.error}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Модальное окно подтверждения удаления */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Удалить идею?"
        text={`Вы действительно хотите удалить идею «${ideaToDelete?.title||'Без названия'}»? Все сохранённые прогоны, расчёты и прототипы будут безвозвратно удалены.`}
        confirmLabel="Да, удалить"
        cancelLabel="Отмена"
        busy={busy}
        onConfirm={handleDeleteIdea}
        onCancel={()=>{
          setDeleteModalOpen(false);
          setIdeaToDelete(null);
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Комплексный дашборд аналитического отчета (Вариант А с якорной навигацией)
// -----------------------------------------------------------------------------
export function CloudReport({
  report,
  reportId,
  onError,
  readOnly=false,
}:{
  report:any;
  reportId?:string;
  onError:(message:string)=>void;
  readOnly?:boolean;
}){
  const [criteria,setCriteria]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState(false);
  const [pitchModalOpen,setPitchModalOpen]=useState(false);
  const [sourcesExpanded,setSourcesExpanded]=useState(false);

  const viabilityScore=calculateViabilityScore(report);

  const decide=async(action:string)=>{
    setBusy(true);
    try{
      const id=reportId||report.id;
      const value=await post('/reports/'+id+'/decision',{
        action,
        acceptance:criteria.split('\n').map(x=>x.trim()).filter(Boolean),
      });
      setMessage(value.mvp?'Прототип поставлен в очередь сборки.':'Решение зафиксировано.');
      if(value.mvp){
        window.location.href='/mvp/'+value.mvp.id;
      }
    }catch(error){
      onError((error as Error).message);
    }finally{
      setBusy(false);
    }
  };

  const handleShare=async()=>{
    try{
      const id=reportId||report.id;
      const res=await post('/reports/'+id+'/share');
      const shareUrl=window.location.origin+res.path;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(()=>setCopied(false),3000);
    }catch(e:any){
      onError('Не удалось сформировать ссылку');
    }
  };

  const baseScenario=report.calculation?.scenarios?.base?.[0];
  const monthlyHours=baseScenario?.monthlySeconds!=null?(baseScenario.monthlySeconds/3600).toFixed(1):null;
  const bestVariant=report.calculation?.variants?.[0];
  const deltaSec=bestVariant?.measuredEffect?.deltaSeconds!=null?bestVariant.measuredEffect.deltaSeconds.toFixed(1):null;
  const sourcesCount=report.sources?.length||0;

  return(
    <article className="report-dashboard">
      {/* Якорная навигационная панель отчёта */}
      <nav className="report-anchor-nav" aria-label="Разделы отчёта">
        <a href="#verdict"><Icon name="rocket" size={15}/> Вердикт</a>
        <a href="#economics"><Icon name="calculator" size={15}/> Экономика</a>
        <a href="#variants"><Icon name="scale" size={15}/> Варианты</a>
        <a href="#market"><Icon name="user" size={15}/> Рынок и ЦА</a>
        <a href="#risks"><Icon name="shield" size={15}/> Риски</a>
        <a href="#sources"><Icon name="search" size={15}/> Источники ({sourcesCount})</a>
        <a href="#monitoring"><Icon name="activity" size={15}/> Мониторинг</a>
        {!readOnly&&<a href="#decision" className="nav-accent"><Icon name="checkCircle" size={15}/> Решение</a>}
        <button
          type="button"
          className="report-nav-pitch-btn"
          onClick={()=>setPitchModalOpen(true)}
          title="Сформировать Pitch Card для чатов и руководства"
        >
          <Icon name="share" size={14}/>
          <span>Pitch Card</span>
        </button>
      </nav>

      {/* 1. Вердикт аналитической системы */}
      <section id="verdict" className="report-section">
        <VerdictBanner
          recommendation={report.assessment?.recommendation||'Недостаточно данных'}
          summary={report.summary||'Исследование завершено'}
          reasons={report.assessment?.reasons||[]}
          viabilityScore={viabilityScore}
          onOpenPitchCard={()=>setPitchModalOpen(true)}
        />

        {/* Ключевые показатели */}
        <div className="report-metrics-grid">
          <MetricCard
            title="Ожидаемая экономия времени"
            value={monthlyHours?`${monthlyHours} ч/мес`:'Требует данных'}
            subtitle="В базовом сценарии внедрения"
            icon="calculator"
            highlight={true}
          />
          <MetricCard
            title="Чистая разница на операцию"
            value={deltaSec?`${deltaSec} сек`:'—'}
            subtitle="Экономия на 1 обращение / задачу"
            icon="clock"
          />
          <MetricCard
            title="Проверено источников"
            value={`${sourcesCount} подтверждений`}
            subtitle="Цитаты и данные из открытых источников"
            icon="search"
          />
          <MetricCard
            title="Автоматическая валидация"
            value={report.calculation?.eligible?'Подтверждено':'Ограничено'}
            subtitle={report.calculation?.eligible?'Статистически значимый эффект':'Недостаточная выборка'}
            icon="shield"
          />
        </div>
      </section>

      {/* 2. Прогноз экономического эффекта */}
      <section id="economics" className="report-section">
        <div className="report-section-header">
          <div>
            <span className="report-section-tag">Экономическая модель</span>
            <h2>Прогноз внедрения и экономия ресурсов</h2>
          </div>
          <p className="report-section-desc">
            Моделирование рассчитано методом парного бутстрапа по результатам тестовых прогонов.
          </p>
        </div>

        {/* Карточки сценариев внедрения */}
        <div className="scenario-cards-grid">
          {Object.entries(report.calculation?.scenarios||{}).map(([name,entries]:any)=>{
            const titles:Record<string,string>={negative:'Консервативный',base:'Базовый (ожидаемый)',favorable:'Оптимистичный'};
            const descs:Record<string,string>={
              negative:'Охват 50%, ручная доработка до 30%',
              base:'Охват 100%, плановая доработка 15%',
              favorable:'Охват 150%, высокая автономность 95%',
            };
            const first=entries?.[0];
            const hours=first?.monthlySeconds!=null?(first.monthlySeconds/3600).toFixed(1):null;
            const isBase=name==='base';
            return(
              <div key={name} className={`scenario-card ${isBase?'scenario-base':''}`}>
                <div className="scenario-card-top">
                  <span className="scenario-name">{titles[name]||name}</span>
                  {isBase&&<Badge variant="accent">Основной прогноз</Badge>}
                </div>
                <div className="scenario-value">
                  {hours?<strong>{hours} <small>ч/мес</small></strong>:<span>Недостаточно данных</span>}
                </div>
                <p className="scenario-desc">{descs[name]||'Параметры сценария'}</p>
              </div>
            );
          })}
        </div>

        {/* What-If Sandbox: Интерактивный симулятор экономики */}
        <WhatIfSandbox calculation={report.calculation} />

        {/* Сводная таблица вариантов */}
        <div className="report-table-card">
          <h3>Результаты контрольных прогонов вариантов</h3>
          <div className="table-responsive">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Вариант решения</th>
                  <th>Машинное время</th>
                  <th>Экономия на кейс</th>
                  <th>Успешность тестов</th>
                </tr>
              </thead>
              <tbody>
                {report.calculation?.variants?.map((v:any)=>{
                  const varInfo=report.plan?.variants?.find((p:any)=>p.id===v.variantId);
                  return(
                    <tr key={v.variantId}>
                      <td><strong>{varInfo?.name||'Вариант'}</strong></td>
                      <td>{v.machineSeconds!=null?`${v.machineSeconds.toFixed(2)} с`:'—'}</td>
                      <td>
                        {v.measuredEffect?.deltaSeconds!=null?(
                          <span className="effect-positive">+{v.measuredEffect.deltaSeconds.toFixed(2)} с</span>
                        ):('Нет данных')}
                      </td>
                      <td>
                        <Badge variant={v.failures===0?'emerald':'amber'}>
                          {v.attempts-v.failures} из {v.attempts} успешно
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. Варианты решения */}
      <section id="variants" className="report-section">
        <div className="report-section-header">
          <div>
            <span className="report-section-tag">Архитектура</span>
            <h2>Предложенные варианты решения</h2>
          </div>
        </div>
        <div className="variants-cards-grid">
          {report.plan?.variants?.map((variant:any,idx:number)=>(
            <div key={variant.id||idx} className="variant-card">
              <div className="variant-card-header">
                <span className="variant-number">Вариант #{idx+1}</span>
                <h4>{variant.name}</h4>
              </div>
              <p className="variant-approach">{variant.approach}</p>
              {variant.useRules&&(
                <div className="variant-rule-badge">
                  <Icon name="shield" size={14}/> Включена детерминированная валидация структуры
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 4. Аудитория и рынок */}
      <section id="market" className="report-section">
        <div className="report-section-header">
          <div>
            <span className="report-section-tag">Анализ рынка</span>
            <h2>Целевая аудитория и потребности</h2>
          </div>
        </div>
        {report.research?.summary&&(
          <div className="market-summary-card">
            <p>{report.research.summary}</p>
          </div>
        )}
        <div className="personas-grid">
          {report.audience?.personas?.map((persona:any,i:number)=>(
            <div key={i} className="persona-card">
              <div className="persona-header">
                <div className="persona-icon"><Icon name="user" size={18}/></div>
                <strong>{persona.role}</strong>
              </div>
              <p className="persona-pain"><strong>Ключевая боль:</strong> {persona.pain}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Риски и независимая критика */}
      <section id="risks" className="report-section">
        <div className="report-section-header">
          <div>
            <span className="report-section-tag">Критический анализ</span>
            <h2>Риски, контр-аргументы и ограничения</h2>
          </div>
        </div>

        {report.assessment?.counterarguments?.length>0&&(
          <div className="critique-box">
            <h3>Аргументы независимого эксперта-критика:</h3>
            <ul className="critique-list">
              {report.assessment.counterarguments.map((val:string,i:number)=>(
                <li key={i}>
                  <Icon name="alertTriangle" size={16} className="text-amber"/>
                  <span>{val}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.assessment?.nextExperiment&&(
          <div className="next-experiment-box">
            <Icon name="lightbulb" size={20}/>
            <div>
              <strong>Что рекомендуется проверить в первую очередь:</strong>
              <p>{report.assessment.nextExperiment}</p>
            </div>
          </div>
        )}
      </section>

      {/* 6. Источники и факты */}
      <section id="sources" className="report-section sources-section">
        <div className="report-section-header sources-header">
          <div>
            <div className="sources-tag-row">
              <span className="report-section-tag">Доказательная база</span>
              <span className="sources-count-badge">
                {sourcesCount} {sourcesCount===1?'источник':sourcesCount>=2&&sourcesCount<=4?'источника':'источников'}
              </span>
            </div>
            <h2>Проверенные источники и цитаты</h2>
          </div>
          <button
            type="button"
            className="sources-toggle-btn ui-btn ui-btn-subtle ui-btn-sm"
            onClick={()=>setSourcesExpanded(!sourcesExpanded)}
            aria-expanded={sourcesExpanded}
          >
            <Icon name={sourcesExpanded?'chevronUp':'chevronDown'} size={15}/>
            <span>{sourcesExpanded?'Свернуть источники':`Показать все (${sourcesCount})`}</span>
          </button>
        </div>

        {!sourcesExpanded?(
          <div
            className="sources-collapsed-card"
            onClick={()=>setSourcesExpanded(true)}
            role="button"
            tabIndex={0}
            onKeyDown={e=>e.key==='Enter'&&setSourcesExpanded(true)}
          >
            <div className="sources-collapsed-left">
              <div className="sources-preview-domains">
                {Array.from(new Set((report.sources||[]).map((s:any)=>s.publisher||s.domain||(s.url?s.url.replace(/^https?:\/\//,'').split('/')[0]:'веб-источник')).filter(Boolean))).slice(0,5).map((domain:any,idx)=>(
                  <span key={idx} className="source-domain-chip">
                    <Icon name="externalLink" size={11}/>
                    <span>{domain}</span>
                  </span>
                ))}
                {(report.sources?.length||0)>5&&(
                  <span className="source-domain-chip more">+{report.sources.length-5} ещё</span>
                )}
              </div>
              <p className="sources-collapsed-hint">
                Все факты подтверждены прямыми цитатами из поиска без домысливания. Нажмите, чтобы развернуть детальные цитаты и выводы.
              </p>
            </div>
            <span className="sources-expand-action">
              <span>Развернуть цитаты</span>
              <Icon name="chevronDown" size={14}/>
            </span>
          </div>
        ):(
          <>
            <p className="report-section-desc">
              Все факты подтверждены прямыми цитатами из результатов поиска без домысливания.
            </p>

            <div className="sources-list">
              {report.sources?.map((source:any)=>(
                <div key={source.id} className="source-card">
                  <div className="source-card-header">
                    <a
                      href={/^https:\/\//.test(source.url)?source.url:undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-title-link"
                    >
                      <span>{source.title||source.url}</span>
                      <Icon name="externalLink" size={14}/>
                    </a>
                    <span className="source-meta">
                      {source.publisher||source.domain||source.organization}
                      {source.published_at&&` · ${source.published_at}`}
                    </span>
                  </div>
                  {source.snippet&&(
                    <blockquote className="source-quote">
                      «{source.snippet}»
                    </blockquote>
                  )}
                  {source.supported_claim&&(
                    <div className="source-claim">
                      <strong>Связанный вывод:</strong> {source.supported_claim}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="sources-footer-collapse">
              <button
                type="button"
                className="ui-btn ui-btn-subtle ui-btn-sm"
                onClick={()=>setSourcesExpanded(false)}
              >
                <Icon name="chevronUp" size={14}/>
                <span>Свернуть список источников</span>
              </button>
            </div>
          </>
        )}
      </section>

      {/* 7. Пост-MVP мониторинг бизнес-метрик (§32 ТЗ) */}
      <PostMvpMonitoring report={report} readOnly={readOnly} />

      {/* 8. Блок принятия решения */}
      {!readOnly&&(
        <section id="decision" className="report-section report-decision-section">
          <div className="report-section-header">
            <div>
              <span className="report-section-tag">Действие</span>
              <h2>Принятие решения по идее</h2>
            </div>
          </div>

          <div className="decision-box">
            {report.assessment?.recommendation==='Развивать'?(
              <div className="decision-develop-flow">
                <label className="farm-label">
                  <span>Критерии приёмки прототипа (MVP), по одному на строку:</span>
                  <textarea
                    rows={4}
                    value={criteria}
                    onChange={e=>setCriteria(e.target.value)}
                    placeholder="Например:
- Ответ формируется не дольше 2 секунд
- Тональность ответа вежливая и деловая
- Выделены номер заказа и статус доставки"
                    className="farm-textarea"
                  />
                </label>
                <div className="decision-actions">
                  <button
                    type="button"
                    disabled={busy||!criteria.trim()}
                    className="ui-btn ui-btn-primary ui-btn-lg"
                    onClick={()=>decide('develop')}
                  >
                    <Icon name="rocket" size={18}/>
                    <span>Собрать рабочий прототип (MVP)</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="ui-btn ui-btn-secondary"
                    onClick={()=>decide('revise')}
                  >
                    Сначала проверить допущения
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="ui-btn ui-btn-subtle"
                    onClick={()=>decide('stop')}
                  >
                    Остановить идею
                  </button>
                </div>
              </div>
            ):(
              <div className="decision-actions">
                <button
                  type="button"
                  disabled={busy}
                  className="ui-btn ui-btn-secondary"
                  onClick={()=>decide('revise')}
                >
                  Отправить на доработку
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="ui-btn ui-btn-danger-outline"
                  onClick={()=>decide('stop')}
                >
                  Остановить идею
                </button>
              </div>
            )}

            <div className="share-report-row">
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                onClick={()=>setPitchModalOpen(true)}
              >
                <Icon name="share" size={14}/>
                <span>Pitch Card идеи</span>
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-subtle ui-btn-sm"
                onClick={handleShare}
              >
                <Icon name="copy" size={14}/>
                <span>{copied?'Ссылка скопирована!':'Поделиться ссылкой на отчёт'}</span>
              </button>
            </div>

            {message&&<p role="status" className="decision-status-msg">{message}</p>}
          </div>
        </section>
      )}

      {/* Модальное окно Pitch Card для шеринга в Slack/Telegram и экспорта PNG */}
      <PitchCardModal
        open={pitchModalOpen}
        onClose={()=>setPitchModalOpen(false)}
        report={report}
        reportId={reportId}
        ideaTitle={report.title||report.summary?.slice(0,60)}
        viabilityScore={viabilityScore}
      />
    </article>
  );
}

