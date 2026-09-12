'use client';
import {useState} from 'react';
import {ApiError,post} from '../lib/api';
import {Icon,Notice} from './UI';

export type Account={id:string;username:string;email:string|null};

export default function AuthForm({
  onLogin,
  error:initialError,
  defaultRegister=false,
  onClose,
}:{
  onLogin:(account:Account)=>void;
  error:string;
  defaultRegister?:boolean;
  onClose?:()=>void;
}){
  const [register,setRegister]=useState(defaultRegister);
  const [identifier,setIdentifier]=useState('');
  const [username,setUsername]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [error,setError]=useState(initialError);
  const [busy,setBusy]=useState(false);

  const cardContent=(
    <div className="auth-card">
      {onClose&&(
        <button
          type="button"
          className="auth-card-close"
          onClick={onClose}
          aria-label="Закрыть окно"
        >
          <Icon name="x" size={18}/>
        </button>
      )}
      <div className="auth-header">
        <div className="auth-brand-badge">
          <Icon name="sparkles" size={24}/>
        </div>
        <h2>Продуктовая ферма</h2>
        <p className="auth-subtitle">
          {register
            ? 'Создайте аккаунт для автономной проверки продуктовых идей'
            : 'Войдите в личный кабинет для работы с идеями'}
        </p>
      </div>

        {/* Переключатель Вход / Регистрация */}
        <div className="auth-toggle-group">
          <button
            type="button"
            className={`auth-toggle-btn ${!register?'active':''}`}
            onClick={()=>{setRegister(false);setError('');}}
            disabled={busy}
          >
            Вход в систему
          </button>
          <button
            type="button"
            className={`auth-toggle-btn ${register?'active':''}`}
            onClick={()=>{setRegister(true);setError('');}}
            disabled={busy}
          >
            Регистрация
          </button>
        </div>

        {error&&<Notice kind="error">{error}</Notice>}

        <form onSubmit={async event=>{
          event.preventDefault();
          setError('');
          if(register&&password!==confirmation){
            setError('Пароли не совпадают');
            return;
          }
          setBusy(true);
          try{
            const account=await post(
              register?'/auth/register':'/auth/login',
              register?{username,email,password}:{identifier,password}
            );
            setPassword('');
            setConfirmation('');
            onLogin(account);
          }catch(err){
            setError(err instanceof ApiError&&err.status===422?'Проверьте логин, адрес почты и длину пароля.':(err as Error).message);
          }finally{
            setBusy(false);
          }
        }} className="auth-form-fields">
          {register?(
            <>
              <label className="farm-label">
                <span>Имя пользователя (логин)</span>
                <input
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}"
                  required
                  disabled={busy}
                  value={username}
                  onChange={e=>setUsername(e.target.value)}
                  placeholder="ivan_product"
                  className="farm-input"
                />
                <span className="farm-field-hint">От 3 до 32 символов (буквы, цифры, дефис)</span>
              </label>

              <label className="farm-label">
                <span>Электронная почта</span>
                <input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  maxLength={254}
                  required
                  disabled={busy}
                  value={email}
                  onChange={e=>setEmail(e.target.value)}
                  placeholder="name@company.ru"
                  className="farm-input"
                />
              </label>
            </>
          ):(
            <label className="farm-label">
              <span>Логин или электронная почта</span>
              <input
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                required
                disabled={busy}
                value={identifier}
                onChange={e=>setIdentifier(e.target.value)}
                placeholder="ivan_product или name@company.ru"
                className="farm-input"
              />
            </label>
          )}

          <label className="farm-label">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete={register?'new-password':'current-password'}
              minLength={register?12:1}
              maxLength={200}
              required
              disabled={busy}
              value={password}
              onChange={e=>setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="farm-input"
            />
            {register&&<span className="farm-field-hint">Минимум 12 символов</span>}
          </label>

          {register&&(
            <label className="farm-label">
              <span>Повторите пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={200}
                required
                disabled={busy}
                value={confirmation}
                onChange={e=>setConfirmation(e.target.value)}
                placeholder="••••••••••••"
                className="farm-input"
              />
            </label>
          )}

          <button
            type="submit"
            className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block"
            disabled={busy}
          >
            <span>{busy?'Подключение…':register?'Создать личный аккаунт':'Войти в аккаунт'}</span>
            <Icon name="arrowRight" size={16}/>
          </button>
        </form>
      </div>
  );

  return onClose ? cardContent : <main className="auth-page">{cardContent}</main>;
}

