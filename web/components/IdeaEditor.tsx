'use client';
import {useEffect,useRef,useState} from 'react';
import {api,post,blank,Content,priorityNames,stageNames,stateNames,formatDate} from '../lib/api';
import {Icon,Notice,JsonDetails} from './UI';

export default function IdeaEditor({idea,onSaved,onRefresh,onRun,onDeleted}:{idea?:any;onSaved:(id:string)=>void;onRefresh?:()=>void;onRun?:()=>void;onDeleted?:()=>void}){
  const [form,setForm]=useState<Content>(idea?.content||{...blank}),[priority,setPriority]=useState(idea?.priority??1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[audio,setAudio]=useState<Blob|null>(null),[audioUrl,setAudioUrl]=useState('');
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]);
  const draft=useRef<{id:string;version:number}|null>(idea?{id:idea.id,version:idea.current_version}:null);
  const uploaded=useRef<string|null>(null);
  const update=(key:keyof Content,value:any)=>setForm(previous=>({...previous,[key]:value}));
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(s=>{if(s>=299){recorder.current?.stop();return 300;}return s+1;}),1000);return()=>clearInterval(timer);},[recording]);
  useEffect(()=>()=>{stream.current?.getTracks().forEach(t=>t.stop());},[]);
  useEffect(()=>{if(!audio)return;const url=URL.createObjectURL(audio);setAudioUrl(url);return()=>URL.revokeObjectURL(url);},[audio]);
  async function record(){
    setError('');
    if(!navigator.mediaDevices?.getUserMedia){setError('Микрофон недоступен. Используйте текстовый ввод.');return;}
    try{
      stream.current=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/webm','audio/ogg','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
      recorder.current=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined);chunks.current=[];setSeconds(0);
      recorder.current.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
      recorder.current.onstop=()=>{uploaded.current=null;setAudio(new Blob(chunks.current,{type:recorder.current?.mimeType.split(';')[0]||'audio/webm'}));setRecording(false);stream.current?.getTracks().forEach(t=>t.stop());};
      recorder.current.start(1000);setRecording(true);
    }catch(e){setError((e as DOMException).name==='NotAllowedError'?'Доступ к микрофону запрещён. Разрешите его в браузере или введите текст.':'Не удалось начать запись. Проверьте микрофон.');}
  }
  async function save(){
    setBusy(true);setError('');setMessage('');
    try{
      const result=draft.current?await api('/ideas/'+draft.current.id,{method:'PUT',body:JSON.stringify({...form,expected_version:draft.current.version})}):await post('/ideas',{...form,priority});
      draft.current={id:result.id,version:result.current_version};
      await post('/ideas/'+result.id+'/actions',{action:'priority',priority});
      if(audio&&!uploaded.current){
        const recorded=await sendAudio(result.id);
        uploaded.current=recorded.artifact_id;
        if(recorded.transcript){setForm(p=>({...p,transcript:recorded.transcript}));setMessage('Аудио и карточка сохранены. Проверьте расшифровку и сохраните исправленный текст.');return;}
        setError(recorded.error||'Распознавание недоступно. Аудио и карточка сохранены; можно повторить распознавание.');return;
      }
      onSaved(result.id);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function sendAudio(id:string){
    const payload=new FormData();payload.append('file',audio!,'recording.'+(audio!.type.includes('mp4')?'mp4':audio!.type.includes('ogg')?'ogg':'webm'));
    return api('/ideas/'+id+'/audio',{method:'POST',body:payload});
  }
  async function transcribe(){
    if(!audio)return;setBusy(true);setError('');
    try{
      if(!draft.current){
        if(!form.title.trim())throw new Error('Укажите название: перед распознаванием будет сохранён черновик.');
        const created=await post('/ideas',{...form,priority});draft.current={id:created.id,version:created.current_version};
      }
      const id=draft.current.id;
      const result=uploaded.current?await post('/ideas/'+id+'/audio/'+uploaded.current+'/transcribe'):await sendAudio(id);
      uploaded.current=result.artifact_id;
      if(result.transcript){update('transcript',result.transcript);setMessage('Расшифровка готова. Проверьте текст и сохраните новую версию.');}
      else setError(result.error||'Распознавание недоступно. Аудио сохранено.');onRefresh?.();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section>
    <header className="page-heading"><div><h1>{idea?'Карточка идеи':'Новая идея'}</h1><p>{idea?`Версия ${idea.current_version} · ${stageNames[idea.stage]} · ${stateNames[idea.execution_state]}`:'Начните с задачи, которую хотите улучшить.'}</p></div>{idea&&<button className="primary" onClick={onRun}>Перейти к проверке<Icon name="arrow" size={18}/></button>}</header>
    {error&&<Notice kind="error">{error}</Notice>}{message&&<Notice>{message}</Notice>}
    <form className="editor" onSubmit={e=>{e.preventDefault();void save();}}>
      <label>Название идеи<input maxLength={200} required placeholder="Какую задачу решаем?" value={form.title} onChange={e=>update('title',e.target.value)}/></label>
      <div className="voice-panel"><div><h3>Расскажите об идее</h3><p>Русская речь · до 5 минут · до 20 MiB</p></div><button type="button" className={recording?'danger':'secondary'} disabled={busy} onClick={()=>recording?recorder.current?.stop():void record()}><Icon name="mic" size={18}/>{recording?`Остановить · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Записать голосом'}</button></div>
      {recording&&<Notice><span className="record-dot"/>Идёт запись. Микрофон включён.</Notice>}
      {audio&&<div className="audio-controls"><audio controls src={audioUrl}/><button type="button" className="secondary" disabled={busy||recording} onClick={()=>void transcribe()}>Распознать и сохранить аудио</button></div>}
      <label>Исходный текст / исправленная расшифровка<textarea maxLength={20000} rows={6} placeholder="Что происходит сейчас, у кого возникает проблема и что должно измениться?" value={form.transcript} onChange={e=>update('transcript',e.target.value)}/></label>
      {idea&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await post('/ideas/'+idea.id+'/structure');setForm(r.content);setMessage('ИИ предложил структуру. Проверьте допущения и сохраните версию.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Структурировать с помощью ИИ</button>}
      <div className="form-grid">{([['problem','Проблема'],['audience','Аудитория идеи'],['value','Ценность'],['current_process','Текущий процесс'],['expected_effect','Ожидаемый эффект']] as const).map(([key,label])=><label key={key}>{label}<span className="field-status">{({known:'Известно',assumed:'Допущение',needs_clarification:'Требует уточнения'} as Record<string,string>)[form.knowledge[key]]||(form[key]?'Указано пользователем':'Требует уточнения')}</span><textarea rows={3} maxLength={key==='problem'||key==='current_process'?4000:2000} value={form[key]} onChange={e=>{update(key,e.target.value);setForm(p=>({...p,knowledge:{...p.knowledge,[key]:'known'}}));}}/></label>)}</div>
      <div className="form-grid"><label>Допущения · по одному на строку<textarea rows={3} value={form.assumptions.join('\n')} onChange={e=>update('assumptions',e.target.value.split('\n').filter(Boolean))}/></label><label>Ограничения · по одному на строку<textarea rows={3} value={form.constraints.join('\n')} onChange={e=>update('constraints',e.target.value.split('\n').filter(Boolean))}/></label></div>
      <label className="short-field">Приоритет<select value={priority} onChange={e=>setPriority(Number(e.target.value))}>{priorityNames.map((p,i)=><option key={p} value={i}>{p}</option>)}</select></label>
      <div className="actions"><button className="primary" disabled={busy||recording}>{busy?'Сохранение…':idea?'Сохранить версию':'Создать идею'}</button>{idea&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{try{await post('/ideas/'+idea.id+'/actions',{action:idea.stage==='archived'?'activate':'archive'});onRefresh?.();}catch(e){setError((e as Error).message);}}}>{idea.stage==='archived'?'Вернуть в работу':'В архив'}</button>}</div>
    </form>
    {idea&&<div className="section-stack"><h2>История и материалы</h2>{idea.versions.map((v:any)=><JsonDetails key={v.id} title={`Версия ${v.version} · ${formatDate(v.created_at)}`} value={v.content}/>)}{idea.artifacts?.map((a:any)=><p key={a.id}><a href={`/api/ideas/${idea.id}/artifacts/${a.id}`}>{a.kind} · {Math.round(a.size/1024)} KiB · {formatDate(a.created_at)}</a>{a.kind==='audio'&&<button type="button" className="text-link" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await post(`/ideas/${idea.id}/audio/${a.id}/transcribe`);if(r.transcript){update('transcript',r.transcript);setMessage('Расшифровка готова. Проверьте текст и сохраните версию.');}else setError(r.error);onRefresh?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Повторить распознавание</button>}</p>)}<details><summary>Удаление идеи и связанных данных</summary><p>Удаляются версии, наборы, исследования и отчёты. Файлы удаляет фоновое задание. Это действие нельзя отменить.</p><button className="danger" disabled={busy} onClick={async()=>{if(!window.confirm('Удалить эту идею, историю и все связанные данные?'))return;setBusy(true);try{await api('/ideas/'+idea.id,{method:'DELETE'});onDeleted?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Удалить идею</button></details></div>}
  </section>;
}
