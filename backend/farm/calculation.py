"""Versioned effect model. Every number is derived from observations or explicit assumptions."""
from collections import defaultdict
import numpy as np


def paired_bootstrap(baseline, variant, confidence=.95, resamples=10000, seed=42):
    a, b = np.asarray(baseline, dtype=float), np.asarray(variant, dtype=float)
    if a.shape != b.shape or a.ndim != 1 or len(a) < 2:
        raise ValueError('Нужно минимум два сопоставимых наблюдения')
    if not np.isfinite(a).all() or not np.isfinite(b).all() or (a < 0).any() or (b < 0).any():
        raise ValueError('Времена должны быть конечными неотрицательными числами')
    if not 0 < confidence < 1 or not 100 <= resamples <= 100000:
        raise ValueError('Некорректные параметры bootstrap')
    delta = a - b
    rng = np.random.default_rng(seed)
    values = np.concatenate([rng.choice(delta, size=(min(1000, resamples-i), len(delta)), replace=True).mean(axis=1)
                             for i in range(0, resamples, 1000)])
    alpha = (1-confidence)/2
    return {'method': 'paired_bootstrap', 'sample_size': len(a), 'confidence_level': confidence,
            'resamples': resamples, 'seed': seed, 'point_estimate': float(delta.mean()),
            'lower_bound': float(np.quantile(values, alpha)), 'upper_bound': float(np.quantile(values, 1-alpha)),
            'unit': 'sec/task', 'assumptions': ['Сопоставленные задачи независимы; повторы усреднены внутри задачи'],
            'limitations': ['Малая выборка: интервал нестабилен'] if len(a) < 10 else [],
            'library_version': 'numpy ' + np.__version__}


def total_time(parts, parallel_groups=()):
    """Each duration includes its explicitly modeled conditional probability."""
    times = {}
    for name, value in parts.items():
        duration, probability = (value, 1.) if isinstance(value, (int, float)) else (value['seconds'], value['probability'])
        if not np.isfinite(duration) or duration < 0 or not 0 <= probability <= 1:
            raise ValueError('Некорректная длительность/вероятность')
        times[name] = duration * probability
    used = set()
    total = 0.
    for group in parallel_groups:
        if not group or any(name in used or name not in times for name in group):
            raise ValueError('Некорректная параллельная группа')
        used.update(group)
        total += max(times[name] for name in group)
    return total + sum(value for name, value in times.items() if name not in used)


def potential(base_seconds, ai_seconds, volume, quality, coverage, manual_rate, review_seconds, correction_seconds):
    if min(base_seconds, ai_seconds, volume, review_seconds, correction_seconds) < 0:
        raise ValueError('Параметры не могут быть отрицательными')
    if any(not 0 <= p <= 1 for p in [quality, coverage, manual_rate]):
        raise ValueError('Доли должны находиться между 0 и 1')
    intervention = ai_seconds + manual_rate * review_seconds + (1-quality) * correction_seconds
    return {'monthly_hours': volume * coverage * (base_seconds-intervention) / 3600,
            'effective_seconds_per_task': coverage*intervention+(1-coverage)*base_seconds,
            'provenance': 'modeled', 'unit': 'hours/month'}


