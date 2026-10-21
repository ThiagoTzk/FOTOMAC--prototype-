"""Removes what the browser tests (frontend/e2e) left in the DEVELOPMENT database: events
owned by e2e accounts (with their files in the storage), the removal requests made in them,
the institutional people with an e2e e-mail (photos and signature included), and the e2e
accounts themselves.

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

from app.db.models import Account, Event, Image, InstitutionalPerson, PackageJob, RemovalRequest  # noqa: E402
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
    # A removal request keeps the requester's contact until it is concluded (RF023 note 3).
    # Deleting a test event only NULLs the request's links (ON DELETE SET NULL), so the request
    # would sit "received" forever, holding a contact, pointing at nothing. Events are never
    # deleted by the system itself (only expired, which concludes them), so a request with no
    # event can only be a leftover of this script.
    event_ids = [e.id for e in events]
    requests = db.scalars(select(RemovalRequest).where(
        RemovalRequest.event_id.in_(event_ids) | RemovalRequest.event_id.is_(None))).all()
    print(f"{len(requests)} pedido(s) de remoção de teste (dos eventos acima ou já sem evento).")
    people = db.scalars(select(InstitutionalPerson).where(InstitutionalPerson.email.like(E2E_EMAIL))).all()
    print(f"{len(people)} pessoa(s) institucional(is) de teste automatizado.")
    if not args.apply:
        print("\nNada foi removido. Rode com --apply para remover.")
        return 0
    for r in requests:
        db.delete(r)
    storage = get_storage()
    files = 0
    for e in events:
        # The database cascade removes the ROWS (images, face vectors, packages), not the FILES:
        # every object is deleted here first, so no photo is left behind without its record.
        keys = [e.cover_object_key]
        for img in db.scalars(select(Image).where(Image.event_id == e.id)):
            keys += img.storage_keys
        keys += [j.object_key for j in db.scalars(select(PackageJob).where(PackageJob.event_id == e.id))]
        for key in filter(None, keys):
            storage.delete(key)
            files += 1
        db.delete(e)
    db.flush()
    for person in people:   # their rows carry the photos, vectors and marks; the FILES go first
        for key in [ph.object_key for ph in person.photos] + [person.signature_key]:
            if key:
                storage.delete(key)
                files += 1
        db.delete(person)
    db.flush()
    # Themes the tests created ("... E2E ...") and no event uses any more.
    themes = db.execute(text("DELETE FROM themes WHERE name LIKE '%E2E%' AND id NOT IN "
                             "(SELECT theme_id FROM event_themes) RETURNING name")).all()
    delete_accounts(db, [a.id for a in accounts])
    db.commit()
    print(f"\n{len(events)} evento(s) removido(s), com {files} arquivo(s) do armazenamento; "
          f"{len(accounts)} conta(s), {len(people)} pessoa(s) institucional(is), {len(requests)} pedido(s) de remoção "
          f"e {len(themes)} tema(s) de teste removidos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
