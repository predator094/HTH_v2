import hashlib
import bcrypt
from nanoid import generate as nanoid_generate

_SLUG_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
_SLUG_SIZE = 12
_TOKEN_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"  # unambiguous lowercase + digits
_TOKEN_SIZE = 12  # 31^12 ≈ 800 billion combinations


def generate_slug() -> str:
    return nanoid_generate(_SLUG_ALPHABET, _SLUG_SIZE)


def generate_delete_token() -> str:
    return nanoid_generate(_TOKEN_ALPHABET, _TOKEN_SIZE)


def hash_secret(value: str) -> str:
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()


def verify_secret(value: str, hashed: str) -> bool:
    return bcrypt.checkpw(value.encode(), hashed.encode())


def passcode_lookup_hash(value: str) -> str:
    """Fast SHA-256 hex digest used as a queryable index for passcode lookup.
    The bcrypt hash is still used for actual verification."""
    return hashlib.sha256(value.encode()).hexdigest()
