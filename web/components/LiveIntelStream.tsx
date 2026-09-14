'use client';

import React, { useMemo } from 'react';
import { Icon, Badge } from './UI';

export interface LiveIntelStreamProps {
  run: any;
  currentStepInfo?: { name: string; desc: string; step: number } | null;
}

const STEP_THOUGHTS: Record<string, { role: string; icon: string; headline: string; thoughts: string[] }> = {
  analyzeIdea: {
    role: 'Продуктовый стратег',
    icon: 'lightbulb',
    headline: 'Декомпозиция проблемы и ценностного предложения',
    thoughts: [
      'Анализируем контекст сценария и выявляем скрытые неэффективности…',
      'Формулируем критерии успешности проверки гипотезы…',
      'Фиксируем ключевые предположения для стресс-теста…',
    ],
  },
  analyzeAudience: {
    role: 'UX/JTBD Исследователь',
    icon: 'user',
    headline: 'Определение целевых персон и сценариев',
    thoughts: [
      'Составляем профиль стейкхолдеров и конечных исполнителей задачи…',
      'Оцениваем текущую альтернативу: как проблема решается сегодня ручным трудом…',
      'Картируем ключевые точки трения в рабочем процессе…',
    ],
  },
  researchMarketAndEvidence: {
    role: 'Аналитик рынка',
    icon: 'search',
    headline: 'Поиск открытых источников, аналогов и тарифов',
    thoughts: [
      'Поиск существующих решений на глобальном и локальном рынках…',
      'Сравнение ценовых моделей и функциональных ограничений конкурентов…',
      'Верификация открытых данных и сбор прямых цитат…',
    ],
  },
  buildHypotheses: {
    role: 'Методолог гипотез',
    icon: 'scale',
    headline: 'Формирование проверяемых продуктовых гипотез',
    thoughts: [
      'Определение измеримых метрик: экономия времени, точность, конверсия…',
      'Выделение критических допущений, при нарушении которых идея не взлетит…',
    ],
  },
  proposeVariants: {
    role: 'Системный архитектор',
    icon: 'settings',
    headline: 'Проектирование конкурирующих вариантов решения',
    thoughts: [
      'Формирование Варианта 1: легковесный потоковый агент с минимальной задержкой…',
      'Формирование Варианта 2: валидированный пайплайн с многоуровневой проверкой правил…',
      'Оценка аппаратных ресурсов и времени отклика…',
    ],
  },
  prepareBaseline: {
    role: 'Инженер данных',
    icon: 'card',
    headline: 'Подготовка контрольных тестовых кейсов',
    thoughts: [
      'Сбор синтетического набора контрольных сценариев для честного бенчмарка…',
      'Калибровка эталонного времени выполнения человеком (baseline)…',
    ],
  },
  runVariants: {
    role: 'Бенчмарк-раннер',
    icon: 'activity',
    headline: 'Тестовые прогоны на контрольных сценариях',
    thoughts: [
      'Параллельный запуск вариантов на тестовых задачах…',
      'Замер машинного времени и процента успешных выполнений…',
      'Фиксация краевых случаев и отказов…',
    ],
  },
  calculateEffect: {
    role: 'Эконометрист',
    icon: 'calculator',
    headline: 'Статистическое моделирование эффекта (Бутстрап)',
    thoughts: [
      'Запуск парного бутстрапа (1000 итераций) для оценки распределения…',
      'Расчёт 95% доверительных интервалов выигрыша во времени…',
      'Проверка статистической значимости улучшений…',
    ],
  },
  buildScenarios: {
    role: 'Финансовый аналитик',
    icon: 'chart',
    headline: 'Построение сценариев внедрения и окупаемости',
    thoughts: [
      'Моделирование консервативного сценария (с ручной перепроверкой 30%)…',
      'Моделирование базового и оптимистичного сценариев на горизонте месяца и года…',
    ],
  },
  criticalAssessment: {
    role: 'Независимый критик (GPT-OSS-120B)',
    icon: 'shield',
    headline: 'Беспристрастный стресс-тест и поиск стоп-факторов',
    thoughts: [
      'Поиск регуляторных, технический и экономических стоп-факторов…',
      'Формирование жесткой альтернативной точки зрения: почему проект может провалиться…',
      'Подготовка итоговой рекомендации: развивать, доработать или остановить…',
    ],
  },
  reportEditor: {
    role: 'Главный редактор отчёта',
    icon: 'report',
    headline: 'Сборка интерактивного аналитического паспорта',
    thoughts: [
      'Агрегация всех измерений, графиков и источников в единый дашборд…',
      'Синтез структуры прототипа MVP для одного ключевого сценария…',
    ],
  },
};

export function LiveIntelStream({ run, currentStepInfo }: LiveIntelStreamProps) {
  const currentStepKey = run.currentStep || 'analyzeIdea';
  const stepMeta = STEP_THOUGHTS[currentStepKey] || STEP_THOUGHTS.analyzeIdea;

  // Список завершённых микро-операций по логам
  const completedActors = useMemo(() => {
    const actors: Array<{ name: string; action: string; duration: string }> = [];
    if (run.logs && Array.isArray(run.logs)) {
      for (const log of run.logs) {
        if (log.status === 'completed') {
          actors.push({
            name: log.actorName || 'Агент',
            action: log.action || 'Операция',
            duration: log.durationMs ? `${(log.durationMs / 1000).toFixed(1)} с` : '',
          });
        }
      }
    }
    return actors.slice(-4).reverse();
  }, [run.logs]);

  return (
    <div className="live-intel-container">
      {/* Шапка живого стрима */}
      <div className="live-intel-header">
        <div className="live-intel-badge">
          <span className="live-pulse-dot" />
          <span className="live-badge-text">LIVE AI STREAM</span>
        </div>
        <div className="live-intel-meta">
          <span className="live-intel-step">
            Этап: <strong>{currentStepInfo?.name || stepMeta.headline}</strong>
          </span>
        </div>
      </div>

      {/* Основная карточка текущего фокуса агента */}
      <div className="live-intel-card">
        <div className="live-intel-agent-row">
          <div className="live-agent-avatar">
            <Icon name={stepMeta.icon} size={20} />
          </div>
          <div>
            <div className="live-agent-role">{stepMeta.role}</div>
            <h4 className="live-agent-headline">{stepMeta.headline}</h4>
          </div>
        </div>

        {/* Пульсирующие мысли агента */}
        <div className="live-intel-stream-box">
          <ul className="live-thoughts-list">
            {stepMeta.thoughts.map((thought, idx) => (
              <li key={idx} className="live-thought-item">
                <span className="live-thought-chevron">›</span>
                <span>{thought}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Лента недавних завершённых микро-операций */}
      {completedActors.length > 0 && (
        <div className="live-intel-history">
          <span className="live-history-title">Зафиксированные результаты этапа:</span>
          <div className="live-history-chips">
            {completedActors.map((actor, i) => (
              <div key={i} className="live-history-chip">
                <span className="live-chip-check">✓</span>
                <span className="live-chip-actor">{actor.name}</span>
                {actor.duration && <span className="live-chip-time">{actor.duration}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
