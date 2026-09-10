import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from psycopg.errors import UniqueViolation
from .accounts import Registration
from .db import connection, audit, uid
from .passwords import DUMMY_HASH, hash_password, verify_password


def public_account(principal):
    return {key: principal[key] for key in ('id', 'username', 'email')}


def actor(request: Request):
    token = request.cookies.get('farm_session', '')
    with connection() as conn:
        row = conn.execute('SELECT p.id,a.username,a.email FROM sessions s JOIN principals p ON p.id=s.principal_id JOIN accounts a ON a.principal_id=p.id WHERE token_hash=%s AND expires_at>now()',
                           (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not row:
        raise HTTPException(401, 'Войдите в систему')
    return row


def protected_request(request: Request):
    if request.headers.get('x-farm-request') != '1':
        raise HTTPException(403, 'Отсутствует защита запроса')


def mutation(request: Request, principal=Depends(actor)):
    protected_request(request)
    return principal


def rate_limit(request: Request, scope: str, limit: int, minutes: int, identifier=''):
    peer = request.client.host if request.client else 'unknown'
    rate_key = hashlib.sha256(f'{scope}:{peer}:{identifier}'.encode()).hexdigest()
    # Failed authentication must not roll back its attempt counter.
    with connection() as conn:
        rate = conn.execute("""INSERT INTO login_attempts(key,count,window_start) VALUES(%s,1,now())
            ON CONFLICT(key) DO UPDATE SET
            count=CASE WHEN login_attempts.window_start<now()-(%s * interval '1 minute') THEN 1 ELSE login_attempts.count+1 END,
            window_start=CASE WHEN login_attempts.window_start<now()-(%s * interval '1 minute') THEN now() ELSE login_attempts.window_start END
            RETURNING count""", (rate_key, minutes, minutes)).fetchone()
    if rate['count'] > limit:
        raise HTTPException(429, f'Слишком много попыток. Повторите через {minutes} мин.')


def start_session(conn, request, principal, action):
    old_token = request.cookies.get('farm_session', '')
    if old_token:
        conn.execute('DELETE FROM sessions WHERE token_hash=%s', (hashlib.sha256(old_token.encode()).hexdigest(),))
    token = secrets.token_urlsafe(48)
    conn.execute('INSERT INTO sessions VALUES(%s,%s,%s)',
                 (hashlib.sha256(token.encode()).hexdigest(), principal['id'], datetime.now(timezone.utc) + timedelta(hours=12)))
    audit(conn, principal['id'], action)
    return token


def set_session_cookie(response, token):
    response.set_cookie('farm_session', token, httponly=True, samesite='strict',
                        secure=os.getenv('COOKIE_SECURE') == '1', max_age=43200, path='/')


def login(request: Request, response: Response, identifier: str, password: str):
    protected_request(request)
    rate_limit(request, 'login-peer', 50, 5)
    rate_limit(request, 'login-account', 10, 5, identifier)
    with connection() as conn:
        principal = conn.execute('SELECT principal_id AS id,username,email,password_hash FROM accounts WHERE username=%s OR email=%s',
                                 (identifier, identifier)).fetchone()
    valid = verify_password(password, principal['password_hash'] if principal else DUMMY_HASH)
    if not principal or not valid:
        raise HTTPException(401, 'Неверный логин, почта или пароль')
    with connection() as conn:
        token = start_session(conn, request, principal, 'session.login')
    set_session_cookie(response, token)
    return public_account(principal)


def register(request: Request, response: Response, body: Registration):
    protected_request(request)
    rate_limit(request, 'register', 20, 60)
    # Reserve old accounts even when their bootstrap passwords are unconfigured.
    if body.username in ('admin', 'demo'):
        raise HTTPException(409, 'Логин или почта уже используются')
    encoded = hash_password(body.password)
    principal = {'id': uid(), 'username': body.username, 'email': body.email}
    try:
        with connection() as conn:
            conn.execute("INSERT INTO principals(id,role,name) VALUES(%s,'owner',%s)", (principal['id'], body.username))
            conn.execute('INSERT INTO accounts(principal_id,username,email,password_hash) VALUES(%s,%s,%s,%s)',
                         (principal['id'], body.username, body.email, encoded))
            token = start_session(conn, request, principal, 'account.register')
    except UniqueViolation:
        raise HTTPException(409, 'Логин или почта уже используются') from None
    set_session_cookie(response, token)
    return public_account(principal)
