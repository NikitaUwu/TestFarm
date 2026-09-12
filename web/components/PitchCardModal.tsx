'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './UI';
import { post } from '../lib/api';

export interface PitchCardModalProps {
  open: boolean;
  onClose: () => void;
  report: any;
  reportId?: string;
  ideaTitle?: string;
  viabilityScore: number;
}

export function PitchCardModal({
  open,
  onClose,
  report,
  reportId,
  ideaTitle,
  viabilityScore,
}: PitchCardModalProps) {
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const title = ideaTitle || report.summary?.slice(0, 60) || 'Продуктовая идея';
  const recommendation = report.assessment?.recommendation || 'Недостаточно данных';
  const summary = report.summary || 'Исследование и анализ гипотезы завершены.';
  const reasons = report.assessment?.reasons || [];
  const topReason = reasons[0] || 'Эффект подтверждён математической моделью.';

  const baseScenario = report.calculation?.scenarios?.base?.[0];
  const monthlyHours = baseScenario?.monthlySeconds != null ? (baseScenario.monthlySeconds / 3600).toFixed(1) : '—';
  const bestVariant = report.calculation?.variants?.[0];
  const deltaSec = bestVariant?.measuredEffect?.deltaSeconds != null ? bestVariant.measuredEffect.deltaSeconds.toFixed(1) : '—';
  const sourcesCount = report.sources?.length || 0;

  const isDevelop = recommendation === 'Развивать';
  const isStop = recommendation === 'Остановить';
  const statusColor = isDevelop ? '#10b981' : isStop ? '#ef4444' : '#f59e0b';
  const statusLabel = isDevelop ? 'Высокий потенциал' : isStop ? 'Критический риск' : 'Умеренный риск';

  // Получаем ссылку на публичный отчет при открытии
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    const fetchShare = async () => {
      try {
        const id = reportId || report.id;
        if (id) {
          const res = await post('/reports/' + id + '/share');
          if (isMounted) setShareUrl(window.location.origin + res.path);
        } else {
          if (isMounted) setShareUrl(window.location.href);
        }
      } catch {
        if (isMounted) setShareUrl(window.location.href);
      }
    };
    fetchShare();
    return () => { isMounted = false; };
  }, [open, reportId, report]);

  if (!open) return null;

  // Форматированный сниппет для Telegram/Slack
  const handleCopyChatText = async () => {
    const verdictEmoji = isDevelop ? '🚀' : isStop ? '🛑' : '⚖️';
    const textSnippet = [
      `${verdictEmoji} *Продуктовая ферма* | Вердикт: *${recommendation.toUpperCase()}* (${viabilityScore}/100)`,
      `💡 Идея: *«${title}»*`,
      ``,
      `⏱ *Экономия времени:* ${monthlyHours} ч/мес (базовый сценарий)`,
      `⚡ *Разница на операцию:* ${deltaSec} сек`,
      `🔍 *Доказательная база:* ${sourcesCount} подтверждений`,
      ``,
      `📌 *Резюме:* ${summary}`,
      `🎯 *Ключевой фактор:* ${topReason}`,
      ``,
      `🔗 *Интерактивный отчёт и MVP:* ${shareUrl || window.location.href}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(textSnippet);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 3000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      // Fallback
    }
  };

  // Экспорт PNG через чистый HTML5 Canvas
  const handleExportPng = () => {
    setIsExporting(true);
    const canvas = document.createElement('canvas');
    const width = 840;
    const height = 480;
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsExporting(false);
      return;
    }

    ctx.scale(2, 2);

    // 1. Фон с градиентом
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#131822');
    bgGrad.addColorStop(1, '#1e2638');
    ctx.fillStyle = bgGrad;
    ctx.roundRect(0, 0, width, height, 20);
    ctx.fill();

    // 2. Декоративное свечение
    const glow = ctx.createRadialGradient(width - 120, 100, 10, width - 120, 100, 260);
    glow.addColorStop(0, 'rgba(245, 214, 92, 0.18)');
    glow.addColorStop(1, 'rgba(245, 214, 92, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(width - 120, 100, 260, 0, Math.PI * 2);
    ctx.fill();

    // 3. Золотистый акцентный бордюр
    ctx.strokeStyle = 'rgba(245, 214, 92, 0.35)';
    ctx.lineWidth = 2;
    ctx.roundRect(1, 1, width - 2, height - 2, 20);
    ctx.stroke();

    // 4. Шапка карточки: Бренд и логотип
    ctx.fillStyle = '#F5D65C';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('🌱 ПРОДУКТОВАЯ ФЕРМА', 40, 48);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('ЭКСПРЕСС-АНАЛИЗ И ВАЛИДАЦИЯ ГИПОТЕЗЫ', 230, 48);

    // 5. Viability Score бейдж (справа вверху)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.roundRect(width - 230, 30, 190, 44, 22);
    ctx.fill();
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 1.5;
    ctx.roundRect(width - 230, 30, 190, 44, 22);
    ctx.stroke();

    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(width - 208, 52, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${viabilityScore}/100`, width - 192, 58);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(statusLabel, width - 128, 57);

    // 6. Вердикт плашка
    const verdictBg = isDevelop ? 'rgba(16, 185, 129, 0.2)' : isStop ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)';
    ctx.fillStyle = verdictBg;
    ctx.roundRect(40, 78, 170, 30, 15);
    ctx.fill();
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 1;
    ctx.roundRect(40, 78, 170, 30, 15);
    ctx.stroke();

    ctx.fillStyle = statusColor;
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`ВЕРДИКТ: ${recommendation.toUpperCase()}`, 52, 98);

    // 7. Название идеи
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const displayTitle = title.length > 55 ? title.slice(0, 52) + '…' : title;
    ctx.fillText(displayTitle, 40, 145);

    // 8. Суть идеи (2 строки)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    const displaySummary = summary.length > 120 ? summary.slice(0, 118) + '…' : summary;
    ctx.fillText(displaySummary, 40, 176);

    // 9. Три метрических бокса
    const boxWidth = 240;
    const boxHeight = 90;
    const boxY = 210;

    const metrics = [
      { label: 'ЭКОНОМИЯ ВРЕМЕНИ', val: monthlyHours !== '—' ? `${monthlyHours} ч/мес` : 'Требует данных', sub: 'Базовый сценарий' },
      { label: 'РАЗНИЦА НА ОПЕРАЦИЮ', val: deltaSec !== '—' ? `${deltaSec} сек` : '—', sub: 'Чистая скорость' },
      { label: 'ИСТОЧНИКИ ДАННЫХ', val: `${sourcesCount} источников`, sub: report.calculation?.eligible ? 'Бутстрап валиден' : 'Ограниченно' },
    ];

    metrics.forEach((m, idx) => {
      const bx = 40 + idx * (boxWidth + 20);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.roundRect(bx, boxY, boxWidth, boxHeight, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.roundRect(bx, boxY, boxWidth, boxHeight, 12);
      ctx.stroke();

      ctx.fillStyle = '#F5D65C';
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(m.label, bx + 16, boxY + 28);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(m.val, bx + 16, boxY + 56);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(m.sub, bx + 16, boxY + 76);
    });

    // 10. Ключевой аргумент / фактор
    ctx.fillStyle = 'rgba(245, 214, 92, 0.08)';
    ctx.roundRect(40, 320, width - 80, 64, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 214, 92, 0.25)';
    ctx.lineWidth = 1;
    ctx.roundRect(40, 320, width - 80, 64, 10);
    ctx.stroke();

    ctx.fillStyle = '#F5D65C';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('КЛЮЧЕВОЙ АРГУМЕНТ ИССЛЕДОВАНИЯ:', 56, 344);

    ctx.fillStyle = '#ffffff';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
    const displayReason = topReason.length > 95 ? topReason.slice(0, 92) + '…' : topReason;
    ctx.fillText(displayReason, 56, 368);

    // 11. Подвал
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Проверено автономной системой • ${shareUrl || 'web-mauve-phi-22.vercel.app'}`, 40, 424);

    // Скачивание
    canvas.toBlob((blob) => {
      setIsExporting(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pitch-card-${(title || 'idea').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').slice(0, 30)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="pitch-modal-backdrop" onClick={onClose}>
      <div className="pitch-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="pitch-modal-header">
          <div className="pitch-modal-title-box">
            <div className="pitch-modal-icon">
              <Icon name="share" size={20} />
            </div>
            <div>
              <h3>Pitch Card идеи</h3>
              <p>Готовая карточка-тизер для команды, стейкхолдеров и чатов</p>
            </div>
          </div>
          <button type="button" className="auth-card-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Интерактивное превью карточки */}
        <div className="pitch-card-preview">
          <div className="pitch-preview-top">
            <span className="pitch-brand-badge">🌱 ПРОДУКТОВАЯ ФЕРМА</span>
            <div className="pitch-score-badge" style={{ borderColor: statusColor }}>
              <span className="pitch-score-dot" style={{ background: statusColor }} />
              <strong>{viabilityScore}/100</strong>
              <span>{statusLabel}</span>
            </div>
          </div>

          <div className="pitch-verdict-pill" style={{ borderColor: statusColor, color: statusColor }}>
            ВЕРДИКТ: {recommendation.toUpperCase()}
          </div>

          <h2 className="pitch-preview-title">{title}</h2>
          <p className="pitch-preview-summary">{summary}</p>

          <div className="pitch-metrics-row">
            <div className="pitch-metric-item">
              <span className="pitch-metric-label">ЭКОНОМИЯ</span>
              <strong className="pitch-metric-val">{monthlyHours !== '—' ? `${monthlyHours} ч/мес` : '—'}</strong>
              <span className="pitch-metric-sub">Базовый сценарий</span>
            </div>
            <div className="pitch-metric-item">
              <span className="pitch-metric-label">РАЗНИЦА / ОП</span>
              <strong className="pitch-metric-val">{deltaSec !== '—' ? `${deltaSec} сек` : '—'}</strong>
              <span className="pitch-metric-sub">На одну задачу</span>
            </div>
            <div className="pitch-metric-item">
              <span className="pitch-metric-label">ИСТОЧНИКИ</span>
              <strong className="pitch-metric-val">{sourcesCount} факт.</strong>
              <span className="pitch-metric-sub">Открытые данные</span>
            </div>
          </div>

          <div className="pitch-reason-box">
            <span className="pitch-reason-tag">КЛЮЧЕВОЙ ФАКТОР:</span>
            <p>{topReason}</p>
          </div>

          <div className="pitch-preview-footer">
            <span>Проверено на Продуктовой ферме</span>
            <span className="pitch-preview-url">{shareUrl ? new URL(shareUrl).hostname : 'ферма.ai'}</span>
          </div>
        </div>

        {/* Панель действий */}
        <div className="pitch-modal-actions">
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={handleCopyChatText}
          >
            <Icon name={copiedText ? 'checkCircle' : 'copy'} size={16} />
            <span>{copiedText ? 'Текст скопирован!' : 'Скопировать для Telegram / Slack'}</span>
          </button>

          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={handleExportPng}
            disabled={isExporting}
          >
            <Icon name="download" size={16} />
            <span>{isExporting ? 'Генерация…' : 'Скачать картинку (PNG)'}</span>
          </button>

          <button
            type="button"
            className="ui-btn ui-btn-subtle"
            onClick={handleCopyLink}
          >
            <Icon name={copiedLink ? 'checkCircle' : 'share'} size={16} />
            <span>{copiedLink ? 'Ссылка скопирована' : 'Веб-ссылка'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
