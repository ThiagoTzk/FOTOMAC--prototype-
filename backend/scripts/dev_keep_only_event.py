"""DEVELOPMENT ONLY: delete every event except the ones whose name contains --keep (or all of them).

    .venv/bin/python scripts/dev_keep_only_event.py --keep "COLAÇÃO DE GRAU"           # shows
    .venv/bin/python scripts/dev_keep_only_event.py --keep "COLAÇÃO DE GRAU" --apply   # does
    .venv/bin/python scripts/dev_keep_only_event.py --all --apply                       # every event and every
                                                                                        # recognition test

The system itself never deletes events (they expire, RF006); this cleans demonstration data from
a local database. Files go first and rows last (same rule as delete_image): a storage failure
leaves the database untouched. The removal requests and consent records of those events are
deleted too — the foreign keys would only NULL their links and leave orphans behind.
The audit log is append-only and keeps its entries.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db.models import Event, Image, PackageJob  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.storage.factory import get_storage  # noqa: E402
from dev_keep_only_account import local_database_only  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Desenvolvimento: apaga todos os eventos menos os indicados.")
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--keep", help="trecho do nome dos eventos que ficam (sem diferenciar maiúsculas)")
    group.add_argument("--all", action="store_true", help="apaga TODOS os eventos e TODOS os testes de precisão")
    p.add_argument("--apply", action="store_true", help="sem isto, só mostra o que seria feito")
    args = p.parse_args()
    if not local_database_only():
        return 1
    db = sessionmaker(bind=get_engine())()
    events = db.scalars(select(Event).order_by(Event.created_at)).all()
    keep = [] if args.all else [e for e in events if args.keep.lower() in e.name.lower()]
    drop = [e for e in events if e not in keep]
    if not keep and not args.all:
        print(f"Recusado: nenhum evento contém “{args.keep}”. Nada seria mantido.")
        return 1
    count = lambda e: db.scalar(select(func.count()).select_from(Image).where(Image.event_id == e.id))
    print("Ficam:")
    for e in keep:
        print(f"  = {e.name} ({count(e)} fotos)")
    print("Saem:")
    for e in drop:
        print(f"  - {e.name} ({count(e)} fotos)")
    if not args.apply:
        print("\nNada foi removido. Rode com --apply para remover.")
        return 0

    storage = get_storage()
    if args.all:  # the tests keep photos of the query person and per-face data: discarded the official way
        from app.calibration import service as calibration
        from app.db.models import Account, AccountRole, RecognitionTest
        admin = db.scalar(select(Account).where(Account.role == AccountRole.ADMIN).limit(1))
        for t in db.scalars(select(RecognitionTest)).all():
            calibration.discard(db, storage, admin, t)
        print("Testes de precisão descartados.")
    files = 0
    ids = [e.id for e in drop]
    for e in drop:
        keys = [e.cover_object_key]
        for img in db.scalars(select(Image).where(Image.event_id == e.id)):
            keys += img.storage_keys
        keys += [j.object_key for j in db.scalars(select(PackageJob).where(PackageJob.event_id == e.id))]
        for key in filter(None, keys):
            storage.delete(key)
            files += 1
    # Open visitor sessions point to the consent records: they go first (they would go with the event anyway).
    db.execute(text("DELETE FROM visitor_sessions WHERE event_id = ANY(:ids)"), {"ids": ids})
    requests = db.execute(text("DELETE FROM removal_requests WHERE event_id = ANY(:ids)"), {"ids": ids}).rowcount
    consents = db.execute(text("DELETE FROM consent_records WHERE event_id = ANY(:ids)"), {"ids": ids}).rowcount
    for e in drop:
        db.delete(e)  # images, face vectors, packages, themes links and visitor sessions go by cascade
    db.commit()
    print(f"\n{len(drop)} evento(s) removido(s): {files} arquivo(s) do armazenamento, "
          f"{requests} pedido(s) de remoção e {consents} registro(s) de ciência.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
