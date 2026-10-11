"""Removes what the browser tests (frontend/e2e) left in the DEVELOPMENT database: events
owned by e2e accounts (with their files in the storage) and the e2e accounts themselves.

    .venv/bin/python scripts/cleanup_e2e.py           # shows what would be removed
    .venv/bin/python scripts/cleanup_e2e.py --apply   # removes

Only accounts whose e-mail matches the e2e pattern are touched, and only on a local database.
The system itself never deletes accounts (RF003 note 4); this is test-data cleanup — see
scripts/dev_keep_only_account.py for why the audit entries of those accounts go too.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db.models import Account, Event, Image, PackageJob  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.storage.factory import get_storage  # noqa: E402
from dev_keep_only_account import delete_accounts, local_database_only  # noqa: E402

E2E_EMAIL = "e2e.%@cesmac.edu.br"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not local_database_only():
        return 1
    db = sessionmaker(bind=get_engine())()
    accounts = db.scalars(select(Account).where(Account.email.like(E2E_EMAIL))).all()
    events = db.scalars(select(Event).join(Account, Account.id == Event.owner_id)
                        .where(Account.email.like(E2E_EMAIL))).all()
    print(f"{len(events)} evento(s) de teste automatizado:")
    for e in events:
        print(f"  - {e.name} ({e.owner.email})")
    print(f"{len(accounts)} conta(s) de teste automatizado.")
    if not args.apply:
        print("\nNada foi removido. Rode com --apply para remover.")
        return 0
    storage = get_storage()
    files = 0
    for e in events:
        # The database cascade removes the ROWS (images, face vectors, packages), not the FILES:
        # every object is deleted here first, so no photo is left behind without its record.
        keys = [e.cover_object_key]
        for img in db.scalars(select(Image).where(Image.event_id == e.id)):
            keys += [img.object_key, img.thumb_key, img.preview_key]
        keys += [j.object_key for j in db.scalars(select(PackageJob).where(PackageJob.event_id == e.id))]
        for key in filter(None, keys):
            storage.delete(key)
            files += 1
        db.delete(e)
    db.flush()
    # Themes the tests created ("... E2E ...") and no event uses any more.
    themes = db.execute(text("DELETE FROM themes WHERE name LIKE '%E2E%' AND id NOT IN "
                             "(SELECT theme_id FROM event_themes) RETURNING name")).all()
    delete_accounts(db, [a.id for a in accounts])
    db.commit()
    print(f"\n{len(events)} evento(s) removido(s), com {files} arquivo(s) do armazenamento; "
          f"{len(accounts)} conta(s) e {len(themes)} tema(s) de teste removidos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
