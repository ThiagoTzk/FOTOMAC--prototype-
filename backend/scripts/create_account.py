"""Create an operator account from the terminal (RF001).

Needed once, for the FIRST administrator (someone has to exist to open the "Contas" screen);
every other account is created by the administrator in the web panel.

    .venv/bin/python scripts/create_account.py --name "Moacir Barbosa" \
        --email moacir@cesmac.edu.br --role photographer --signature "Moacir Barbosa"

The account is created in "Acesso Pendente", WITHOUT a password. An activation link is
"sent" — in development it lands in backend/outbox/ as a .eml file.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app import audit  # noqa: E402
from app.auth import service  # noqa: E402
from app.db.models import Account, AccountRole  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.notifications.factory import get_email_sender  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Cria uma conta de operação (Acesso Pendente).")
    p.add_argument("--name", required=True, help="nome completo (mínimo duas palavras)")
    p.add_argument("--email", required=True, help="e-mail institucional")
    p.add_argument("--role", required=True, choices=[r.value for r in AccountRole])
    p.add_argument("--signature", help="assinatura do fotógrafo (crédito nas fotos)")
    args = p.parse_args()

    if len(args.name.split()) < 2:
        print("O nome completo deve ter no mínimo duas palavras (RF001).")
        return 1
    if args.role == AccountRole.PHOTOGRAPHER.value and not args.signature:
        print("Conta de fotógrafo exige --signature (RF001 nota 4).")
        return 1

    db = sessionmaker(bind=get_engine())()
    account = Account(full_name=args.name.strip(), email=args.email.strip(), role=AccountRole(args.role),
                      photographer_signature=args.signature)
    db.add(account)
    try:
        db.flush()
    except IntegrityError:
        print("Já existe uma conta com este e-mail.")
        return 1
    audit.record(db, "account.created", None, "account", account.id, via="cli", role=args.role)
    service.send_activation_link(db, account, get_email_sender())
    print(f"Conta criada em 'Acesso Pendente': {account.full_name} <{account.email}>")
    print("Link de ativação enviado — em desenvolvimento, veja o arquivo .eml mais novo em backend/outbox/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
