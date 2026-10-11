"""Password hashing and complexity rules (RF001 note 5, RF002 notes 2-3)."""
from __future__ import annotations

import re

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# Argon2id with the library's defaults (OWASP-recommended). The hash embeds its own salt
# and parameters, so they can be raised later without breaking existing passwords.
_hasher = PasswordHasher()

# The same three rules the Figma screens show under "Sua senha deve conter".
PASSWORD_RULES: list[tuple[str, str]] = [
    ("min_length", "No mínimo 8 caracteres"),
    ("upper_lower", "Uma letra maiúscula e uma minúscula"),
    ("digit_special", "Um número e um caractere especial"),
]


def failed_rules(password: str) -> list[str]:
    """Return the keys of the rules the password does NOT meet (empty list = valid)."""
    failed = []
    if len(password) < 8:
        failed.append("min_length")
    if not (re.search(r"[a-zà-ÿ]", password) and re.search(r"[A-ZÀ-Ý]", password)):
        failed.append("upper_lower")
    if not (re.search(r"\d", password) and re.search(r"[^\w\s]|_", password)):
        failed.append("digit_special")
    return failed


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Compare by hash only — the original password can never be recovered (RF002 note 2)."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# Used when the e-mail does not exist, so the response time does not reveal which
# accounts exist (RF002 note 1: no account enumeration).
DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-real-password")