def calculate(dataset, observations, model, assumptions=None):
    assumptions = assumptions or {}
    rows = {r['task_id']: r for r in dataset['rows']}
    groups = defaultdict(list)
    for observation in observations:
        groups[observation['solution_id']].append(observation)
    outputs = []
    for solution, data in groups.items():
        sessions=[m for m in assumptions.get('process_measurements',[]) if m.get('solution_id') in (None,solution)]
        def observed(task,phase):
            values=[m['seconds'] for m in sessions if m['task_id']==task and m['phase']==phase and m['provenance']=='measured']
            return float(np.mean(values)) if values else None
        tasks = defaultdict(list)
        for observation in data:
            tasks[observation['task_id']].append(observation)
        before, after, raw_after, ai_durations, qualities, manual_rates = [], [], [], [], [], []
        failures = 0
        for task_id, repeats in tasks.items():
            row = rows[task_id]
            qualities.extend([float(o.get('success', False) and o.get('label') == row['expected_label']) for o in repeats])
            manual_rates.extend([float(o.get('needs_review', True)) for o in repeats])
            failures += sum(not o.get('success', False) for o in repeats)
            baseline=observed(task_id,'baseline')
            if baseline is None:baseline=row['baseline_seconds']
            if baseline is None:
                continue
            times = []
            for o in repeats:
                raw = o['duration_ms']/1000
                review_time=observed(task_id,'manual_review')
                correction_time=observed(task_id,'error_correction')
                review = (review_time if review_time is not None else row['manual_review_seconds']) if o.get('needs_review', True) else 0
                correction = (correction_time if correction_time is not None else row['error_correction_seconds']) if not o.get('success') or o.get('label') != row['expected_label'] else 0
                extra=sum(observed(task_id,phase) or 0 for phase in ('input','postprocessing','overhead'))
                times.append(raw + review + correction + extra)
                ai_durations.append(raw)
            before.append(baseline)
            after.append(float(np.mean(times)))
            raw_after.append(float(np.mean([o['duration_ms']/1000 for o in repeats])))
        interval = paired_bootstrap(before, after, model['confidence_level'], model['resamples'], model['seed']) if len(before) >= 2 else None
        raw_interval = paired_bootstrap(before, raw_after, model['confidence_level'], model['resamples'], model['seed']) if len(before) >= 2 else None
        quality = float(np.mean(qualities)) if qualities else None
        manual = float(np.mean(manual_rates)) if manual_rates else None
        baseline_quality = [float(r['baseline_correct']) for r in rows.values() if r.get('baseline_correct') is not None]
        result = {'solution_id': solution, 'statistical': interval, 'measured_chain_effect':raw_interval,
                  'baseline_mean_seconds': float(np.mean(before)) if before else None,
                  'variant_mean_seconds': float(np.mean(after)) if after else None,
                  'measured_chain_mean_seconds':float(np.mean(raw_after)) if raw_after else None,
                  'quality': quality, 'baseline_quality': float(np.mean(baseline_quality)) if baseline_quality else None,
                  'manual_review_rate': manual, 'failed_observations': failures, 'observation_count': len(data),
                  'sample_size': len(before), 'missing_baseline': len(rows)-len(before),
                  'missing_fraction': (len(rows)-len(before))/len(rows),
                  'provenance': dataset['provenance'], 'unit': 'sec/task',
                  'limitations': ['Человеческая проверка и исправление учтены по значениям dataset; это модельная добавка к замеренной длительности цепочки'],
                  'scenarios': {}, 'sensitivity': []}
        result['decision_quality']=assumptions.get('quality',quality)
        result['decision_manual_review_rate']=assumptions.get('manual_review_rate',manual)
        result['decision_metric_sources']={'quality':'business_observation' if 'quality' in assumptions else 'experiment',
                                          'manual_review_rate':'business_observation' if 'manual_review_rate' in assumptions else 'experiment'}
        result['full_time_provenance']='modeled_with_measured_chain'
        result['process_measurements']=sessions
        result['process_measurement_coverage']={phase:sum(observed(t,phase) is not None for t in tasks) for phase in ('baseline','input','manual_review','error_correction','postprocessing','overhead')}
        result['limitations'].append('Незамеренные ручные этапы остаются допущениями; отсутствие замера не доказывает нулевые накладные расходы')
        if before and ai_durations and quality is not None:
            volume = assumptions.get('monthly_volume', model['monthly_volume'])
            q = assumptions.get('quality', quality)
            m = assumptions.get('manual_review_rate', manual)
            base = float(np.mean(before)); ai = float(np.mean(raw_after))
            matched=[t for t in tasks if observed(t,'baseline') is not None or rows[t]['baseline_seconds'] is not None]
            def phase_mean(phase, fallback=None):
                return float(np.mean([observed(t,phase) if observed(t,phase) is not None else rows[t][fallback] if fallback else 0 for t in matched]))
            extra=sum(phase_mean(p) for p in ('input','postprocessing','overhead'))
            ai+=extra
            review = phase_mean('manual_review','manual_review_seconds')
            correction = phase_mean('error_correction','error_correction_seconds')
            for name, v, qual, man in [('adverse', volume*.5, max(0, q-.1), min(1, m+.2)), ('base', volume, q, m), ('favorable', volume*1.5, min(1, q+.05), max(0, m-.1))]:
                params = {'volume': v, 'quality': qual, 'manual_rate': man, 'coverage': model['coverage'],
                          'chain_and_extra_seconds':ai,'review_seconds':review,'correction_seconds':correction,
                          'extra_seconds':extra,'baseline_seconds':base}
                result['scenarios'][name] = {**potential(base, ai, v, qual, model['coverage'], man, review, correction),
                    'parameters': params, 'assumptions': ['Объём за месяц и покрытие — допущения до подтверждения бизнес-наблюдениями']}
            for axis, values in [('volume', [volume*.5, volume, volume*1.5]), ('quality', [max(0,q-.1), q,min(1,q+.05)]), ('manual_rate',[max(0,m-.1),m,min(1,m+.2)])]:
                for value in values:
                    params = {'volume': volume, 'quality': q, 'manual_rate': m}
                    params[axis] = value
                    result['sensitivity'].append({'parameter': axis, 'value': value, **potential(base, ai, coverage=model['coverage'], review_seconds=review, correction_seconds=correction, **params)})
        outputs.append(result)
    return {'effect_model_version': model, 'variants': outputs,
            'formula': 'delta_seconds = mean(baseline_task_seconds - variant_task_seconds); positive = improvement',
            'measured': 'Время реальной цепочки из Runner, качество по expected_label',
            'modeled': 'Ручная доработка, сценарии внедрения и месячный потенциал',
            'dataset_source': dataset['source'], 'period': dataset['period'], 'assumptions': assumptions}
