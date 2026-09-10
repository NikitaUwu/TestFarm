import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from .db import connection, audit


def actor(request: Request):
    token = request.cookies.get('farm_session', '')
    with connection() as conn:
        row = conn.execute('SELECT p.* FROM sessions s JOIN principals p ON p.id=s.principal_id WHERE token_hash=%s AND expires_at>now()',
                           (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not row:
        raise HTTPException(401, 'Войдите в систему')
    return row


def mutation(request: Request, principal=Depends(actor)):
    if request.headers.get('x-farm-request') != '1':
        raise HTTPException(403, 'Отсутствует защита запроса')
    return principal


def login(request: Request, response: Response, role: str, password: str):
    if role not in ('owner', 'reviewer'):
        raise HTTPException(400, 'Неизвестная роль')
    if len(password) > 200:
        raise HTTPException(400, 'Слишком длинный пароль')
    peer = request.client.host if request.client else 'unknown'
    rate_key = hashlib.sha256((peer + role).encode()).hexdigest()
    with connection() as conn:
        rate = conn.execute("INSERT INTO login_attempts(key,count,window_start) VALUES(%s,1,now()) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.window_start<now()-interval '5 minutes' THEN 1 ELSE login_attempts.count+1 END, window_start=CASE WHEN login_attempts.window_start<now()-interval '5 minutes' THEN now() ELSE login_attempts.window_start END RETURNING count", (rate_key,)).fetchone()
    if rate['count'] > 10:
        raise HTTPException(429, 'Слишком много попыток. Повторите через 5 минут')
    expected = os.getenv(role.upper() + '_PASSWORD', '')
    if not expected or not hmac.compare_digest(password.encode(), expected.encode()):
        raise HTTPException(401, 'Неверный пароль')
    token = secrets.token_urlsafe(48)
    with connection() as conn:
        principal = conn.execute('SELECT * FROM principals WHERE role=%s', (role,)).fetchone()
        conn.execute('INSERT INTO sessions VALUES(%s,%s,%s)',
                     (hashlib.sha256(token.encode()).hexdigest(), principal['id'], datetime.now(timezone.utc) + timedelta(hours=12)))
        audit(conn, principal['id'], 'session.login')
    response.set_cookie('farm_session', token, httponly=True, samesite='strict', secure=os.getenv('COOKIE_SECURE') == '1', max_age=43200, path='/')
    return {'role': role, 'name': principal['name']}
