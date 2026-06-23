"""Cleanup sweep logic — tested directly against the DB, not via HTTP."""
from datetime import timedelta
from unittest.mock import patch

from sqlalchemy.orm import Session

from src.cleanup import _sweep
from src.db import utcnow
from src.models import Clipboard, File, Share


def _add_text_share(db: Session, *, expired=False, burned=False, pending=False, pending_old=False):
    now = utcnow()
    share = Share(
        id=f"test-{id(object())}",
        delete_token_hash="x",
        type="text",
        status="pending" if (pending or pending_old) else "active",
        expires_at=now - timedelta(hours=1) if expired else now + timedelta(hours=1),
        burned=burned,
        created_at=now - timedelta(seconds=700) if pending_old else now,
    )
    db.add(share)
    db.add(Clipboard(share_id=share.id, content="hi"))
    db.commit()
    return share.id


def _get_session(db_engine):
    from sqlalchemy.orm import sessionmaker
    return sessionmaker(bind=db_engine)()


def test_expired_share_is_swept(db_engine):
    db = _get_session(db_engine)
    share_id = _add_text_share(db, expired=True)
    db.close()

    with patch("src.cleanup.delete_prefix"):
        with patch("src.cleanup.SessionLocal", return_value=_get_session(db_engine)):
            _sweep()

    db2 = _get_session(db_engine)
    assert db2.query(Share).filter(Share.id == share_id).first() is None
    db2.close()


def test_burned_share_is_swept(db_engine):
    db = _get_session(db_engine)
    share_id = _add_text_share(db, burned=True)
    db.close()

    with patch("src.cleanup.delete_prefix"):
        with patch("src.cleanup.SessionLocal", return_value=_get_session(db_engine)):
            _sweep()

    db2 = _get_session(db_engine)
    assert db2.query(Share).filter(Share.id == share_id).first() is None
    db2.close()


def test_abandoned_pending_share_is_swept(db_engine):
    db = _get_session(db_engine)
    share_id = _add_text_share(db, pending_old=True)
    db.close()

    with patch("src.cleanup.delete_prefix"):
        with patch("src.cleanup.SessionLocal", return_value=_get_session(db_engine)):
            _sweep()

    db2 = _get_session(db_engine)
    assert db2.query(Share).filter(Share.id == share_id).first() is None
    db2.close()


def test_active_share_is_not_swept(db_engine):
    db = _get_session(db_engine)
    share_id = _add_text_share(db)  # active, not expired, not burned
    db.close()

    with patch("src.cleanup.delete_prefix"):
        with patch("src.cleanup.SessionLocal", return_value=_get_session(db_engine)):
            _sweep()

    db2 = _get_session(db_engine)
    assert db2.query(Share).filter(Share.id == share_id).first() is not None
    db2.close()
