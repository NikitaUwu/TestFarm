import http.client
import ipaddress
import socket
import ssl
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit


class ReadableHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.title = [], []
        self.hidden = 0
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'):
            self.hidden += 1
        if tag == 'title': self.in_title = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'): self.hidden = max(0, self.hidden-1)
        if tag == 'title': self.in_title = False

    def handle_data(self, data):
        data=data.replace('\x00','\ufffd')
        if self.in_title: self.title.append(data)
        if not self.hidden and data.strip(): self.parts.append(data.strip())


def public_target(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Допустимы только публичные HTTPS URL без credentials и нестандартных портов')
    addresses = sorted({r[4][0] for r in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)})
    if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
        raise ValueError('Приватные и служебные сетевые адреса запрещены')
    return parsed, addresses[0]


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, hostname, address):
        super().__init__(hostname, timeout=12, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), timeout=self.timeout)
        self.sock = self._context.wrap_socket(raw, server_hostname=self.host)


def fetch_source(url):
    source = {'url': url, 'accessed_at': datetime.now(timezone.utc).isoformat(), 'publication_date': None,
              'source_type': 'web_page', 'availability': 'unavailable', 'supports': [], 'text': ''}
    conn = None
    try:
        parsed, address = public_target(url)
        source['organization'] = parsed.hostname
        conn = PinnedHTTPS(parsed.hostname, address)
        path = parsed.path or '/'
        if parsed.query: path += '?' + parsed.query
        conn.request('GET', path, headers={'User-Agent': 'ProductFarm/0.1 research', 'Accept': 'text/html,text/plain'})
        response = conn.getresponse()
        source['http_status'] = response.status
        if response.status != 200:
            source['error'] = f'HTTP {response.status}; redirects require an explicit final URL'
            return source
        content_type = response.getheader('Content-Type', '')
        if not any(t in content_type for t in ('text/html', 'text/plain')):
            source['error'] = 'Тип источника не поддержан; используйте HTML или текст'
            return source
        body = response.read(1048577)
        if len(body) > 1048576:
            source['error'] = 'Превышен лимит источника 1 MiB'
            return source
        parser = ReadableHTML()
        parser.feed(body.decode('utf-8', errors='replace'))
        source.update(title=' '.join(parser.title)[:500] or parsed.hostname,
                      text=' '.join(parser.parts)[:16000], availability='available')
        return source
    except Exception as exc:
        source['error'] = type(exc).__name__
        return source
    finally:
        if conn: conn.close()


def assess(research, calculation, sources, thresholds, profile, policy, hard_blockers=()):
    available = [s for s in sources if s['availability'] == 'available']
    organizations = {s.get('organization') for s in available}
    factors = {'available_sources': len(available), 'independent_organizations': len(organizations),
               'primary_data': any(v.get('provenance') == 'measured' for v in calculation.get('variants', [])),
               'sample_size': max([v['sample_size'] for v in calculation.get('variants', [])] or [0]),
               'reproducible': bool(calculation.get('variants')), 'assumptions_count': len(research.get('assumptions', [])),
               'contradictions': research.get('objections', []), 'recency_verified': False}
    gaps = list(research.get('gaps', []))
    if len(available) < policy['minimum_sources']: gaps.append('Недостаточно доступных релевантных источников')
    if len(research.get('alternatives', [])) < policy['minimum_alternatives']: gaps.append('Не подтверждены три альтернативы')
    variants = calculation.get('variants', [])
    eligible = [v for v in variants if v.get('statistical') and v.get('quality') is not None]
    best = max(eligible, key=lambda v: v['statistical']['point_estimate'], default=None)
    checks = []
    def check(name, passed, reason): checks.append({'name': name, 'passed': bool(passed), 'reason': reason})
    check('Hard blockers', not hard_blockers, '; '.join(hard_blockers) or 'Явные стоп-факторы не заданы')
    sufficient = len(available) >= policy['minimum_sources'] and len(organizations) >= 3 and factors['primary_data'] and factors['sample_size'] >= policy['minimum_sample']
    check('Достаточность доказательств', sufficient, f"Источники {len(available)}, независимые организации {len(organizations)}, n={factors['sample_size']}")
    check('Критические пробелы', not gaps, '; '.join(gaps) or 'Не выявлены')
    observed_quality=best.get('decision_quality',best['quality']) if best else None
    observed_manual=best.get('decision_manual_review_rate',best['manual_review_rate']) if best else None
    quality_ok = best and observed_quality >= thresholds['minimum_quality'] and (1-observed_quality) <= thresholds['maximum_error'] and observed_manual <= thresholds['maximum_manual_review']
    check('Пороги качества', quality_ok, 'Качество, допустимая ошибка и ручная доработка сверены с заранее заданными порогами')
    effect_ok = best and best['statistical']['point_estimate'] >= thresholds['minimum_effect_seconds']
    check('Порог эффекта', effect_ok, 'Минимальный полезный эффект в sec/task')
    uncertainty_ok = best and best['statistical']['lower_bound'] >= thresholds['minimum_effect_seconds']
    check('Статистическая неопределённость', uncertainty_ok, 'Нижняя граница интервала должна достигать минимального полезного эффекта')
    # Scores are explicit rubric calculations, never LLM confidence percentages.
    scores = {'problem': min(5,len(research.get('personas', []))), 'market': min(5,len(research.get('alternatives', []))),
              'trends': 3 if research.get('trends') else 0, 'value': min(5,len(research.get('hypotheses', []))),
              'efficiency': 5 if uncertainty_ok and quality_ok else 2 if best else 0,
              'feasibility': 0 if hard_blockers else 2, 'decision': 5 if all(c['passed'] for c in checks) else 1}
    total = sum(scores[k]*w for k,w in profile['weights'].items())/100
    if hard_blockers: recommendation = 'Отклонить'
    elif not best or not factors['primary_data']: recommendation = 'Недостаточно данных'
    elif not sufficient or gaps: recommendation = 'Сначала проверить'
    elif not quality_ok or not effect_ok: recommendation = 'Отложить'
    elif not uncertainty_ok: recommendation = 'Сначала проверить'
    else: recommendation = 'Развивать'
    return {'recommendation': recommendation, 'checks': checks, 'hard_blockers': list(hard_blockers),
            'gaps': gaps, 'evidence_factors': factors, 'scores': scores, 'weighted_score': total,
            'score_limitations': 'Базовая рубрика оценивает полноту артефактов, а не подтверждённый спрос. Синтетические персоны не заменяют интервью.',
            'next_experiment': research.get('next_experiment', 'Собрать реальные наблюдения и проверить недостающие гипотезы'),
            'profile_version': profile, 'evidence_policy_version': policy, 'best_solution_id': best['solution_id'] if best else None}
