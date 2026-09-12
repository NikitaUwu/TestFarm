'use client';
import {useState} from 'react';
import {Icon,Badge} from './UI';
import AuthForm,{Account} from './AuthForm';

export default function LandingPage({
  onLogin,
  error,
}:{
  onLogin:(account:Account)=>void;
  error:string;
}){
  const [authMode,setAuthMode]=useState<'login'|'register'|null>(null);

  return(
    <div className="landing-shell">
      {/* Шапка лендинга */}
      <header className="landing-header">
        <div className="landing-brand">
          <span className="farm-brand-mark">
            <Icon name="sparkles" size={22}/>
          </span>
          <div className="landing-brand-text">
            <strong>Продуктовая ферма</strong>
            <span className="landing-brand-tag">Автономный валидатор идей</span>
          </div>
        </div>

        <nav className="landing-nav">
          <a href="/docs" className="landing-nav-link">
            <Icon name="report" size={16}/>
            <span>Как это работает</span>
          </a>
          <button
            type="button"
            className="ui-btn ui-btn-subtle"
            onClick={()=>setAuthMode('login')}
          >
            Войти
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={()=>setAuthMode('register')}
          >
            <span>Начать бесплатно</span>
            <Icon name="arrowRight" size={16}/>
          </button>
        </nav>
      </header>

      {/* Hero-секция */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <span className="landing-badge-dot" />
            <span>Автономный ИИ-исследователь для продуктовых команд</span>
          </div>
          <h1 className="landing-hero-title">
            Проверяйте идеи продуктов за <span className="highlight-text">15 минут</span>, а не за 3 месяца разработки
          </h1>
          <p className="landing-hero-desc">
            Продуктовая ферма превращает сырую мысль или голосовое сообщение в структурированный аналитический отчёт с поиском реальных фактов в сети, статистическим расчётом окупаемости и рабочим интерактивным MVP.
          </p>

          <div className="landing-hero-actions">
            <button
              type="button"
              className="ui-btn ui-btn-primary ui-btn-xl landing-cta-btn"
              onClick={()=>setAuthMode('register')}
            >
              <Icon name="rocket" size={20}/>
              <span>Проверить свою идею</span>
            </button>
            <a href="/docs" className="ui-btn ui-btn-secondary ui-btn-xl">
              <Icon name="report" size={18}/>
              <span>Изучить как работает</span>
            </a>
          </div>

          <div className="landing-trust-row">
            <div className="landing-trust-item">
              <Icon name="checkCircle" size={16} className="text-emerald"/>
              <span>Без программирования</span>
            </div>
            <div className="landing-trust-item">
              <Icon name="checkCircle" size={16} className="text-emerald"/>
              <span>До 20 ₽ на исследование</span>
            </div>
            <div className="landing-trust-item">
              <Icon name="checkCircle" size={16} className="text-emerald"/>
              <span>Факты и цитаты, а не галлюцинации</span>
            </div>
            <div className="landing-trust-item">
              <Icon name="checkCircle" size={16} className="text-emerald"/>
              <span>Парный бутстрап эффект</span>
            </div>
          </div>
        </div>

        {/* Визуальное превью дашборда */}
        <div className="landing-preview-card">
          <div className="landing-preview-header">
            <div className="landing-preview-dots">
              <span className="dot dot-red"/>
              <span className="dot dot-yellow"/>
              <span className="dot dot-green"/>
            </div>
            <span className="landing-preview-title">Аналитический дашборд идеи</span>
            <Badge variant="emerald">Вердикт: Развивать</Badge>
          </div>
          <div className="landing-preview-body">
            <div className="landing-preview-verdict">
              <div className="landing-verdict-icon-box">
                <Icon name="rocket" size={24}/>
              </div>
              <div>
                <strong>ИИ-ассистент клиентской поддержки</strong>
                <p>Экономия времени до 42.5 ч/мес при точности классификации 98.4%</p>
              </div>
            </div>
            <div className="landing-preview-grid">
              <div className="landing-stat-box">
                <span className="stat-label">Экономия времени</span>
                <span className="stat-value">42.5 ч/мес</span>
                <span className="stat-sub">Базовый сценарий</span>
              </div>
              <div className="landing-stat-box">
                <span className="stat-label">Разница на кейс</span>
                <span className="stat-value">+14.2 сек</span>
                <span className="stat-sub">На одну операцию</span>
              </div>
              <div className="landing-stat-box">
                <span className="stat-label">Источники</span>
                <span className="stat-value">7 цитат</span>
                <span className="stat-sub">Подтверждено в сети</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Пошаговый процесс (Пайплайн фермы) */}
      <section className="landing-section">
        <div className="landing-section-header">
          <span className="landing-section-tag">Полный цикл проверки</span>
          <h2>Как идея превращается в готовое решение</h2>
          <p>Автономные шаги заменяют недели ручного поиска информации, интервью и споров.</p>
        </div>

        <div className="landing-pipeline-grid">
          <div className="landing-step-card">
            <div className="landing-step-num">01</div>
            <div className="landing-step-icon">
              <Icon name="mic" size={22}/>
            </div>
            <h3>Голос или текст</h3>
            <p>Надиктуйте мысль прямо в микрофон или опишите задачу в свободной форме. Система точно расшифрует и структурирует контекст.</p>
          </div>

          <div className="landing-step-card">
            <div className="landing-step-num">02</div>
            <div className="landing-step-icon">
              <Icon name="search" size={22}/>
            </div>
            <h3>Поиск фактов и рынка</h3>
            <p>Агенты выполняют веб-поиск в открытых источниках, находят реальные решения конкурентов и проверяют ограничения с прямыми цитатами.</p>
          </div>

          <div className="landing-step-card">
            <div className="landing-step-num">03</div>
            <div className="landing-step-icon">
              <Icon name="scale" size={22}/>
            </div>
            <h3>Контрольные прогоны</h3>
            <p>Генерируются 2 альтернативных инженерных варианта решения и тестируются на сгенерированных контрольных кейсах с замером секунд.</p>
          </div>

          <div className="landing-step-card">
            <div className="landing-step-num">04</div>
            <div className="landing-step-icon">
              <Icon name="calculator" size={22}/>
            </div>
            <h3>Расчёт экономии</h3>
            <p>Методом парного бутстрапа SciPy/NumPy строится доверительный интервал выгоды и 3 сценария внедрения: консервативный, базовый и оптимистичный.</p>
          </div>

          <div className="landing-step-card">
            <div className="landing-step-num">05</div>
            <div className="landing-step-icon">
              <Icon name="shield" size={22}/>
            </div>
            <h3>Критическая оценка</h3>
            <p>Независимая мощная модель-критик без предвзятости ищет слабые места, проверяет программные ворота доказательств и выдаёт вердикт.</p>
          </div>

          <div className="landing-step-card">
            <div className="landing-step-num">06</div>
            <div className="landing-step-icon">
              <Icon name="rocket" size={22}/>
            </div>
            <h3>Интерактивный MVP</h3>
            <p>Если вердикт положительный, в один клик собирается работающий изолированный прототип, который можно протестировать на реальных данных.</p>
          </div>
        </div>
      </section>

      {/* 4 Ключевые ценности */}
      <section className="landing-features-section">
        <div className="landing-section-header">
          <span className="landing-section-tag">Преимущества</span>
          <h2>Почему фаундеры и продакты выбирают Ферму</h2>
        </div>

        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="feature-icon-circle emerald">
              <Icon name="clock" size={24}/>
            </div>
            <h4>Экономия 80+ часов команды</h4>
            <p>Не нужно отвлекать разработчиков и аналитиков на проверку «сырых» идей. Ферма отфильтрует слабые идеи до того, как они попадут в бэклог.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon-circle amber">
              <Icon name="shield" size={24}/>
            </div>
            <h4>Антигаллюцинации и факты</h4>
            <p>Утверждения классифицируются как подтверждённые факты только при наличии точной цитаты из источника. Всё остальное честно отмечается как допущение.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon-circle indigo">
              <Icon name="chart" size={24}/>
            </div>
            <h4>Математический расчёт эффекта</h4>
            <p>Вместо интуитивных оценок — воспроизводимое статистическое моделирование на чистом Python с проверкой 10 000 бутстрап-подвыборок.</p>
          </div>

          <div className="landing-feature-card">
            <div className="feature-icon-circle accent">
              <Icon name="card" size={24}/>
            </div>
            <h4>Готовый рабочий прототип</h4>
            <p>Не просто PDF-презентация, а реальный интерфейс с серверной обработкой, который можно сразу показать стейкхолдерам и первым клиентам.</p>
          </div>
        </div>
      </section>

      {/* Нижний CTA-блок */}
      <section className="landing-cta-banner">
        <div className="landing-cta-box">
          <div className="landing-cta-text">
            <h2>Готовы проверить свою первую идею?</h2>
            <p>Зарегистрируйтесь бесплатно. Первые идеи и исследование доступны сразу после входа.</p>
          </div>
          <div className="landing-cta-buttons">
            <button
              type="button"
              className="ui-btn ui-btn-primary ui-btn-xl"
              onClick={()=>setAuthMode('register')}
            >
              <span>Создать личный кабинет</span>
              <Icon name="arrowRight" size={18}/>
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-secondary ui-btn-xl"
              onClick={()=>setAuthMode('login')}
            >
              <span>У меня есть аккаунт</span>
            </button>
          </div>
        </div>
      </section>

      {/* Подвал */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-brand">
            <span className="farm-brand-mark"><Icon name="sparkles" size={18}/></span>
            <strong>Продуктовая ферма</strong>
          </div>
          <div className="landing-footer-links">
            <a href="/docs">Как это работает</a>
            <button type="button" onClick={()=>setAuthMode('login')}>Вход</button>
            <button type="button" onClick={()=>setAuthMode('register')}>Регистрация</button>
          </div>
          <span className="landing-copyright">© 2026 Продуктовая ферма. Все права защищены.</span>
        </div>
      </footer>

      {/* Модальное окно авторизации/регистрации */}
      {authMode&&(
        <div className="ui-modal-backdrop" onClick={()=>setAuthMode(null)}>
          <div className="landing-auth-modal" onClick={e=>e.stopPropagation()}>
            <button
              type="button"
              className="landing-modal-close"
              onClick={()=>setAuthMode(null)}
              aria-label="Закрыть"
            >
              <Icon name="x" size={20}/>
            </button>
            <AuthForm
              onLogin={account=>{
                setAuthMode(null);
                onLogin(account);
              }}
              error={error}
              defaultRegister={authMode==='register'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
