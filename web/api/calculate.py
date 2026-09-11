"""Internal deterministic calculation endpoint. Raw observations stay in Neon."""
import hashlib
import hmac
import json
import math
import os
from collections import defaultdict
from http.server import BaseHTTPRequestHandler
from uuid import UUID

import numpy as np
import psycopg
import scipy
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def calculate(rows, dataset, policy):
    effect = policy['effect']
    grouped = defaultdict(list)
    for row in rows:
        grouped[str(row['variant_id'])].append(row)
    result = {
        'provenance': 'CALCULATED', 'eligible': False, 'variants': [],
        'method': {'name': 'paired_bootstrap_by_task', 'resamples': effect['resamples'],
                   'seed': effect['seed'], 'confidence': effect['confidence'],
                   'numpy': np.__version__, 'scipy': scipy.__version__},
        'formulas': {'deltaSeconds': 'baselineSeconds - totalSeconds',
                     'totalSeconds': 'durationMs / 1000 + manualReviewSeconds + correctionSeconds',
                     'monthlySeconds': 'monthlyVolume * coverage * (baselineSeconds - machineSeconds - manualRework * baselineSeconds)'},
        'warnings': [], 'scenarios': {}, 'sensitivity': [],
    }
    for variant_id, observations in grouped.items():
        tasks = defaultdict(list)
        for observation in observations:
            tasks[observation['task_id']].append(observation['content'])
        machine = [o['content']['durationMs'] / 1000 for o in observations if number(o['content'].get('durationMs'))]
        pairs, known_quality = [], []
        for repeats in tasks.values():
            complete = all(
                number(r.get('durationMs')) and number(r.get('baselineSeconds'))
                and number(r.get('manualReviewSeconds')) and number(r.get('correctionSeconds'))
                and r.get('baselineProvenance') == 'MEASURED' and r.get('provenance') == 'MEASURED'
                for r in repeats)
            if complete:
                pairs.append((float(np.mean([r['baselineSeconds'] for r in repeats])),
                              float(np.mean([r['durationMs'] / 1000 + r['manualReviewSeconds'] + r['correctionSeconds'] for r in repeats]))))
            known_quality.extend(r['quality'] for r in repeats if r.get('qualityProvenance') == 'MEASURED' and r.get('quality') in (0, 1))
        entry = {'variantId': variant_id, 'attempts': len(observations), 'independentTasks': len(tasks),
                 'failures': sum(not o['content'].get('success', False) for o in observations),
                 'machineSeconds': float(np.mean(machine)) if machine else None,
                 'machineProvenance': 'MEASURED', 'pairedTasks': len(pairs),
                 'quality': float(np.mean(known_quality)) if known_quality else None,
                 'measuredEffect': None, 'eligible': False}
        if pairs:
            values = np.asarray(pairs)
            differences = values[:, 0] - values[:, 1]
            rng = np.random.default_rng(effect['seed'])
            means = differences[rng.integers(0, len(pairs), (effect['resamples'], len(pairs)))].mean(axis=1)
            alpha = (1 - effect['confidence']) / 2
            low, high = np.quantile(means, [alpha, 1 - alpha])
            entry['measuredEffect'] = {'deltaSeconds': float(differences.mean()), 'lowerBound': float(low), 'upperBound': float(high), 'sampleSize': len(pairs)}
            entry['eligible'] = bool(len(pairs) >= effect['minimumSample'] and low >= effect['minimumEffectSeconds']
                                     and entry['quality'] is not None and entry['quality'] >= effect['minimumQuality']
                                     and entry['failures'] == 0)
        else:
            result['warnings'].append('Нет полных пар измеренного baseline и полного времени для варианта ' + variant_id)
        result['variants'].append(entry)
    result['eligible'] = any(v['eligible'] for v in result['variants'])
    baseline_values = [c['baselineSeconds'] for c in dataset.get('cases', []) if number(c.get('baselineSeconds'))]
    volume = dataset.get('monthlyVolume')
    baseline = float(np.mean(baseline_values)) if baseline_values else None
    for name, scenario in effect['scenarios'].items():
        entries = []
        for variant in result['variants']:
            seconds = None
            if baseline is not None and number(volume) and variant['machineSeconds'] is not None:
                seconds = volume * scenario['volume'] * scenario['quality'] * (baseline - variant['machineSeconds'] - scenario['manualRework'] * baseline)
            entries.append({'variantId': variant['variantId'], 'monthlySeconds': seconds, 'provenance': 'ASSUMED',
                            'kind': 'POTENTIAL', 'parameters': scenario,
                            'limitations': ['Доля охвата и ручная доработка заданы сценарием; прогноз не является измеренным эффектом.']})
        result['scenarios'][name] = entries
    for dimension in ('volume', 'quality', 'manualRework'):
        for value in (0.5, 1, 1.5) if dimension == 'volume' else (0, 0.5, 1):
            params = dict(effect['scenarios']['base'], **{dimension: value})
            result['sensitivity'].append({'parameter': dimension, 'value': value, 'kind': 'POTENTIAL',
                'variants': [{'variantId': v['variantId'], 'monthlySeconds':
                    volume * params['volume'] * params['quality'] * (baseline - v['machineSeconds'] - params['manualRework'] * baseline)
                    if baseline is not None and number(volume) and v['machineSeconds'] is not None else None} for v in result['variants']]})
    if baseline is None or not number(volume):
        result['warnings'].append('Прогноз не вычислен без численного baseline и объёма: неизвестные значения не заменены нулями.')
    return result


class handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        secret = os.environ.get('INTERNAL_API_TOKEN', '')
        if not secret or not hmac.compare_digest(self.headers.get('X-Farm-Service', ''), secret):
            return self.reply(403, {'error': 'Forbidden'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024:
                return self.reply(413, {'error': 'Invalid request size'})
            payload = json.loads(self.rfile.read(length))
            calculation_id = str(UUID(payload['calculationRunId']))
        except (ValueError, KeyError, TypeError):
            return self.reply(400, {'error': 'calculationRunId required'})
        try:
            connection = os.environ.get('NEON_BASE') or os.environ.get('DATABASE_URL')
            with psycopg.connect(connection, row_factory=dict_row, connect_timeout=10) as conn:
                with conn.cursor() as cur:
                    cur.execute('SELECT c.*, r.config FROM farm_calculations c JOIN farm_research_runs r ON r.id=c.run_id WHERE c.id=%s FOR UPDATE OF c', (calculation_id,))
                    calculation = cur.fetchone()
                    if not calculation:
                        return self.reply(404, {'error': 'Calculation not found'})
                    if calculation['status'] == 'completed':
                        return self.reply(200, calculation['content'])
                    cur.execute('SELECT * FROM farm_trials WHERE run_id=%s ORDER BY variant_id, task_id, repetition', (calculation['run_id'],))
                    rows = cur.fetchall()
                    cur.execute('SELECT id, version, content FROM farm_datasets WHERE run_id=%s ORDER BY version DESC LIMIT 1', (calculation['run_id'],))
                    dataset = cur.fetchone()
                    output = calculate(rows, dataset['content'] if dataset else {}, calculation['config'])
                    output.update({'calculationRunId': calculation_id, 'researchRunId': str(calculation['run_id']),
                        'datasetVersionId': str(dataset['id']) if dataset else None,
                        'effectModelVersion': calculation['config']['effect']['version'],
                        'inputHash': hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()})
                    cur.execute("UPDATE farm_calculations SET status='completed', content=%s WHERE id=%s", (Jsonb(output), calculation_id))
            self.reply(200, output)
        except Exception:
            self.reply(503, {'error': 'Calculation storage unavailable'})

    def log_message(self, *_):
        pass
