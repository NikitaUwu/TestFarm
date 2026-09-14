import policy from '../../farm/policy.json';
import {Icon,Badge} from '../../components/UI';

export default function Documentation(){
  return (
    <div className="docs-shell">
      {/* Шапка документации */}
      <header className="docs-header">
        <div className="docs-header-inner">
          <a href="/" className="docs-back-btn">
            <Icon name="arrow" size={16} className="rotate-180"/>
            <span>К рабочему пространству</span>
          </a>
          <div className="docs-brand">
            <span className="farm-brand-mark"><Icon name="sparkles" size={18}/></span>
            <strong>Продуктовая ферма</strong>
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main className="docs-content">
        <div className="docs-hero">
          <div className="docs-tag">
            <Icon name="report" size={14}/>
            <span>База знаний и руководство</span>
          </div>
          <h1 className="docs-title">Как работает Продуктовая ферма</h1>
          <p className="docs-subtitle">
            Полный путеводитель по автономному исследованию идей: от голосового ввода до статистического моделирования эффекта и запуска работающего прототипа.
          </p>
        </div>

        {/* Интерактивная карта процесса */}
        <section className="docs-section">
          <div className="docs-section-heading">
            <span className="docs-step-badge">Этап 1</span>
            <h2>Путь идеи от формулировки до вердикта</h2>
            <p>Исследование выполняется в облаке автономно без обязательных промежуточных опросов.</p>
          </div>

          <div className="docs-steps-grid">
            <div className="docs-card">
              <div className="docs-card-icon emerald">
                <Icon name="mic" size={22}/>
              </div>
              <h3>1. Ввод и распознавание</h3>
              <p>Вы описываете проблему текстом или диктуете в микрофон. Модель Whisper Large V3 Turbo транскрибирует запись, а ИИ-аналитик выделяет ценностное предложение, аудиторию и ограничения.</p>
            </div>

            <div className="docs-card">
              <div className="docs-card-icon amber">
                <Icon name="search" size={22}/>
              </div>
              <h3>2. Веб-поиск и доказательства</h3>
              <p>Агент выполняет серию целевых поисковых запросов через Exa. Утверждения получают статус <code>EXTERNAL_FACT</code> только при наличии точной цитаты из источника, исключая ИИ-галлюцинации.</p>
            </div>

            <div className="docs-card">
              <div className="docs-card-icon indigo">
                <Icon name="scale" size={22}/>
              </div>
              <h3>3. Сравнение архитектур</h3>
              <p>Стратег формирует ровно два инженерных варианта решения (например, чистый LLM против LLM с детерминированными бизнес-правилами) и тестирует их на контрольных кейсах с таймингом.</p>
            </div>

            <div className="docs-card">
              <div className="docs-card-icon accent">
                <Icon name="calculator" size={22}/>
              </div>
              <h3>4. Математический расчёт</h3>
              <p>Python-модуль методом парного бутстрапа (10 000 повторов) строит доверительный интервал экономии времени и рассчитывает сценарии: базовый, оптимистичный и консервативный.</p>
            </div>

            <div className="docs-card">
              <div className="docs-card-icon rose">
                <Icon name="shield" size={22}/>
              </div>
              <h3>5. Критическая оценка</h3>
              <p>Независимая модель-критик gpt-oss-120b проверяет стоп-факторы, программные ворота доказательств и формирует один из вердиктов: Развивать, Сначала проверить, Отложить или Недостаточно данных.</p>
            </div>

            <div className="docs-card">
              <div className="docs-card-icon emerald">
                <Icon name="rocket" size={22}/>
              </div>
              <h3>6. Интерактивный MVP</h3>
              <p>При положительном решении собирается изолированный рабочий прототип. Вы можете проверить сценарий на реальных данных прямо в браузере без написания кода.</p>
            </div>
          </div>
        </section>

        {/* Как читать аналитический отчёт */}
        <section className="docs-section">
          <div className="docs-section-heading">
            <span className="docs-step-badge">Этап 2</span>
            <h2>Как правильно читать отчёт</h2>
          </div>

          <div className="docs-info-grid">
            <div className="docs-info-box">
              <h4>
                <Icon name="clock" size={18} className="text-emerald"/>
                <span>Измеренное время vs Прогноз</span>
              </h4>
              <p>
                Машинное время измеряется во время реальных запусков на контрольных кейсах. Прогноз часов в месяц строится на основе предполагаемого ежемесячного объёма операций и процента ручной доработки.
              </p>
            </div>

            <div className="docs-info-box">
              <h4>
                <Icon name="shield" size={18} className="text-amber"/>
                <span>Программные ворота доказательности</span>
              </h4>
              <p>
                Рекомендация «Развивать» блокируется кодом, если собрано менее {policy.evidence.minimumSources} независимых источников, меньше {policy.evidence.minimumAlternatives} подтверждённых альтернатив или если замеры статистически незначимы.
              </p>
            </div>

            <div className="docs-info-box">
              <h4>
                <Icon name="sparkles" size={18} className="text-indigo"/>
                <span>Синтетические данные</span>
              </h4>
              <p>
                Если в открытом доступе нет готового датасета, аналитик генерирует синтетические примеры. Они помечены как <code>SIMULATED</code>: они доказывают работоспособность сценария, но не гарантируют бизнес-эффект.
              </p>
            </div>
          </div>
        </section>

        {/* Прозрачность расходов и модели */}
        <section className="docs-section">
          <div className="docs-section-heading">
            <span className="docs-step-badge">Этап 3</span>
            <h2>Стоимость, лимиты и технологии</h2>
          </div>

          <div className="docs-tech-card">
            <div className="docs-tech-item">
              <span className="docs-tech-label">Лимит бюджета на исследование</span>
              <span className="docs-tech-val">{policy.budget.maxRunRub} ₽</span>
              <span className="docs-tech-desc">Перед каждым вызовом резервируется сумма. При достижении лимита новые платные вызовы блокируются.</span>
            </div>
            <div className="docs-tech-item">
              <span className="docs-tech-label">Основная языковая модель</span>
              <span className="docs-tech-val">{policy.provider.model}</span>
              <span className="docs-tech-desc">Используется для структурирования, поиска и генерации вариантов.</span>
            </div>
            <div className="docs-tech-item">
              <span className="docs-tech-label">Модель критической оценки</span>
              <span className="docs-tech-val">{policy.provider.criticModel}</span>
              <span className="docs-tech-desc">Высокопараметрическая независимая модель для беспристрастной критики.</span>
            </div>
            <div className="docs-tech-item">
              <span className="docs-tech-label">Распознавание речи (STT)</span>
              <span className="docs-tech-val">{policy.provider.speechModel}</span>
              <span className="docs-tech-desc">Обработка аудиозаписей до 5 минут на русском языке.</span>
            </div>
          </div>
        </section>

        {/* Безопасность и хранение данных */}
        <section className="docs-section">
          <div className="docs-section-heading">
            <span className="docs-step-badge">Этап 4</span>
            <h2>Безопасность и изоляция данных</h2>
          </div>

          <div className="docs-card docs-card-wide">
            <p>
              Каждый пользователь имеет доступ <strong>исключительно к своим идеям и отчётам</strong>. Данные хранятся в защищённой базе данных Neon PostgreSQL с серверной валидацией прав на каждом маршруте.
            </p>
            <p>
              Все внешние веб-страницы и пользовательские входы считаются недоверенными: сервер никогда не исполняет произвольный сгенерированный код, а MVP работает строго по декларативной спецификации разрешённых полей и валидаций.
            </p>
            <p>
              При удалении идеи её артефакты, логи и прогоны безвозвратно удаляются из активного хранилища фермы.
            </p>
          </div>
        </section>

        {/* Кнопка возврата внизу */}
        <div className="docs-footer-cta">
          <a href="/" className="ui-btn ui-btn-primary ui-btn-lg">
            <Icon name="rocket" size={18}/>
            <span>Перейти к проверке идей</span>
          </a>
        </div>
      </main>
    </div>
  );
}

