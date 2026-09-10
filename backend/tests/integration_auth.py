"""Real PostgreSQL + HTTP auth regression, isolated disposable DB, no provider calls."""
import hashlib
import os
import secrets
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from fastapi.testclient import TestClient

from farm.api import app
from farm.db import connection
from farm.migrate import migrate


def check_auth():
    # Simulate an installation before accounts existed, with an idea and session.
    with connection() as conn:
        conn.execute('CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
        for file in sorted((Path(__file__).parent.parent / 'migrations').glob('*.sql')):
            if file.name.startswith('008_'):
                break
            conn.execute(file.read_text(encoding='utf-8'))
            conn.execute('INSERT INTO schema_migrations(name) VALUES(%s)', (file.name,))
        owner_id = '10000000-0000-0000-0000-000000000001'
        idea_id = str(uuid4())
        conn.execute("INSERT INTO ideas(id,owner_id,title) VALUES(%s,%s,'Preserved')", (idea_id,owner_id))
        conn.execute("INSERT INTO idea_versions(id,idea_id,version,content) VALUES(%s,%s,1,'{}')", (str(uuid4()),idea_id))
        conn.execute("INSERT INTO sessions VALUES(%s,%s,now()+interval '1 hour')", (hashlib.sha256(b'legacy-session').hexdigest(),owner_id))
    migrate()
    with connection() as conn:
        before = conn.execute('SELECT * FROM accounts ORDER BY username').fetchall()
    migrate()
    with connection() as conn:
        assert before == conn.execute('SELECT * FROM accounts ORDER BY username').fetchall()
    headers = {'X-Farm-Request':'1'}
    password = secrets.token_urlsafe(24)
    payload = {'username':'User.One','email':'One@Example.com','password':password}
    with TestClient(app, headers=headers) as first, TestClient(app, headers=headers) as second:
        first.cookies.set('farm_session','legacy-session')
        assert first.get('/auth/me').json()['username'] == 'admin'
        assert first.get('/ideas/'+idea_id).status_code == 200
        for identifier, variable in [('admin','OWNER_PASSWORD'), ('demo','REVIEWER_PASSWORD')]:
            result = first.post('/auth/login',json={'identifier':identifier,'password':os.environ[variable]})
            assert result.status_code == 200
            assert set(result.json()) == {'id','username','email'}
        result = first.post('/auth/register', json=payload)
        assert result.status_code == 201
        user_id = result.json()['id']
        assert result.json()['username'] == 'user.one'
        assert 'HttpOnly' in result.headers['set-cookie'] and 'SameSite=strict' in result.headers['set-cookie']
        assert first.get('/ideas').json() == []
        assert first.get('/ideas/'+idea_id).status_code == 404
        created = first.post('/ideas',json={'title':'Private fixture','transcript':'Private fixture'})
        assert created.status_code == 201
        private_id = created.json()['id']
        for changed in ({'username':'USER.ONE','email':'two@example.com'}, {'username':'other','email':'ONE@EXAMPLE.COM'}):
            assert second.post('/auth/register',json=payload|changed).status_code == 409
        assert second.post('/auth/register',json=payload|{'username':'user.two','email':'two@example.com'}).status_code == 201
        assert second.get('/ideas/'+private_id).status_code == 404
        assert second.put('/ideas/'+private_id,json={'title':'Attack','transcript':'Attack','expected_version':1}).status_code == 404
        assert first.get('/ideas/'+private_id).json()['title'] == 'Private fixture'
        assert first.post('/auth/logout').status_code == 200
        assert first.get('/auth/me').status_code == 401
        for identifier in ('USER.ONE', ' ONE@EXAMPLE.COM '):
            assert first.post('/auth/login',json={'identifier':identifier,'password':password}).status_code == 200
            assert first.get('/auth/me').json()['id'] == user_id
        wrong = first.post('/auth/login',json={'identifier':'user.one','password':'wrong'})
        unknown = first.post('/auth/login',json={'identifier':'unknown','password':'wrong'})
        assert wrong.status_code == unknown.status_code == 401 and wrong.json() == unknown.json()
        assert first.post('/auth/login',json={'role':'owner','password':password}).status_code == 422
        assert first.post('/auth/register',json=payload|{'role':'owner'}).status_code == 422
        assert first.post('/auth/login',json={'identifier':'user.one','password':password},headers={'X-Farm-Request':'0'}).status_code == 403
        for _ in range(10):
            assert first.post('/auth/login',json={'identifier':'rate-fixture','password':'wrong'}).status_code == 401
        assert first.post('/auth/login',json={'identifier':'rate-fixture','password':'wrong'}).status_code == 429
    with connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM principals').fetchone()['n'] == 4
        encoded = conn.execute('SELECT password_hash FROM accounts WHERE principal_id=%s',(user_id,)).fetchone()['password_hash']
        assert encoded.startswith('scrypt-v1$') and password not in encoded
        assert password not in str(conn.execute('SELECT content FROM audit_events').fetchall())
    print('PASS: migration/idempotence, legacy data/session/login, registration, username/email login, duplicates, ownership, logout, CSRF, role rejection, rate limit, hashed storage; no provider calls')


if __name__ == '__main__':
    original_dsn = os.environ['DATABASE_URL']
    database = 'farm_auth_test_' + uuid4().hex
    with psycopg.connect(original_dsn, autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
        try:
            os.environ['DATABASE_URL'] = make_conninfo(original_dsn, dbname=database)
            check_auth()
        finally:
            os.environ['DATABASE_URL'] = original_dsn
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(database)))
