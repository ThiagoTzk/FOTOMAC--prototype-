"""DEVELOPMENT ONLY: delete every account except one (and optionally make it administrator).

    .venv/bin/python scripts/dev_keep_only_account.py --keep voce@cesmac.edu.br --admin          # shows
    .venv/bin/python scripts/dev_keep_only_account.py --keep voce@cesmac.edu.br --admin --apply  # does

The system itself NEVER deletes accounts (RF003 note 4) and the audit log is append-only
(RF024) — this script exists only to clean test data from a local database. It refuses any
database that is not on this machine, and refuses if an account to be deleted still owns
events or photos (those would have to be handled first).

To delete the accounts it must also delete their audit entries, which means switching the
append-only trigger off for a moment, inside ONE transaction: if anything fails, nothing changes.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app import audit  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.models import Account, AccountRole, Event, Image  # noqa: E402
from app.db.session import get_engine  # noqa: E402


def local_database_only() -> bool:
    host = urlparse(get_settings().database_url.replace("+psycopg", "")).hostname
    if host not in ("localhost", "127.0.0.1", None):
        print(f"Recusado: o banco não está nesta máquina ({host}). Este script é só para desenvolvimento.")
        return False
    return True


def delete_accounts(db, ids: list) -> None:
    """Accounts + their sessions + their audit entries, in the caller's transaction."""
    sids = [str(i) for i in ids]
    db.execute(text("ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_no_update_delete"))
    db.execute(text("DELETE FROM audit_log WHERE actor_account_id = ANY(:ids) "
                    "OR (target_type = 'account' AND target_id = ANY(:sids))"), {"ids": ids, "sids": sids})
    db.execute(text("DELETE FROM sessions WHERE account_id = ANY(:ids)"), {"ids": ids})
    db.execute(text("UPDATE system_parameters SET updated_by = NULL WHERE updated_by = ANY(:ids)"), {"ids": ids})
    db.execute(text("DELETE FROM reindex_jobs WHERE requested_by = ANY(:ids)"), {"ids": ids})
    db.execute(text("DELETE FROM accounts WHERE id = ANY(:ids)"), {"ids": ids})  # tokens go by cascade
    db.execute(text("ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_no_update_delete"))


def main() -> int:
    p = argparse.ArgumentParser(description="Desenvolvimento: apaga todas as contas menos uma.")
    p.add_argument("--keep", required=True, help="e-mail da conta que fica")
    p.add_argument("--admin", action="store_true", help="torna a conta que fica administradora")
    p.add_argument("--apply", action="store_true", help="sem isto, só mostra o que seria feito")
    args = p.parse_args()

    if not local_database_only():
        return 1

    db = sessionmaker(bind=get_engine())()
    keep = db.scalar(select(Account).where(func.lower(Account.email) == args.keep.strip().lower()))
    if keep is None:
        print("Conta a manter não encontrada.")
        return 1
    others = db.scalars(select(Account).where(Account.id != keep.id).order_by(Account.email)).all()
    ids = [a.id for a in others]
    busy = db.scalar(select(func.count()).select_from(Event).where(Event.owner_id.in_(ids))) or 0
    busy += db.scalar(select(func.count()).select_from(Image).where(Image.uploaded_by.in_(ids))) or 0
    if busy:
        print("Recusado: há eventos ou fotos dessas contas. Rode scripts/cleanup_e2e.py --apply antes.")
        return 1
    str_ids = [str(i) for i in ids]
    audit_rows = db.execute(text(
        "SELECT count(*) FROM audit_log WHERE actor_account_id = ANY(:ids) "
        "OR (target_type = 'account' AND target_id = ANY(:sids))"), {"ids": ids, "sids": str_ids}).scalar()

    print(f"Fica: {keep.full_name} <{keep.email}> ({keep.role.value})" + (" → administrador" if args.admin else ""))
    print(f"Apagar {len(others)} conta(s) e {audit_rows} registro(s) de auditoria delas:")
    for a in others:
        print(f"  - {a.email} ({a.role.value}, {a.status.value})")
    if not args.apply:
        print("\nNada foi alterado. Rode com --apply para aplicar.")
        return 0

    delete_accounts(db, ids)
    if args.admin and keep.role != AccountRole.ADMIN:
        audit.record(db, "account.updated", None, "account", keep.id, via="cli",
                     role=f"{keep.role.value}->admin")
        keep.role = AccountRole.ADMIN
    db.commit()
    print(f"\nFeito. Contas restantes: {db.scalar(select(func.count()).select_from(Account))}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
