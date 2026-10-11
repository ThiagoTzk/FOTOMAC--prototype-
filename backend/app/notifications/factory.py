from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.notifications.outbox_sender import OutboxEmailSender
from app.notifications.port import EmailSender

SENDERS = {"outbox": OutboxEmailSender}


@lru_cache
def get_email_sender() -> EmailSender:
    name = get_settings().email_sender
    if name not in SENDERS:
        raise ValueError(f"Unknown e-mail sender '{name}'. Available: {', '.join(SENDERS)}")
    return SENDERS[name]()
