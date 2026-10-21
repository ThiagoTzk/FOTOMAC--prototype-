"""Identification of the hired photographer (requirements v2.0, RF031 notes 6 and 7).

CPF and birth date let the institution know for certain who answers for the photos a temporary
account sent. Only these are collected — the contract, kept by the institution, holds the rest
(LGPD Art. 6, III). Legal basis: execution of the contract the photographer is party to (Art. 7, V).

They are stored ENCRYPTED with pgcrypto. The key lives only in the settings (backend/.env), never in
the database, so a copy of the database alone does not reveal them. Screens show the CPF masked.
"""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.events.service import EventError


def _key() -> str:
    key = get_settings().identity_key
    if not key:
        raise EventError("A chave de criptografia dos dados do fotógrafo contratado não está configurada no servidor.")
    return key


def clean_cpf(value: str) -> str:
    """The 11 digits of a valid CPF (check digits verified), or EventError."""
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 11 or digits == digits[0] * 11:
        raise EventError("Informe um CPF válido.")
    for size in (9, 10):  # the two check digits
        total = sum(int(d) * w for d, w in zip(digits[:size], range(size + 1, 1, -1)))
        if (total * 10 % 11) % 10 != int(digits[size]):
            raise EventError("Informe um CPF válido.")
    return digits


def clean_birth_date(value: date | None) -> date:
    if value is None or value > date.today() or value.year < 1900:
        raise EventError("Informe uma data de nascimento válida.")
    return value


def encrypt(db: Session, plain: str) -> bytes:
    return db.scalar(select(func.pgp_sym_encrypt(plain, _key())))


def decrypt(db: Session, blob: bytes | None) -> str | None:
    if blob is None:
        return None
    return db.scalar(select(func.pgp_sym_decrypt(blob, _key())))


def masked_cpf(digits: str | None) -> str | None:
    """Only the last two digits on screen (RF031 note 7)."""
    return f"***.***.***-{digits[-2:]}" if digits else None
