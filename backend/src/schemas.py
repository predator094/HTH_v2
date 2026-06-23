import os
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

_BLOCKED_EXTENSIONS = frozenset(
    {".exe", ".bat", ".sh", ".msi", ".cmd", ".ps1", ".vbs", ".scr", ".pif", ".com", ".jar", ".app", ".deb", ".rpm", ".dmg"}
)


# ── inbound ──────────────────────────────────────────────────────────────────

class FileMetadataIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)
    mime: Optional[str] = Field(default=None, max_length=128)

    @field_validator("name")
    @classmethod
    def no_dangerous_extension(cls, v: str) -> str:
        ext = os.path.splitext(v)[1].lower()
        if ext in _BLOCKED_EXTENSIONS:
            raise ValueError(f"File type '{ext}' is not allowed")
        return v


class InitUploadRequest(BaseModel):
    type: Literal["files"] = "files"
    file_metadata: list[FileMetadataIn] = Field(min_length=1, max_length=100)
    expires_in: int = Field(gt=0)
    passcode: Optional[str] = Field(default=None, max_length=100)
    one_time: bool = False


class TextShareRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    expires_in: int = Field(gt=0)
    passcode: Optional[str] = Field(default=None, max_length=100)
    one_time: bool = False


class ConfirmUploadRequest(BaseModel):
    file_ids: list[int] = Field(min_length=1)


# ── outbound ─────────────────────────────────────────────────────────────────

class UploadUrlItem(BaseModel):
    file_id: int
    url: str
    expires_in: int


class InitUploadResponse(BaseModel):
    share_id: str
    delete_token: str
    upload_urls: list[UploadUrlItem]


class TextShareResponse(BaseModel):
    share_id: str
    delete_token: str
    url: str
    expires_at: datetime


class ConfirmUploadResponse(BaseModel):
    share_id: str
    url: str
    expires_at: datetime


class FileMetaOut(BaseModel):
    file_id: int
    name: str
    size: int
    mime: Optional[str]


class ShareMetaResponse(BaseModel):
    type: str
    expires_at: datetime
    requires_passcode: bool
    one_time: bool
    files: list[FileMetaOut]


class DownloadUrlResponse(BaseModel):
    url: str


class TextContentResponse(BaseModel):
    content: str


class LookupByPasscodeResponse(BaseModel):
    share_id: str
    share_url: str
