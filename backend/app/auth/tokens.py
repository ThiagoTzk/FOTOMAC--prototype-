from __future__ import annotations

import hashlib
import secrets


def new_token() -> str:
    """256 random bits, URL-safe: impossible to guess, safe inside a link."""
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    # Plain SHA-256 is enough here (unlike passwords): the token already has 256 bits of
    # randomness, so there is nothing to brute-force.
    return hashlib.sha256(token.encode()).hexdigest()
