import os
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator
from .passwords import hash_password


class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=200, repr=False)

    @field_validator('identifier')
    @classmethod
    def normalize_identifier(cls, value):
        value = value.strip().lower()
        if not value:
            raise ValueError('Введите логин или почту')
        return value


class Registration(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=32)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=200, repr=False)

    @field_validator('username')
    @classmethod
    def normalize_username(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,31}', value):
            raise ValueError('Логин: 3–32 латинские буквы, цифры, точки, дефисы или подчёркивания; первый символ — буква или цифра')
        return value

    @field_validator('email')
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if (not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+", value)
                or len(value.split('@')[0]) > 64
                or value.startswith('.') or '..' in value or '.@' in value):
            raise ValueError('Введите корректный адрес почты')
        return value


def bootstrap_accounts(conn):
    """Import only the two original identities once, preserving all foreign keys."""
    for suffix, username, variable in [('1', 'admin', 'OWNER_PASSWORD'), ('2', 'demo', 'REVIEWER_PASSWORD')]:
        principal_id = '10000000-0000-0000-0000-00000000000' + suffix
        if conn.execute('SELECT 1 FROM accounts WHERE principal_id=%s', (principal_id,)).fetchone():
            continue
        password = os.getenv(variable, '')
        if password:
            conn.execute('INSERT INTO accounts(principal_id,username,password_hash) VALUES(%s,%s,%s)',
                         (principal_id, username, hash_password(password)))
