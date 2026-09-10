"""Versioned, salted password hashes. No plaintext credentials are persisted."""
import hashlib
import hmac
import secrets


def _derive(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode('utf-8'), salt=salt, n=32768, r=8, p=3,
                          maxmem=64 * 1024 * 1024, dklen=32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f'scrypt-v1${salt.hex()}${_derive(password, salt).hex()}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        version, salt_hex, digest_hex = encoded.split('$')
        salt, digest = bytes.fromhex(salt_hex), bytes.fromhex(digest_hex)
        if version != 'scrypt-v1' or len(salt) != 16 or len(digest) != 32:
            return False
        return hmac.compare_digest(_derive(password, salt), digest)
    except (ValueError, TypeError):
        return False


# Unknown accounts still pay the same password verification cost.
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))
