'use client';
import {useState} from 'react';
import {ApiError,post} from '../lib/api';
import {Notice} from './UI';

export type Account={id:string;username:string;email:string|null};

export default function AuthForm({onLogin,error:initialError}:{onLogin:(account:Account)=>void;error:string}){
  const [register,setRegister]=useState(false);
  const [identifier,setIdentifier]=useState(''),[username,setUsername]=useState(''),[email,setEmail]=useState('');
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [error,setError]=useState(initialError),[busy,setBusy]=useState(false);

  return <main className="auth"><form onSubmit={async event=>{
    event.preventDefault();setError('');
    if(register&&password!==confirmation){setError('Пароли не совпадают');return;}
    setBusy(true);
    try{
      const account=await post(register?'/auth/register':'/auth/login',register?{username,email,password}:{identifier,password});
      setPassword('');setConfirmation('');onLogin(account);
    }catch(err){setError(err instanceof ApiError&&err.status===422?'Проверьте логин, адрес почты и длину пароля.':(err as Error).message);}
    finally{setBusy(false);}
  }}>
    <div className="brand"><span className="brand-mark">⌄</span>Продуктовая ферма</div>
    <h1>{register?'Создать аккаунт':'Войти в ферму'}</h1>
    <p>{register?'Ваше пространство для проверки идей.':'От идеи — к проверяемому решению.'}</p>
    <div className="tabs" aria-label="Вход или регистрация">
      {[false,true].map(value=><button type="button" key={String(value)} className={register===value?'active':''} aria-pressed={register===value} disabled={busy} onClick={()=>{setRegister(value);setError('');setPassword('');setConfirmation('');}}>{value?'Регистрация':'Вход'}</button>)}
    </div>
    {error&&<Notice kind="error">{error}</Notice>}
    {register?<>
      <label>Логин<input autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}" aria-describedby="username-help" required disabled={busy} value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <p className="caption auth-help" id="username-help">3–32 латинские буквы, цифры, точки, дефисы или подчёркивания. Первый символ — буква или цифра.</p>
      <label>Почта<input type="email" autoComplete="email" autoCapitalize="none" maxLength={254} required disabled={busy} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    </>:<label>Логин или почта<input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={busy} value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label>}
    <label>Пароль<input type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={200} aria-describedby={register?'password-help':undefined} required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {register&&<><p className="caption auth-help" id="password-help">От 12 до 200 символов.</p><label>Повторите пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={200} required disabled={busy} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></>}
    <button className="primary" disabled={busy}>{busy?'Подключение…':register?'Создать аккаунт':'Войти'}</button>
  </form></main>;
}
