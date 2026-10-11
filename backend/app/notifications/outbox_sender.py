"""Development adapter: each e-mail becomes a .eml file in backend/outbox/.

The folder is git-ignored: the messages contain e-mail addresses (personal data) and
single-use links. Never use this adapter in production.
"""
from __future__ import annotations

from datetime import datetime
from email.message import EmailMessage as MimeMessage
from pathlib import Path

from app.config import BACKEND_DIR
from app.notifications.port import EmailMessage

OUTBOX_DIR = BACKEND_DIR / "outbox"


class OutboxEmailSender:
    def __init__(self, directory: Path = OUTBOX_DIR):
        self.directory = directory

    def send(self, message: EmailMessage) -> Path:
        self.directory.mkdir(exist_ok=True)
        mime = MimeMessage()
        mime["From"] = "FOTOMAC <nao-responda@cesmac.edu.br>"
        mime["To"] = message.to
        mime["Subject"] = message.subject
        # 8bit = plain readable text: whoever opens the .eml can copy the link as is
        # (the default quoted-printable would turn "token=" into "token=3D").
        mime.set_content(message.body, cte="8bit")
        # Local time in the file name: the person looking for the newest e-mail reads their own clock.
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        path = self.directory / f"{stamp}.eml"
        path.write_bytes(bytes(mime))
        path.chmod(0o600)
        return path
