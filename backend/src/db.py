from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import settings

if not settings.database_url:
    raise RuntimeError("DATABASE_URL is not set — add it to your .env file")

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # drops stale connections (important for Neon's serverless idle)
    pool_recycle=300,     # recycle connections every 5 min before Neon times them out
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow() -> datetime:
    """Return a naive UTC datetime for consistent database storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
