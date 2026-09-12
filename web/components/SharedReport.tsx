'use client';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {CloudReport} from './CloudFarm';
import {Icon,Notice} from './UI';

export default function SharedReport({token}:{token:string}){
  const [report,setReport]=useState<any>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    api('/public/'+token).then(setReport).catch(e=>setError(e.message));
  },[token]);

  return (
    <main className="farm-content" style={{maxWidth:1000,margin:'32px auto',padding:'0 20px'}}>
      <div className="farm-card">
        <div className="farm-card-header">
          <div>
            <span className="farm-card-tag">Публичный доступ</span>
            <h1 className="farm-main-title">Аналитический отчёт идеи</h1>
          </div>
          <a href="/" className="ui-btn ui-btn-secondary ui-btn-sm">
            <span>Войти в ферму</span>
            <Icon name="arrowRight" size={14}/>
          </a>
        </div>
        {error&&<Notice kind="error">{error}</Notice>}
        {report?(
          <CloudReport report={report} onError={setError} readOnly/>
        ):(
          <div className="farm-loading-box" style={{padding:'60px 0'}}>
            <Icon name="sparkles" size={28} className="spin-slow" />
            <p>Загрузка отчёта…</p>
          </div>
        )}
      </div>
    </main>
  );
}

