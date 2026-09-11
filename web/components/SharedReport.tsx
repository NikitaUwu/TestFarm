'use client';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {CloudReport} from './CloudFarm';
export default function SharedReport({token}:{token:string}){const [report,setReport]=useState<any>(null),[error,setError]=useState('');useEffect(()=>{api('/public/'+token).then(setReport).catch(e=>setError(e.message));},[token]);return <main className="public-report"><h1>Отчёт Продуктовой фермы</h1>{error&&<p role="alert">{error}</p>}{report?<CloudReport report={report} onError={setError} readOnly/>:<p>Загрузка…</p>}</main>;}
