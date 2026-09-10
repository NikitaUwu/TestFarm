'use client';
import {useEffect,useRef,useState} from 'react';
import {api,post} from '../lib/api';
import {Icon,Notice} from './UI';

export default function IdeaIntake({onStarted}:{onStarted:(id:string)=>void|Promise<void>}){
  const [text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[audio,setAudio]=useState<Blob|null>(null),[audioUrl,setAudioUrl]=useState('');
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]),key=useRef('');
  useEffect(()=>()=>{stream.current?.getTracks().forEach(track=>track.stop());},[]);
  useEffect(()=>{if(!audio)return;const url=URL.createObjectURL(audio);setAudioUrl(url);return()=>URL.revokeObjectURL(url);},[audio]);
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(value=>{if(value>=299)recorder.current?.stop();return value+1;}),1000);return()=>clearInterval(timer);},[recording]);
  async function record(){
    setError('');setBusy(true);
    try{
      stream.current=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/webm','audio/ogg','audio/mp4'].find(value=>MediaRecorder.isTypeSupported(value));
      const device=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined);recorder.current=device;chunks.current=[];let bytes=0;
      device.ondataavailable=event=>{if(event.data.size){chunks.current.push(event.data);bytes+=event.data.size;if(bytes>4*1024*1024&&device.state==='recording')device.stop();}};
      device.onstop=()=>{setAudio(new Blob(chunks.current,{type:device.mimeType.split(';')[0]}));setRecording(false);stream.current?.getTracks().forEach(track=>track.stop());key.current='';};
      setAudio(null);setSeconds(0);setRecording(true);device.start(500);
    }catch{stream.current?.getTracks().forEach(track=>track.stop());setError('Микрофон недоступен. Разрешите доступ или опишите идею текстом.');}finally{setBusy(false);}
  }
  async function submit(){
    setBusy(true);setError('');key.current ||= crypto.randomUUID();
    try{
      let result;
      if(audio){
        if(audio.size>4*1024*1024)throw new Error('Запись превышает 4 МБ. Запишите более короткую идею.');
        const data=new FormData();data.append('file',audio,'idea.'+(audio.type.includes('mp4')?'mp4':audio.type.includes('ogg')?'ogg':'webm'));data.append('idempotency_key',key.current);
        result=await api('/intake/audio',{method:'POST',body:data});
      }else result=await post('/intake',{description:text,idempotency_key:key.current});
      await onStarted(result.id);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="intake"><header className="page-heading"><div><h1>Расскажите об идее</h1><p>Ферма разберёт задачу, изучит альтернативы и подготовит проверку.</p></div></header>
    {error&&<Notice kind="error">{error}</Notice>}
    <form onSubmit={e=>{e.preventDefault();void submit();}}>
      {!audio&&<label>Ваша идея<textarea rows={8} minLength={3} maxLength={20000} required={!recording} disabled={busy||recording} placeholder="Например: хочу автоматически превращать длинные заметки встреч в краткий список решений и задач…" value={text} onChange={e=>{setText(e.target.value);key.current='';}}/></label>}
      <div className="voice-panel"><div><h3>{recording?'Идёт запись':'Можно рассказать голосом'}</h3><p>{recording?`${seconds} сек.`:'До 5 минут и 4 МБ. Расшифруем автоматически.'}</p></div><button type="button" className={recording?'danger':'secondary'} disabled={busy||!!text.trim()} onClick={()=>recording?recorder.current?.stop():void record()}><Icon name="mic" size={18}/>{recording?'Остановить':'Записать'}</button></div>
      {audio&&<div className="audio-controls"><audio controls src={audioUrl}/><button type="button" className="secondary" disabled={busy} onClick={()=>{setAudio(null);key.current='';}}>Ввести текст вместо записи</button></div>}
      <button className="primary" disabled={busy||recording||(!audio&&text.trim().length<3)}>{busy?'Передаём идею…':'Начать проверку'}<Icon name="arrow" size={18}/></button>
    </form>
    <div className="section-stack"><h2>Что произойдёт дальше</h2><ol className="intake-stages"><li>Агенты сформируют карточку и исследуют проблему.</li><li>Подготовят варианты и проведут доступные пробные запуски.</li><li>Покажут результаты, ограничения и следующий шаг.</li></ol><p>Можно закрыть вкладку. Работа продолжится на сервере. Если потребуется важное уточнение, оно появится в карточке.</p></div>
  </section>;
}
