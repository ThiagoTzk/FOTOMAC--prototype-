"""E-mail PORT. Same ports & adapters idea as face recognition and storage.

The CESMAC mail server is not defined yet (requirements §2.4). Until it is, the "outbox"
adapter writes each message to backend/outbox/ so the flows can be tested end to end.
Plugging the real server = one SMTP adapter, nothing else changes.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    body: str


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None: ...
