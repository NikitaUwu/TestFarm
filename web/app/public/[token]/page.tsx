'use client';
import {use,useEffect,useState} from 'react';
import {api} from '../../../lib/api';
import {ReportBody} from '../../../components/Reports';
import {Notice} from '../../../components/UI';
export default function PublicReport({params}:{params:Promise<{token:string}>}){
  const {token}=use(params);const [data,setData]=useState<any>(null),[error,setError]=useState('');
  useEffect(()=>{api('/public/reports/'+encodeURIComponent(token)).then(setData).catch(e=>setError(e.message));},[token]);
  return <main className="public-report"><header><h1>Продуктовая ферма · отчёт</h1><p>Публичная версия · только чтение</p></header>{error?<Notice kind="error">{error}</Notice>:data?<ReportBody report={data.public_content} publicView/>:<p role="status">Загрузка отчёта…</p>}</main>;
}
