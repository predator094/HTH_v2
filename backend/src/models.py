from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from .db import Base


class Share(Base):
    __tablename__ = "shares"

    id = Column(Text, primary_key=True)
    delete_token_hash = Column(Text, nullable=False)
    type = Column(Text, nullable=False)            # 'files' | 'text'
    status = Column(Text, nullable=False, default="pending")  # 'pending' | 'active'
    passcode_hash = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    one_time = Column(Boolean, nullable=False, default=False)
    accessed_count = Column(Integer, nullable=False, default=0)
    burned = Column(Boolean, nullable=False, default=False)
    creator_ip = Column(Text, nullable=True)
    failed_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    passcode_lookup_hash = Column(Text, nullable=True, index=True)

    files = relationship("File", back_populates="share", cascade="all, delete-orphan")
    clipboard = relationship(
        "Clipboard", back_populates="share", uselist=False, cascade="all, delete-orphan"
    )


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    share_id = Column(Text, ForeignKey("shares.id", ondelete="CASCADE"), nullable=False)
    original_name = Column(Text, nullable=False)   # display only — NEVER used in storage paths
    stored_key = Column(Text, nullable=False)       # R2 key: {share_id}/{uuid4}
    size_bytes = Column(Integer, nullable=False)
    mime_type = Column(Text, nullable=True)
    sha256 = Column(Text, nullable=True)
    upload_confirmed = Column(Boolean, nullable=False, default=False)

    share = relationship("Share", back_populates="files")


class Clipboard(Base):
    __tablename__ = "clipboard"

    share_id = Column(Text, ForeignKey("shares.id", ondelete="CASCADE"), primary_key=True)
    content = Column(Text, nullable=False)

    share = relationship("Share", back_populates="clipboard")


class UploadLog(Base):
    __tablename__ = "upload_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ip = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    bytes = Column(Integer, nullable=False)
