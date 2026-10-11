"""Download links signed with HMAC, bound to the session that asked for them.

The key is the hash of the session token — a secret only the server holds, different for each
login / visit. So a link verifies ONLY inside the session that created it: copied to another
browser, it is worthless. The link also carries its expiry and the object it opens; changing
either one breaks the signature.
"""
from __future__ import annotations

import hashlib
import hmac
import time


def _signature(session_hash: str, subject: str, expires: int) -> str:
    return hmac.new(bytes.fromhex(session_hash), f"{subject}|{expires}".encode(), hashlib.sha256).hexdigest()


def sign(session_hash: str, subject: str, seconds: int, now: float | None = None) -> str:
    expires = int(now if now is not None else time.time()) + seconds
    return f"{expires}.{_signature(session_hash, subject, expires)}"


def verify(session_hash: str, subject: str, token: str | None) -> bool:
    try:
        expires_text, signature = (token or "").split(".", 1)
        expires = int(expires_text)
    except ValueError:
        return False
    return expires >= time.time() and hmac.compare_digest(signature, _signature(session_hash, subject, expires))
