'use client';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {Icon,Badge,Notice} from './UI';

export default function MvpRenderer({id}:{id:string}){
  const [mvp,setMvp]=useState<any>(null);
  const [input,setInput]=useState<Record<string,unknown>>({});
  const [output,setOutput]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    let live=true;
    const load=()=>api('/mvp/'+id).then(value=>{
      if(live)setMvp(value);
    }).catch(e=>{
      if(live)setError(e.message);
    });
    load();
    const timer=setInterval(load,3000);
    return()=>{live=false;clearInterval(timer);};
  },[id]);

  const isReady = mvp?.status === 'ready';

  return(
    <main className="mvp-sandbox-page">
      <div className="mvp-sandbox-container">
        {/* Верхняя навигация */}
        <header className="mvp-sandbox-header">
          <a href="/" className="mvp-back-link">
            <Icon name="arrow" size={16}/>
            <span>Вернуться к идеям</span>
          </a>
          <div className="mvp-header-meta">
            <Badge variant={isReady?'emerald':'amber'} dot={!isReady}>
              {isReady?'Прототип готов к тестированию':'Идёт сборка прототипа'}
            </Badge>
          </div>
        </header>

        {error&&<Notice kind="error">{error}</Notice>}

        {/* Заголовок прототипа */}
        <div className="mvp-hero-card">
          <div className="mvp-hero-icon">
            <Icon name="rocket" size={28}/>
          </div>
          <div className="mvp-hero-text">
            <span className="mvp-hero-tag">Рабочий интерактивный прототип (MVP)</span>
            <h1 className="mvp-title">{mvp?.spec?.title||'Сборка прототипа…'}</h1>
            <p className="mvp-desc">
              {mvp?.spec?.description||'Система готовит декларативный сценарий на основе критериев приёмки.'}
            </p>
          </div>
        </div>

        {!isReady?(
          <div className="mvp-building-card">
            <Icon name="sparkles" size={32} className="spin-slow" />
            <h3>Прототип собирается автономно</h3>
            <p>Генерируются поля ввода-вывода и настраивается валидация. Страница обновится автоматически.</p>
          </div>
        ):(
          /* Интерактивная песочница */
          <div className="mvp-sandbox-grid">
            {/* Форма ввода параметров */}
            <section className="mvp-panel mvp-input-panel">
              <div className="mvp-panel-header">
                <Icon name="card" size={18}/>
                <h3>Входные параметры</h3>
              </div>
              <form onSubmit={async event=>{
                event.preventDefault();
                setBusy(true);
                setError('');
                try{
                  setOutput(await api('/mvp/'+id+'/run',{
                    method:'POST',
                    headers:{'Idempotency-Key':crypto.randomUUID()},
                    body:JSON.stringify(input),
                  }));
                }catch(e){
                  setError((e as Error).message);
                }finally{
                  setBusy(false);
                }
              }}>
                <div className="mvp-fields-list">
                  {mvp.spec.inputFields.map((field:any)=>(
                    <label key={field.name} className="farm-label">
                      <span>{field.label}</span>
                      {field.type==='boolean'?(
                        <select
                          required
                          value={String(input[field.name]??'')}
                          onChange={e=>setInput({...input,[field.name]:e.target.value==='true'})}
                          className="farm-select"
                        >
                          <option value="">Выберите вариант…</option>
                          <option value="true">Да</option>
                          <option value="false">Нет</option>
                        </select>
                      ):(
                        <input
                          required
                          type={field.type==='number'?'number':'text'}
                          step="any"
                          maxLength={16000}
                          value={String(input[field.name]??'')}
                          onChange={e=>setInput({
                            ...input,
                            [field.name]:field.type==='number'?Number(e.target.value):e.target.value,
                          })}
                          placeholder={`Введите ${field.label.toLowerCase()}…`}
                          className="farm-input"
                        />
                      )}
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block"
                >
                  <Icon name="play" size={16}/>
                  <span>{busy?'Обработка запроса…':'Протестировать прототип'}</span>
                </button>
              </form>
            </section>

            {/* Панель результатов работы */}
            <section className="mvp-panel mvp-output-panel">
              <div className="mvp-panel-header">
                <Icon name="sparkles" size={18}/>
                <h3>Результат работы</h3>
                {output?.status&&(
                  <Badge variant={output.status==='completed'?'emerald':'rose'}>
                    {output.status==='completed'?'Успешно':'Ошибка'}
                  </Badge>
                )}
              </div>

              {!output?(
                <div className="mvp-empty-result">
                  <Icon name="play" size={32}/>
                  <p>Заполните параметры слева и нажмите «Протестировать прототип», чтобы увидеть ответ сервиса.</p>
                </div>
              ):output.status==='completed'?(
                <div className="mvp-result-content">
                  <div className="mvp-result-fields">
                    {mvp.spec.outputFields.map((field:any)=>(
                      <div key={field.name} className="mvp-result-card">
                        <span className="mvp-result-label">{field.label}</span>
                        <div className="mvp-result-value">
                          {String(output.content.output[field.name])}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ):(
                <div className="mvp-error-result">
                  <Icon name="alertTriangle" size={24}/>
                  <p>{output.content?.error||'Не удалось выполнить запрос к прототипу'}</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

