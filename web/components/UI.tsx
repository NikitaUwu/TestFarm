'use client';
import {useState,useRef,useEffect,type ReactNode} from 'react';

export function Icon({name,size=20,className=''}:{name:string;size?:number;className?:string}){
  const paths:Record<string,ReactNode>={
    funnel:<><path d="M3 4h18l-7 8v8l-4-2v-6z"/></>,
    plus:<><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    card:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 13h5M7 16h8"/></>,
    activity:<><path d="m3 17 6-6 4 3 8-10M15 4h6v6"/></>,
    chart:<><path d="M4 20V12h4v8M10 20V8h4v12M16 20V3h4v17M2 20h20"/></>,
    report:<><path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 16h6"/></>,
    settings:<><path d="m9 3-1 3-3 1v4l-2 1 2 3v3l3 1 1 2h6l1-2 3-1v-3l2-3-2-1V7l-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></>,
    search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6h5"/></>,
    user:<><circle cx="12" cy="7" r="3"/><path d="M5 21v-4c0-5 14-5 14 0v4z"/></>,
    arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
    arrowRight:<path d="M5 12h14M12 5l7 7-7 7"/>,
    menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
    mic:<><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
    stop:<><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></>,
    upload:<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
    check:<path d="M20 6 9 17l-5-5"/>,
    checkCircle:<><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></>,
    x:<path d="M18 6 6 18M6 6l12 12"/>,
    trash:<><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></>,
    alertTriangle:<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3zM12 9v4M12 17h.01"/></>,
    shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    rocket:<><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-4.05 11a22.77 22.77 0 0 1-3.95 2z"/></>,
    lightbulb:<><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/></>,
    scale:<><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1zM7 21h10M12 3v18M3 7h18"/></>,
    calculator:<><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></>,
    externalLink:<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></>,
    sparkles:<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>,
    copy:<><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
    pause:<><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>,
    play:<><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></>,
    refresh:<><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></>,
    archive:<><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/></>,
    share:<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    download:<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></>,
    chevronDown:<path d="m6 9 6 6 6-6"/>,
    chevronUp:<path d="m18 15-6-6-6 6"/>,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name] || paths.report}
    </svg>
  );
}

export function Badge({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
}: {
  children: ReactNode;
  variant?: 'emerald' | 'amber' | 'rose' | 'indigo' | 'neutral' | 'accent';
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`ui-badge ui-badge-${variant} ${className}`}>
      {dot && <span className="ui-badge-dot" />}
      {children}
    </span>
  );
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  badge,
  highlight = false,
}: {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon?: string;
  badge?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`ui-metric-card ${highlight ? 'highlight' : ''}`}>
      <div className="ui-metric-header">
        <span className="ui-metric-title">{title}</span>
        {icon && <div className="ui-metric-icon"><Icon name={icon} size={18} /></div>}
      </div>
      <div className="ui-metric-value-row">
        <div className="ui-metric-value">{value}</div>
        {badge}
      </div>
      {subtitle && <p className="ui-metric-sub">{subtitle}</p>}
    </div>
  );
}

export function calculateViabilityScore(report: any): number {
  if (!report) return 50;
  const rec = report.assessment?.recommendation || '';
  let score = 50;
  if (rec === 'Развивать') score = 82;
  else if (rec === 'Остановить') score = 24;
  else if (rec === 'Требуется предварительная проверка') score = 58;

  // Модификаторы по расчету бутстрапа
  if (report.calculation?.eligible === true) score += 6;
  if (report.calculation?.eligible === false) score -= 6;

  // Дельта секунд
  const delta = report.calculation?.variants?.[0]?.measuredEffect?.deltaSeconds;
  if (delta != null) {
    if (delta > 15) score += 4;
    else if (delta > 5) score += 2;
    else if (delta < 0) score -= 5;
  }

  // Ежемесячная экономия часов
  const monthlySeconds = report.calculation?.scenarios?.base?.[0]?.monthlySeconds;
  if (monthlySeconds != null) {
    if (monthlySeconds > 72000) score += 4;
    else if (monthlySeconds > 36000) score += 2;
  }

  // Количество проверенных источников
  const sourcesCount = report.sources?.length || 0;
  if (sourcesCount >= 4) score += 3;
  else if (sourcesCount >= 2) score += 1;

  return Math.min(96, Math.max(8, Math.round(score)));
}

