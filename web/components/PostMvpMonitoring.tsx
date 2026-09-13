'use client';
import { useState, useEffect, useMemo } from 'react';
import { Icon, Badge, NumberValue } from './UI';

export interface PilotObservation {
  id: string;
  date: string;
  source: string;
  sampleSize: number;
  actualVolume: number;
  actualChainSec: number;
  actualQuality: number; // in %
  actualManualReviewRate: number; // in %
  actualReviewSec: number;
  actualHourlyRate: number;
  notes?: string;
}

export function PostMvpMonitoring({
  report,
  readOnly = false,
}: {
  report: any;
  readOnly?: boolean;
}) {
  // Key for persistence
  const storageKey = `farm_pilot_obs_${report.id || report.runId || 'default'}`;

  // Target metrics from report baseline & calculation
  const targetVolume = report.calculation?.scenarios?.base?.[0]?.volume || 1000;
  const bestVariant = report.calculation?.variants?.[0]?.measuredEffect;
  const targetChainSec = bestVariant?.variantSeconds ?? 4.2;
  const targetBaselineSec = bestVariant?.baselineSeconds ?? 60;
  const targetQuality = Math.round((bestVariant?.quality ?? 0.92) * 100);
  const targetManualReviewRate = Math.round((bestVariant?.manualReviewRate ?? 0.15) * 100);
  const targetReviewSec = 45;
  const targetCorrectionSec = bestVariant?.errorCorrectionSeconds ?? 60;
  const targetHourlyRate = 800; // default rub/hour

  // Calculate target monthly savings
  const targetMonthlyHours = useMemo(() => {
    if (report.calculation?.scenarios?.base?.[0]?.monthlySeconds) {
      return report.calculation.scenarios.base[0].monthlySeconds / 3600;
    }
    const netPerOp = targetBaselineSec - targetChainSec - (targetManualReviewRate / 100) * targetReviewSec - (1 - targetQuality / 100) * targetCorrectionSec;
    return Math.max(0, (targetVolume * 0.8 * netPerOp) / 3600);
  }, [report, targetBaselineSec, targetChainSec, targetManualReviewRate, targetReviewSec, targetQuality, targetCorrectionSec, targetVolume]);

  const targetMonthlySavings = Math.round(targetMonthlyHours * targetHourlyRate);

  // Observations state
  const [observations, setObservations] = useState<PilotObservation[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal form state
  const [formData, setFormData] = useState({
    source: 'Замеры первой недели пилотной эксплуатации',
    sampleSize: 150,
    actualVolume: 1200,
    actualChainSec: Number(targetChainSec.toFixed(1)),
    actualQuality: targetQuality,
    actualManualReviewRate: targetManualReviewRate,
    actualReviewSec: targetReviewSec,
    actualHourlyRate: targetHourlyRate,
    notes: 'Пилот проведён на реальном потоке обращений операторов службы поддержки.',
  });

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setObservations(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  // Save to localStorage on change
  const saveObservations = (newObs: PilotObservation[]) => {
    setObservations(newObs);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newObs));
    } catch {
      // ignore
    }
  };

  // Latest observation
  const latestObs = observations[0] || null;

  // Recalculate actual effect based on latest observation
  const actualStats = useMemo(() => {
    if (!latestObs) return null;

    const netPerOp = targetBaselineSec - latestObs.actualChainSec - (latestObs.actualManualReviewRate / 100) * latestObs.actualReviewSec - (1 - latestObs.actualQuality / 100) * targetCorrectionSec;
    const actualMonthlyHours = (latestObs.actualVolume * 0.8 * netPerOp) / 3600;
    const actualMonthlySavings = Math.round(actualMonthlyHours * latestObs.actualHourlyRate);

    const hoursDelta = actualMonthlyHours - targetMonthlyHours;
    const hoursDeltaPct = targetMonthlyHours > 0 ? (hoursDelta / targetMonthlyHours) * 100 : 0;

    const savingsDelta = actualMonthlySavings - targetMonthlySavings;
    const savingsDeltaPct = targetMonthlySavings > 0 ? (savingsDelta / targetMonthlySavings) * 100 : 0;

    // Decision state machine
    let verdictStatus: 'confirmed' | 'warning' | 'blocked' = 'confirmed';
    let verdictTitle = 'Эффект подтверждён на пилоте';
    let verdictDesc = 'Фактические результаты пилота соответствуют целевым показателям. Рекомендован переход к масштабированию и промышленной интеграции.';

    if (actualMonthlyHours <= 0) {
      verdictStatus = 'blocked';
      verdictTitle = 'Пилот не подтвердил экономический эффект';
      verdictDesc = 'Время на ручную перепроверку и исправление ошибок превышает выигрыш от автоматизации. Внедрение нецелесообразно без доработки алгоритма.';
    } else if (hoursDeltaPct < -20) {
      verdictStatus = 'warning';
      verdictTitle = 'Отклонение от плана: требуется доработка';
      verdictDesc = `Чистая экономия положительна, но ниже плана на ${Math.abs(Math.round(hoursDeltaPct))}%. Рекомендуется оптимизировать промпт и правила валидации для снижения доли ручных проверок.`;
    }

    return {
      actualMonthlyHours,
      actualMonthlySavings,
      hoursDelta,
      hoursDeltaPct,
      savingsDelta,
      savingsDeltaPct,
      verdictStatus,
      verdictTitle,
      verdictDesc,
      netPerOp,
    };
  }, [latestObs, targetBaselineSec, targetCorrectionSec, targetMonthlyHours, targetMonthlySavings]);

  const handleAddObservation = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: PilotObservation = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      source: formData.source,
      sampleSize: Number(formData.sampleSize),
      actualVolume: Number(formData.actualVolume),
      actualChainSec: Number(formData.actualChainSec),
      actualQuality: Number(formData.actualQuality),
      actualManualReviewRate: Number(formData.actualManualReviewRate),
      actualReviewSec: Number(formData.actualReviewSec),
      actualHourlyRate: Number(formData.actualHourlyRate),
      notes: formData.notes,
    };
    saveObservations([newEntry, ...observations]);
    setIsModalOpen(false);
  };

  const handleLoadDemo = () => {
    const demoEntry: PilotObservation = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      source: 'Пилот 1-й недели (замер на 150 обращениях)',
      sampleSize: 150,
      actualVolume: 1250,
      actualChainSec: 3.9,
      actualQuality: 89,
      actualManualReviewRate: 21,
      actualReviewSec: 42,
      actualHourlyRate: 800,
      notes: 'Выборка из 150 тикетов. Точность ИИ составила 89% (план 92%), однако благодаря росту потока до 1250 обращений чистая экономия остаётся высокой.',
    };
    saveObservations([demoEntry, ...observations]);
  };

  const handleDeleteObservation = (id: string) => {
    saveObservations(observations.filter(o => o.id !== id));
  };

  const formatDelta = (deltaPct: number) => {
    const sign = deltaPct > 0 ? '+' : '';
    return `${sign}${deltaPct.toFixed(1)}%`;
  };

  return (
    <section id="monitoring" className="report-section monitoring-section">
      <div className="report-section-header monitoring-header">
        <div>
          <div className="monitoring-tag-row">
            <span className="report-section-tag">Пост-MVP эксплуатация</span>
            <span className="monitoring-status-pill">
              {latestObs ? (
                <Badge variant={actualStats?.verdictStatus === 'confirmed' ? 'emerald' : actualStats?.verdictStatus === 'warning' ? 'amber' : 'rose'}>
                  {actualStats?.verdictStatus === 'confirmed' ? 'Пилот подтверждён' : actualStats?.verdictStatus === 'warning' ? 'Требует внимания' : 'Эффект не подтверждён'}
                </Badge>
              ) : (
                <Badge variant="neutral">Нет данных пилота</Badge>
              )}
            </span>
          </div>
          <h2>Пост-MVP мониторинг бизнес-метрик</h2>
        </div>

        {!readOnly && (
          <div className="monitoring-header-actions">
            {!latestObs && (
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm"
                onClick={handleLoadDemo}
                title="Загрузить контрольный срез пилотных замеров"
              >
                <Icon name="sparkles" size={14} />
                <span>Загрузить демо-замер</span>
              </button>
            )}
            <button
              type="button"
              className="ui-btn ui-btn-primary ui-btn-sm"
              onClick={() => setIsModalOpen(true)}
            >
              <Icon name="plus" size={14} />
              <span>Внести замер пилота</span>
            </button>
          </div>
        )}
      </div>

      <p className="report-section-desc">
        Сопоставление лабораторного прогноза с фактическими измерениями пилотной эксплуатации. При накоплении наблюдений система автоматически пересчитывает чистую экономию и обновляет продуктовый вердикт (§32 ТЗ).
      </p>

      {/* If no observations yet */}
      {!latestObs ? (
        <div className="monitoring-empty-card">
          <div className="monitoring-empty-icon">
            <Icon name="activity" size={28} />
          </div>
          <div className="monitoring-empty-body">
            <h4>Нет данных пилотной эксплуатации</h4>
            <p>
              Прототип (MVP) сформирован на основе допущений и лабораторного бенчмарка. Чтобы подтвердить гипотезу на практике, внесите фактические замеры времени и качества работы операторов на пилоте.
            </p>
            {!readOnly && (
              <div className="monitoring-empty-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-primary ui-btn-sm"
                  onClick={() => setIsModalOpen(true)}
                >
                  <Icon name="plus" size={14} />
                  <span>Внести первый замер пилота</span>
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-subtle ui-btn-sm"
                  onClick={handleLoadDemo}
                >
                  <span>Загрузить демонстрационный срез</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Actual vs Target Comparative Dashboard */
        <div className="monitoring-dashboard">
          {/* Verdict Banner */}
          <div className={`monitoring-verdict-banner ${actualStats?.verdictStatus}`}>
            <div className="monitoring-verdict-icon">
              <Icon
                name={actualStats?.verdictStatus === 'confirmed' ? 'checkCircle' : actualStats?.verdictStatus === 'warning' ? 'alertTriangle' : 'x'}
                size={24}
              />
            </div>
            <div className="monitoring-verdict-content">
              <div className="monitoring-verdict-head">
                <h3>{actualStats?.verdictTitle}</h3>
                <span className="monitoring-verdict-date">
                  Замер от {new Date(latestObs.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <p>{actualStats?.verdictDesc}</p>
            </div>
          </div>

          {/* Key Recalculated KPI Cards */}
          <div className="monitoring-kpi-grid">
            <div className="monitoring-kpi-card">
              <span className="monitoring-kpi-label">Фактическая экономия времени</span>
              <div className="monitoring-kpi-val-row">
                <span className="monitoring-kpi-val">
                  <NumberValue value={Number((actualStats?.actualMonthlyHours || 0).toFixed(1))} /> ч/мес
                </span>
                <span className={`monitoring-kpi-delta ${(actualStats?.hoursDeltaPct || 0) >= 0 ? 'positive' : 'negative'}`}>
                  {formatDelta(actualStats?.hoursDeltaPct || 0)} от плана
                </span>
              </div>
              <span className="monitoring-kpi-sub">
                План (прогноз): {targetMonthlyHours.toFixed(1)} ч/мес
              </span>
            </div>

            <div className="monitoring-kpi-card">
              <span className="monitoring-kpi-label">Фактический финансовый эффект</span>
              <div className="monitoring-kpi-val-row">
                <span className="monitoring-kpi-val">
                  <NumberValue value={actualStats?.actualMonthlySavings || 0} /> ₽/мес
                </span>
                <span className={`monitoring-kpi-delta ${(actualStats?.savingsDeltaPct || 0) >= 0 ? 'positive' : 'negative'}`}>
                  {formatDelta(actualStats?.savingsDeltaPct || 0)} от плана
                </span>
              </div>
              <span className="monitoring-kpi-sub">
                План (прогноз): {targetMonthlySavings.toLocaleString('ru-RU')} ₽/мес
              </span>
            </div>

            <div className="monitoring-kpi-card">
              <span className="monitoring-kpi-label">Чистый выигрыш на 1 задачу</span>
              <div className="monitoring-kpi-val-row">
                <span className="monitoring-kpi-val">
                  <NumberValue value={Number((actualStats?.netPerOp || 0).toFixed(1))} /> сек
                </span>
              </div>
              <span className="monitoring-kpi-sub">
                С учётом ручной перепроверки {latestObs.actualManualReviewRate}%
              </span>
            </div>
          </div>

          {/* Comparison Table: Target vs Actual vs Delta */}
          <div className="monitoring-table-card">
            <div className="monitoring-table-header">
              <h4>Сопоставление параметров: Лабораторный прогноз vs Реальный пилот</h4>
              <span className="monitoring-sample-badge">
                Размер выборки: {latestObs.sampleSize} операций ({latestObs.source})
              </span>
            </div>

            <div className="table-wrapper">
              <table className="farm-table monitoring-table">
                <thead>
                  <tr>
                    <th>Метрика / Параметр</th>
                    <th>Целевой план (Лаборатория)</th>
                    <th>Фактическое значение (Пилот)</th>
                    <th>Отклонение (Δ)</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Месячный объём операций</strong>
                      <div className="monitoring-metric-sub">Число обращений в месяц</div>
                    </td>
                    <td>{targetVolume.toLocaleString('ru-RU')} оп/мес</td>
                    <td><strong>{latestObs.actualVolume.toLocaleString('ru-RU')} оп/мес</strong></td>
                    <td className={latestObs.actualVolume >= targetVolume ? 'text-emerald font-semibold' : 'text-zinc'}>
                      {formatDelta(((latestObs.actualVolume - targetVolume) / targetVolume) * 100)}
                    </td>
                    <td>
                      <Badge variant={latestObs.actualVolume >= targetVolume ? 'emerald' : 'neutral'}>
                        {latestObs.actualVolume >= targetVolume ? 'Выше плана' : 'В пределах нормы'}
                      </Badge>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong>Время обработки ИИ (Chain Time)</strong>
                      <div className="monitoring-metric-sub">Задержка инференса и валидации</div>
                    </td>
                    <td>{targetChainSec.toFixed(1)} сек</td>
                    <td><strong>{latestObs.actualChainSec.toFixed(1)} сек</strong></td>
                    <td className={latestObs.actualChainSec <= targetChainSec ? 'text-emerald font-semibold' : 'text-amber font-semibold'}>
                      {latestObs.actualChainSec <= targetChainSec ? `-${(targetChainSec - latestObs.actualChainSec).toFixed(1)} сек` : `+${(latestObs.actualChainSec - targetChainSec).toFixed(1)} сек`}
                    </td>
                    <td>
                      <Badge variant={latestObs.actualChainSec <= targetChainSec ? 'emerald' : 'amber'}>
                        {latestObs.actualChainSec <= targetChainSec ? 'Быстрее плана' : 'Замедление'}
                      </Badge>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong>Точность алгоритма (Accuracy)</strong>
                      <div className="monitoring-metric-sub">Доля корректных результатов без брака</div>
                    </td>
                    <td>{targetQuality}%</td>
                    <td><strong>{latestObs.actualQuality}%</strong></td>
                    <td className={latestObs.actualQuality >= targetQuality ? 'text-emerald font-semibold' : latestObs.actualQuality >= targetQuality - 5 ? 'text-amber font-semibold' : 'text-rose font-semibold'}>
                      {latestObs.actualQuality >= targetQuality ? `+${latestObs.actualQuality - targetQuality}%` : `${latestObs.actualQuality - targetQuality}%`}
                    </td>
                    <td>
                      <Badge variant={latestObs.actualQuality >= targetQuality ? 'emerald' : latestObs.actualQuality >= targetQuality - 5 ? 'amber' : 'rose'}>
                        {latestObs.actualQuality >= targetQuality ? 'Выше плана' : latestObs.actualQuality >= targetQuality - 5 ? 'Допустимо' : 'Критично'}
                      </Badge>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong>Доля ручной перепроверки</strong>
                      <div className="monitoring-metric-sub">Задачи, требующие вмешательства человека</div>
                    </td>
                    <td>{targetManualReviewRate}%</td>
                    <td><strong>{latestObs.actualManualReviewRate}%</strong></td>
                    <td className={latestObs.actualManualReviewRate <= targetManualReviewRate ? 'text-emerald font-semibold' : 'text-amber font-semibold'}>
                      {latestObs.actualManualReviewRate <= targetManualReviewRate ? `${latestObs.actualManualReviewRate - targetManualReviewRate}%` : `+${latestObs.actualManualReviewRate - targetManualReviewRate}%`}
                    </td>
                    <td>
                      <Badge variant={latestObs.actualManualReviewRate <= targetManualReviewRate ? 'emerald' : 'amber'}>
                        {latestObs.actualManualReviewRate <= targetManualReviewRate ? 'В норме' : 'Рост рутины'}
                      </Badge>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong>Время 1 ручной проверки</strong>
                      <div className="monitoring-metric-sub">Фактический хронометраж оператора</div>
                    </td>
                    <td>{targetReviewSec} сек</td>
                    <td><strong>{latestObs.actualReviewSec} сек</strong></td>
                    <td className={latestObs.actualReviewSec <= targetReviewSec ? 'text-emerald font-semibold' : 'text-amber font-semibold'}>
                      {latestObs.actualReviewSec <= targetReviewSec ? `-${targetReviewSec - latestObs.actualReviewSec} сек` : `+${latestObs.actualReviewSec - targetReviewSec} сек`}
                    </td>
                    <td>
                      <Badge variant={latestObs.actualReviewSec <= targetReviewSec ? 'emerald' : 'amber'}>
                        {latestObs.actualReviewSec <= targetReviewSec ? 'В норме' : 'Дольше нормы'}
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Observations Audit Log */}
          <div className="monitoring-log-card">
            <div className="monitoring-log-header">
              <h4>История и происхождение замеров (A4 Provenance)</h4>
              <span className="monitoring-log-count">{observations.length} {observations.length === 1 ? 'запись' : 'записей'}</span>
            </div>

            <div className="monitoring-log-list">
              {observations.map((obs, idx) => (
                <div key={obs.id} className="monitoring-log-item">
                  <div className="monitoring-log-meta">
                    <span className="monitoring-log-index">#{observations.length - idx}</span>
                    <div className="monitoring-log-info">
                      <strong>{obs.source}</strong>
                      <span className="monitoring-log-date">
                        {new Date(obs.date).toLocaleString('ru-RU')} · n = {obs.sampleSize} операций
                      </span>
                    </div>
                  </div>
                  {obs.notes && <p className="monitoring-log-notes">«{obs.notes}»</p>}
                  {!readOnly && (
                    <button
                      type="button"
                      className="monitoring-log-del-btn"
                      onClick={() => handleDeleteObservation(obs.id)}
                      title="Удалить этот замер"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Observation Modal */}
      {isModalOpen && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal-card monitoring-modal">
            <div className="confirm-modal-header">
              <Icon name="activity" size={20} />
              <h3>Внесение фактических замеров пилота</h3>
            </div>

            <form onSubmit={handleAddObservation} className="monitoring-form">
              <div className="monitoring-form-grid">
                <label className="farm-label">
                  <span>Источник данных / Описание замера:</span>
                  <input
                    required
                    type="text"
                    value={formData.source}
                    onChange={e => setFormData({ ...formData, source: e.target.value })}
                    className="farm-input"
                    placeholder="Например: Замеры 2-й недели пилота"
                  />
                </label>

                <label className="farm-label">
                  <span>Объём выборки (число проверенных задач, n):</span>
                  <input
                    required
                    type="number"
                    min={5}
                    value={formData.sampleSize}
                    onChange={e => setFormData({ ...formData, sampleSize: Number(e.target.value) })}
                    className="farm-input"
                  />
                </label>

                <label className="farm-label">
                  <span>Фактический месячный поток (операций/мес):</span>
                  <input
                    required
                    type="number"
                    min={1}
                    value={formData.actualVolume}
                    onChange={e => setFormData({ ...formData, actualVolume: Number(e.target.value) })}
                    className="farm-input"
                  />
                </label>

                <label className="farm-label">
                  <span>Фактическое время ответа ИИ (сек):</span>
                  <input
                    required
                    type="number"
                    step="0.1"
                    min={0.1}
                    value={formData.actualChainSec}
                    onChange={e => setFormData({ ...formData, actualChainSec: Number(e.target.value) })}
                    className="farm-input"
                  />
                </label>

                <label className="farm-label">
                  <span>Фактическая точность алгоритма (%):</span>
                  <input
                    required
                    type="number"
                    min={1}
                    max={100}
                    value={formData.actualQuality}
                    onChange={e => setFormData({ ...formData, actualQuality: Number(e.target.value) })}
                    className="farm-input"
                  />
                </label>

                <label className="farm-label">
                  <span>Доля ручной перепроверки (%):</span>
                  <input
                    required
                    type="number"
                    min={0}
                    max={100}
                    value={formData.actualManualReviewRate}
                    onChange={e => setFormData({ ...formData, actualManualReviewRate: Number(e.target.value) })}
                    className="farm-input"
                  />
                </label>

                <label className="farm-label">
                  <span>Время 1 ручной проверки (сек):</span>
                  <input
                    required
                    type="number"
                    min={1}
                    value={formData.actualReviewSec}
                    onChange={e => setFormData({ ...formData, actualReviewSec: Number(e.target.value) })}
                    className="farm-input"
                  />
                </label>

                <label className="farm-label">
                  <span>Ставка специалиста (₽/час):</span>
                  <input
                    required
                    type="number"
                    min={100}
                    value={formData.actualHourlyRate}
                    onChange={e => setFormData({ ...formData, actualHourlyRate: Number(e.target.value) })}
                    className="farm-input"
                  />
                </label>
              </div>

              <label className="farm-label">
                <span>Примечания и выводы наблюдателя:</span>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="farm-textarea"
                  placeholder="Особенности пилота, поведение операторов, выявленные краевые случаи..."
                />
              </label>

              <div className="confirm-modal-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary"
                >
                  Зафиксировать замер и пересчитать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
