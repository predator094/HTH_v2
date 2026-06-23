import asyncio
import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from .config import settings
from .db import SessionLocal, utcnow
from .models import File, Share
from .storage import delete_prefix

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL = 300  # seconds between sweeps


async def run_cleanup_loop() -> None:
    while True:
        await asyncio.sleep(_SWEEP_INTERVAL)
        try:
            _sweep()
        except Exception:
            logger.exception("Cleanup sweep failed")


def _sweep() -> None:
    db: Session = SessionLocal()
    try:
        now = utcnow()
        cutoff_pending = now - timedelta(seconds=settings.pending_upload_timeout)

        candidates = (
            db.query(Share)
            .filter(
                (Share.expires_at < now)
                | (Share.burned == True)  # noqa: E712
                | (
                    (Share.status == "pending")
                    & (Share.created_at < cutoff_pending)
                )
            )
            .all()
        )

        count, bytes_freed = 0, 0
        for share in candidates:
            delete_prefix(f"{share.id}/")
            for f in share.files:
                if f.upload_confirmed:
                    bytes_freed += f.size_bytes
            db.delete(share)
            count += 1

        db.commit()
        if count:
            logger.info("Cleanup: removed %d shares, freed %.1f MB", count, bytes_freed / 1_048_576)
    finally:
        db.close()
