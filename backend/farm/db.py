import os
from contextlib import contextmanager
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def uid() -> str:
    return str(uuid4())


@contextmanager
def connection():
    with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row, connect_timeout=5) as conn:
        yield conn


def audit(conn, actor, action, idea_id=None, **content):
    conn.execute('INSERT INTO audit_events(id,actor_id,idea_id,action,content) VALUES(%s,%s,%s,%s,%s)',
                 (uid(), actor, idea_id, action, Jsonb(content)))
