import os

# Must be set before any app import so rate_limit.py and db.py pick them up
os.environ["TESTING"] = "true"
os.environ["DATABASE_URL"] = "sqlite://"  # overridden per-test via get_db; prevents RuntimeError on import

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.db import Base, get_db
from src.main import app


def _make_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # all connections share one in-memory DB
    )

    @event.listens_for(engine, "connect")
    def _pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def db_engine():
    engine = _make_engine()
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def client(db_engine):
    Session = sessionmaker(bind=db_engine)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db

    # Unique IP per test so rate-limit counters don't accumulate across tests
    test_ip = f"10.{'.'.join(str(b) for b in uuid.uuid4().bytes[:3])}"

    with (
        patch("src.routes.shares.handlers.generate_upload_url", return_value="https://r2.test/upload"),
        patch("src.routes.shares.handlers.generate_download_url", return_value="https://r2.test/download"),
        patch("src.routes.shares.handlers.verify_uploaded", return_value=True),
        patch("src.routes.shares.handlers.delete_prefix", return_value=None),
    ):
        with TestClient(app, raise_server_exceptions=True, headers={"X-Test-IP": test_ip}) as c:
            yield c

    app.dependency_overrides.clear()
