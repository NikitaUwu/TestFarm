'use client';
import {useState} from 'react';
import {post} from '../lib/api';
import {Notice,JsonDetails} from './UI';

export default function ProcessTimer({idea,refresh}:{idea:any;refresh:()=>void}){
  const [task,setTask]=useState(''),[solution,setSolution]=useState(''),[phase,setPhase]=useState('baseline'),[source,setSource]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [provenance,setProvenance]=useState('measured');
  const active=idea.process_sessions?.find((s:any)=>!s.finished_at),solutions=idea.runs[0]?.solution_versions||[];
  async function action(){setBusy(true);setError('');try{
    if(active)await post(`/ideas/${idea.id}/process-sessions/${active.id}/stop`);
    else await post(`/ideas/${idea.id}/process-sessions`,{task_id:task,dataset_version_id:idea.runs[0]?.dataset_version_id||idea.datasets[0]?.version_id,solution_id:solution||null,phase,source,provenance});
    refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="section-stack"><h2>Замер ручных этапов</h2><p>Запускайте таймер перед реальной операцией и завершайте после неё. Длительность измеряет сервер; завершение создаёт новую версию расчёта.</p>
    {error&&<Notice kind="error">{error}</Notice>}
    {active?<Notice>Идёт замер {active.phase} для задачи {active.task_id} с {new Date(active.started_at).toLocaleTimeString('ru-RU')}.</Notice>:<div className="form-grid">
      <label>ID задачи<input value={task} onChange={e=>setTask(e.target.value)} placeholder="task_id из тестового набора"/></label>
      <label>Происхождение<select value={provenance} onChange={e=>setProvenance(e.target.value)}><option value="measured">Реальная рабочая операция</option><option value="demo">Демонстрационная проверка</option></select></label>
      <label>Вариант<select value={solution} onChange={e=>setSolution(e.target.value)}><option value="">Общий / baseline</option>{solutions.map((s:string,i:number)=><option key={s} value={s}>Вариант {String.fromCharCode(65+i)}</option>)}</select></label>
      <label>Этап<select value={phase} onChange={e=>setPhase(e.target.value)}>{Object.entries({baseline:'Исходный процесс',input:'Подготовка входа',manual_review:'Ручная проверка',error_correction:'Исправление ошибки',postprocessing:'Обработка результата',overhead:'Прочие накладные операции'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Источник / описание операции<input value={source} onChange={e=>setSource(e.target.value)}/></label></div>}
    <button className="secondary" disabled={busy||(!active&&(!task.trim()||!source.trim()))} onClick={()=>void action()}>{active?'Завершить замер':'Начать замер'}</button>
    <JsonDetails title="Сохранённые замеры и происхождение" value={idea.process_sessions||[]}/>
  </section>;
}
