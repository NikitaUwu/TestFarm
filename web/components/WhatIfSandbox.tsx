'use client';

import React, { useState, useMemo } from 'react';
import { Icon } from './UI';

export interface WhatIfSandboxProps {
  calculation: any;
}

export function WhatIfSandbox({ calculation }: WhatIfSandboxProps) {
  // Базовые параметры по умолчанию
  const [hourlyRate, setHourlyRate] = useState(1500); // 1500 ₽/час
  const [monthlyVolume, setMonthlyVolume] = useState(4000); // 4000 операций в месяц
  const [coveragePercent, setCoveragePercent] = useState(80); // 80% автоматизации

  // Измеряемый выигрыш во времени на одну задачу из бутстрап-модели
  const measuredDeltaSec = useMemo(() => {
    const delta = calculation?.variants?.[0]?.measuredEffect?.deltaSeconds;
    if (delta != null && delta > 0) return delta;
    const baseScenario = calculation?.scenarios?.base?.[0];
    if (baseScenario?.monthlySeconds && baseScenario?.monthlyRuns) {
      return baseScenario.monthlySeconds / baseScenario.monthlyRuns;
    }
    return 35; // Разумный дефолт: 35 секунд на операцию
  }, [calculation]);

  // Вычисления юнит-экономики
  const {
    monthlyHoursSaved,
    annualHoursSaved,
    monthlyGrossSavings,
    annualGrossSavings,
    monthlyAiCost,
    annualNetProfit,
    roiPercent,
    breakEvenVolume,
  } = useMemo(() => {
    const automatedTasks = monthlyVolume * (coveragePercent / 100);
    const mHours = (automatedTasks * measuredDeltaSec) / 3600;
    const aHours = mHours * 12;

    const mGross = mHours * hourlyRate;
    const aGross = mGross * 12;

    // Стоимость вызова ИИ-моделей на одну операцию (около 0.12 - 0.15 ₽)
    const costPerCall = 0.14;
    const mAiCost = automatedTasks * costPerCall;
    const aAiCost = mAiCost * 12;

    const aNet = aGross - aAiCost;
    const roi = aAiCost > 0 ? Math.round((aNet / aAiCost) * 100) : 0;

    // Точка безубыточности в операциях
    const profitPerTask = (measuredDeltaSec / 3600) * hourlyRate - costPerCall;
    const breakEven = profitPerTask > 0 ? Math.ceil(5000 / profitPerTask) : 500;

    return {
      monthlyHoursSaved: mHours.toFixed(1),
      annualHoursSaved: Math.round(aHours),
      monthlyGrossSavings: Math.round(mGross),
      annualGrossSavings: Math.round(aGross),
      monthlyAiCost: Math.round(mAiCost),
      annualNetProfit: Math.round(aNet),
      roiPercent: roi,
      breakEvenVolume: Math.max(50, breakEven),
    };
  }, [hourlyRate, monthlyVolume, coveragePercent, measuredDeltaSec]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ru-RU').format(val) + ' ₽';
  };

  const isHighProfit = annualNetProfit >= 500000;
  const isModerateProfit = annualNetProfit >= 100000 && annualNetProfit < 500000;

  return (
    <div className="whatif-sandbox-card">
      <div className="whatif-header">
        <div className="whatif-title-row">
          <div className="whatif-icon">
            <Icon name="calculator" size={20} />
          </div>
          <div>
            <h3>What-If Sandbox: Интерактивный симулятор экономики</h3>
            <p>Управляйте параметрами внедрения и мгновенно оценивайте годовой эффект</p>
          </div>
        </div>
        <div className="whatif-badge">
          <span>Выигрыш: ~{measuredDeltaSec.toFixed(1)} сек/операция</span>
        </div>
      </div>

      <div className="whatif-body-grid">
        {/* Левая колонка: интерактивные слайдеры */}
        <div className="whatif-sliders-panel">
          {/* 1. Ставка специалиста */}
          <div className="whatif-slider-group">
            <div className="whatif-slider-label">
              <span>Ставка сотрудника (включая налоги)</span>
              <strong>{hourlyRate.toLocaleString('ru-RU')} ₽ / час</strong>
            </div>
            <input
              type="range"
              min={600}
              max={4500}
              step={100}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              className="whatif-range-input"
            />
            <div className="whatif-slider-hints">
              <span>600 ₽ (стажёр)</span>
              <span>2 500 ₽ (лид)</span>
              <span>4 500 ₽ (эксперт)</span>
            </div>
          </div>

          {/* 2. Объем задач */}
          <div className="whatif-slider-group">
            <div className="whatif-slider-label">
              <span>Объём операций в месяц</span>
              <strong>{monthlyVolume.toLocaleString('ru-RU')} задач / мес</strong>
            </div>
            <input
              type="range"
              min={500}
              max={25000}
              step={500}
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(Number(e.target.value))}
              className="whatif-range-input"
            />
            <div className="whatif-slider-hints">
              <span>500 (пилот)</span>
              <span>10 000 (отдел)</span>
              <span>25 000+ (компания)</span>
            </div>
          </div>

          {/* 3. Охват сценария */}
          <div className="whatif-slider-group">
            <div className="whatif-slider-label">
              <span>Степень автономности ИИ</span>
              <strong>{coveragePercent}% сценария</strong>
            </div>
            <input
              type="range"
              min={40}
              max={95}
              step={5}
              value={coveragePercent}
              onChange={(e) => setCoveragePercent(Number(e.target.value))}
              className="whatif-range-input"
            />
            <div className="whatif-slider-hints">
              <span>40% (ассистент)</span>
              <span>75% (базовый)</span>
              <span>95% (сквозной ИИ)</span>
            </div>
          </div>
        </div>

        {/* Правая колонка: финансовое табло */}
        <div className="whatif-metrics-panel">
          <div className="whatif-hero-stat">
            <span className="whatif-hero-label">ЧИСТАЯ ГОДОВАЯ ВЫГОДА</span>
            <div className="whatif-hero-num">{formatCurrency(annualNetProfit)}</div>
            <span className="whatif-hero-sub">чистый эффект от высвобождения рабочего времени команды</span>
          </div>

          <div className="whatif-mini-grid">
            <div className="whatif-mini-card">
              <span className="whatif-mini-label">Экономия времени</span>
              <strong>{monthlyHoursSaved} ч / мес</strong>
              <small>~{annualHoursSaved} рабочих часов в год</small>
            </div>
            <div className="whatif-mini-card">
              <span className="whatif-mini-label">Охват автоматизации</span>
              <strong style={{ color: '#0284c7' }}>100%</strong>
              <small>покрытие типового сценария</small>
            </div>
            <div className="whatif-mini-card">
              <span className="whatif-mini-label">Точка безубыточности</span>
              <strong>{breakEvenVolume.toLocaleString('ru-RU')} задач</strong>
              <small>для полного покрытия затрат</small>
            </div>
            <div className="whatif-mini-card">
              <span className="whatif-mini-label">Рентабельность (ROI)</span>
              <strong style={{ color: '#10b981' }}>+{roiPercent}%</strong>
              <small>коэффициент экономической отдачи</small>
            </div>
          </div>

          {/* Резюме для руководства */}
          <div className={`whatif-verdict-callout ${isHighProfit ? 'high' : isModerateProfit ? 'moderate' : 'low'}`}>
            <Icon name={isHighProfit ? 'rocket' : isModerateProfit ? 'checkCircle' : 'alertTriangle'} size={18} />
            <p>
              {isHighProfit
                ? `Сверхвысокая окупаемость: внедрение экономит ${monthlyHoursSaved} часов квалифицированного труда ежемесячно. Проект окупается мгновенно.`
                : isModerateProfit
                ? `Положительная юнит-экономика: окупаемость достигается уже при объёме от ${breakEvenVolume} операций в месяц.`
                : `Умеренная маржинальность: для существенной отдачи рекомендуется расширить охват сценария или применять на ставках от 2 000 ₽/час.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