export function ViabilityGauge({
  score,
  size = 106,
  showLabel = true,
}: {
  score: number;
  size?: number;
  showLabel?: boolean;
}) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(score);
    }, 60);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = 40;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = (animatedScore / 100) * circumference;
  const strokeDashoffset = circumference - progress;

  const isHigh = score >= 75;
  const isLow = score < 45;
  const color = isHigh ? '#10b981' : isLow ? '#ef4444' : '#f59e0b';
  const label = isHigh ? 'Высокий потенциал' : isLow ? 'Критический риск' : 'Умеренный риск';

  return (
    <div className="viability-gauge-container">
      <div className="viability-gauge-circle" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" className="viability-svg">
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="viability-track"
            strokeWidth={stroke}
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="viability-indicator"
            strokeWidth={stroke}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="viability-gauge-text">
          <span className="viability-score-num" style={{ color }}>
            {animatedScore}
          </span>
          <span className="viability-score-max">/100</span>
        </div>
      </div>
      {showLabel && (
        <div className="viability-gauge-caption">
          <span className="viability-badge" style={{ color, borderColor: color }}>
            {label}
          </span>
          <span className="viability-caption-sub">Жизнеспособность</span>
        </div>
      )}
    </div>
  );
}

export function VerdictBanner({
  recommendation,
  summary,
  reasons = [],
  viabilityScore,
  onOpenPitchCard,
}: {
  recommendation: string;
  summary: string;
  reasons?: string[];
  viabilityScore?: number;
  onOpenPitchCard?: () => void;
}) {
  const isDevelop = recommendation === 'Развивать';
  const isStop = recommendation === 'Остановить';
  const variant = isDevelop ? 'develop' : isStop ? 'stop' : 'check';
  const iconName = isDevelop ? 'rocket' : isStop ? 'alertTriangle' : 'scale';
  const title = isDevelop
    ? 'Рекомендация: Развивать идею'
    : isStop
    ? 'Рекомендация: Остановить разработку'
    : 'Рекомендация: Требуется предварительная проверка';

  return (
    <div className={`ui-verdict-banner ${variant}`}>
      <div className="ui-verdict-main-row">
        <div className="ui-verdict-content">
          <div className="ui-verdict-badge-row">
            <div className="ui-verdict-icon">
              <Icon name={iconName} size={26} />
            </div>
            <div>
              <span className="ui-verdict-tag">Вердикт аналитической системы</span>
              <h2 className="ui-verdict-title">{title}</h2>
            </div>
          </div>
          {summary && <p className="ui-verdict-summary">{summary}</p>}
          {reasons.length > 0 && (
            <div className="ui-verdict-reasons">
              <strong>Ключевые аргументы:</strong>
              <ul>
                {reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {viabilityScore != null && (
          <div className="ui-verdict-gauge-box">
            <ViabilityGauge score={viabilityScore} />
            {onOpenPitchCard && (
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm pitch-card-trigger-btn"
                onClick={onOpenPitchCard}
              >
                <Icon name="share" size={14} />
                <span>Pitch Card идеи</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function VoiceRecorder({
  onRecordingComplete,
  disabled = false,
  maxSeconds = 300,
}: {
  onRecordingComplete: (blob: Blob) => void;
  disabled?: boolean;
  maxSeconds?: number;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const finalType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalType });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (blob.size > 0) {
          onRecordingComplete(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds(prev => {
          if (prev + 1 >= maxSeconds) {
            stop();
            return maxSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Доступ к микрофону заблокирован в браузере'
        : 'Не удалось получить доступ к микрофону';
      setError(msg);
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const cancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    chunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
    setSeconds(0);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (recording) {
    return (
      <div className="ui-voice-active">
        <div className="ui-voice-pulse-group">
          <span className="ui-voice-dot" />
          <span className="ui-voice-timer">{formatTime(seconds)}</span>
          <span className="ui-voice-hint">Идёт запись идеи… Говорите свободно</span>
        </div>
        <div className="ui-voice-wave">
          <span /><span /><span /><span /><span />
        </div>
        <div className="ui-voice-actions">
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={stop}>
            <Icon name="check" size={15} /> Готово (распознать)
          </button>
          <button type="button" className="ui-btn ui-btn-subtle ui-btn-sm" onClick={cancel}>
            <Icon name="x" size={15} /> Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-voice-bar">
      <button
        type="button"
        disabled={disabled}
        onClick={start}
        className="ui-btn ui-btn-voice"
      >
        <span className="ui-btn-icon-circle"><Icon name="mic" size={16} /></span>
        <span>Записать с микрофона</span>
      </button>
      {error && <span className="ui-voice-error">{error}</span>}
    </div>
  );
}

export const IDEA_TEMPLATES = [
  {
    title: 'Умная поддержка 24/7',
    tag: 'Клиентский сервис',
    icon: 'sparkles',
    text: 'ИИ-ассистент первого уровня поддержки для интернет-магазина: автоматически отвечает на 80% типовых вопросов о статусе заказов, правилах доставки и возвратах, снижая среднее время ожидания ответа с 15 минут до 30 секунд.',
    priority: 2,
  },
  {
    title: 'Автоматизация регулярных отчётов',
    tag: 'Операции',
    icon: 'calculator',
    text: 'Сервис, собирающий еженедельные выгрузки из CRM и систем учёта, выявляющий аномалии в продажах и генерирующий краткую аналитическую сводку для руководителей направлений без ручного сведения таблиц.',
    priority: 1,
  },
  {
    title: 'Скоринг и квалификация B2B-лидов',
    tag: 'Отдел продаж',
    icon: 'rocket',
    text: 'Автоматический анализ входящих заявок с сайта по открытым данным о компании (сфера, размер штата, вакансии) с выставлением оценки приоритета и подготовкой контекста для звонка сейлз-менеджера.',
    priority: 1,
  },
];

export function PromptTemplates({ onSelect }: { onSelect: (t: typeof IDEA_TEMPLATES[0]) => void }) {
  return (
    <div className="ui-templates-container">
      <div className="ui-templates-header">
        <Icon name="lightbulb" size={16} />
        <span>Или начните с готового примера идеи:</span>
      </div>
      <div className="ui-templates-grid">
        {IDEA_TEMPLATES.map((tmpl, idx) => (
          <button
            key={idx}
            type="button"
            className="ui-template-card"
            onClick={() => onSelect(tmpl)}
          >
            <div className="ui-template-top">
              <span className="ui-template-tag">{tmpl.tag}</span>
              <Icon name="arrowRight" size={14} className="ui-template-arrow" />
            </div>
            <strong className="ui-template-title">{tmpl.title}</strong>
            <p className="ui-template-text">{tmpl.text}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  text,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="ui-modal-backdrop" onClick={onCancel}>
      <div className="ui-modal-box" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-icon-danger">
          <Icon name="alertTriangle" size={24} />
        </div>
        <h3 className="ui-modal-title">{title}</h3>
        <p className="ui-modal-text">{text}</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="ui-btn ui-btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Удаление…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Notice({children,kind='info'}:{children:ReactNode;kind?:string}){
  const icon = kind === 'error' ? 'alertTriangle' : 'sparkles';
  return (
    <div className={'notice ' + kind} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} />
      <div className="notice-content">{children}</div>
    </div>
  );
}

export function Empty({title='Нет данных',text,children}:{title?:string;text:string;children?:ReactNode}){
  return (
    <div className="empty">
      <div className="empty-icon-circle">
        <Icon name="sparkles" size={36} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function JsonDetails({title,value}:{title:string;value:unknown}){
  return (
    <details className="ui-tech-details">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value,null,2)}</pre>
    </details>
  );
}

export function NumberValue({value,digits=2}:{value:number|null|undefined;digits?:number}){
  return <>{typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ru-RU',{maximumFractionDigits:digits}):'—'}</>;
}

