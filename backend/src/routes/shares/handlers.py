from datetime import timedelta
from typing import Optional
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...config import settings
from ...db import get_db, utcnow
from ...models import Clipboard, File, Share, UploadLog
from ...rate_limit import limiter
from ...schemas import (
    ConfirmUploadRequest,
    ConfirmUploadResponse,
    DownloadUrlResponse,
    FileMetaOut,
    InitUploadRequest,
    InitUploadResponse,
    LookupByPasscodeResponse,
    ShareMetaResponse,
    TextContentResponse,
    TextShareRequest,
    TextShareResponse,
    UploadUrlItem,
)
from ...security import generate_delete_token, generate_slug, hash_secret, passcode_lookup_hash, verify_secret
from ...storage import delete_prefix, generate_download_url, generate_upload_url, verify_uploaded
from .router import router


# ── helpers ───────────────────────────────────────────────────────────────────

def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _pending_and_active_bytes(db: Session) -> int:
    """Sum of all file sizes for non-burned shares (pending+active) — quota safety check."""
    result = (
        db.query(func.coalesce(func.sum(File.size_bytes), 0))
        .join(Share, File.share_id == Share.id)
        .filter(Share.status.in_(["pending", "active"]), Share.burned == False)  # noqa: E712
        .scalar()
    )
    return result or 0


def _resolve_share(share_id: str, passcode: Optional[str], db: Session) -> Share:
    """Load, validate, and authenticate a share. Raises HTTPException on any failure."""
    share = db.query(Share).filter(Share.id == share_id).first()
    now = utcnow()

    if not share or share.status != "active" or share.burned or share.expires_at < now:
        raise HTTPException(status_code=404, detail="Share not found or expired")

    if share.locked_until and share.locked_until > now:
        raise HTTPException(
            status_code=423,
            detail={"locked_until": share.locked_until.isoformat()},
        )

    if share.passcode_hash:
        if not passcode or not verify_secret(passcode, share.passcode_hash):
            share.failed_attempts += 1
            if share.failed_attempts >= settings.passcode_max_attempts:
                share.locked_until = now + timedelta(seconds=settings.passcode_lockout_seconds)
                share.failed_attempts = 0
            db.commit()
            raise HTTPException(status_code=401, detail={"requires_passcode": True})
        share.failed_attempts = 0
        db.commit()

    return share


# ── POST /api/shares/init ─────────────────────────────────────────────────────

@router.post("/init", status_code=status.HTTP_201_CREATED, response_model=InitUploadResponse)
@limiter.limit(settings.rate_limit_upload)
async def init_upload(
    request: Request, body: InitUploadRequest, db: Session = Depends(get_db)
):
    expires_in = min(body.expires_in, settings.max_expiry_seconds)
    total_size = sum(f.size for f in body.file_metadata)

    if total_size > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Upload exceeds per-upload size limit")

    if _pending_and_active_bytes(db) + total_size > settings.max_storage_bytes:
        raise HTTPException(status_code=507, detail="Storage quota reached — try again later")

    share_id = generate_slug()
    raw_token = generate_delete_token()

    share = Share(
        id=share_id,
        delete_token_hash=hash_secret(raw_token),
        type="files",
        status="pending",
        passcode_hash=hash_secret(body.passcode) if body.passcode else None,
        passcode_lookup_hash=passcode_lookup_hash(body.passcode) if body.passcode else None,
        expires_at=utcnow() + timedelta(seconds=expires_in),
        one_time=body.one_time,
        creator_ip=_client_ip(request),
    )
    db.add(share)
    db.flush()

    upload_urls: list[UploadUrlItem] = []
    for meta in body.file_metadata:
        stored_key = f"{share_id}/{uuid4()}"
        file_row = File(
            share_id=share_id,
            original_name=meta.name,
            stored_key=stored_key,
            size_bytes=meta.size,
            mime_type=meta.mime,
        )
        db.add(file_row)
        db.flush()
        url = generate_upload_url(stored_key, meta.mime, settings.upload_url_expiry)
        upload_urls.append(
            UploadUrlItem(file_id=file_row.id, url=url, expires_in=settings.upload_url_expiry)
        )

    db.add(UploadLog(ip=_client_ip(request), bytes=total_size))
    db.commit()

    return InitUploadResponse(share_id=share_id, delete_token=raw_token, upload_urls=upload_urls)


# ── POST /api/shares/text ─────────────────────────────────────────────────────

@router.post("/text", status_code=status.HTTP_201_CREATED, response_model=TextShareResponse)
@limiter.limit(settings.rate_limit_upload)
async def create_text_share(
    request: Request, body: TextShareRequest, db: Session = Depends(get_db)
):
    expires_in = min(body.expires_in, settings.max_expiry_seconds)
    expires_at = utcnow() + timedelta(seconds=expires_in)
    share_id = generate_slug()
    raw_token = generate_delete_token()

    share = Share(
        id=share_id,
        delete_token_hash=hash_secret(raw_token),
        type="text",
        status="active",
        passcode_hash=hash_secret(body.passcode) if body.passcode else None,
        passcode_lookup_hash=passcode_lookup_hash(body.passcode) if body.passcode else None,
        expires_at=expires_at,
        one_time=body.one_time,
        creator_ip=_client_ip(request),
    )
    db.add(share)
    db.add(Clipboard(share_id=share_id, content=body.content))
    db.commit()

    url = f"{settings.frontend_origin}/s/{share_id}"
    return TextShareResponse(
        share_id=share_id, delete_token=raw_token, url=url, expires_at=expires_at
    )


# ── POST /api/shares/{share_id}/confirm ──────────────────────────────────────

@router.post("/{share_id}/confirm", response_model=ConfirmUploadResponse)
@limiter.limit(settings.rate_limit_confirm)
async def confirm_upload(
    request: Request,
    share_id: str,
    body: ConfirmUploadRequest,
    db: Session = Depends(get_db),
):
    share = (
        db.query(Share).filter(Share.id == share_id, Share.status == "pending").first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Pending share not found")

    confirmed_any = False
    for file_id in body.file_ids:
        f = (
            db.query(File)
            .filter(File.id == file_id, File.share_id == share_id, File.upload_confirmed == False)  # noqa: E712
            .first()
        )
        if f and verify_uploaded(f.stored_key):
            f.upload_confirmed = True
            confirmed_any = True

    if not confirmed_any:
        raise HTTPException(status_code=422, detail="No files could be verified in storage")

    all_files = db.query(File).filter(File.share_id == share_id).all()
    if all(f.upload_confirmed for f in all_files):
        share.status = "active"

    db.commit()

    url = f"{settings.frontend_origin}/s/{share_id}"
    return ConfirmUploadResponse(share_id=share_id, url=url, expires_at=share.expires_at)


# ── GET /api/shares/by-passcode/{code} ───────────────────────────────────────

@router.get("/by-passcode/{code}", response_model=LookupByPasscodeResponse)
@limiter.limit("5/minute")
async def lookup_by_passcode(
    request: Request,
    code: str,
    db: Session = Depends(get_db),
):
    lookup = passcode_lookup_hash(code)
    now = utcnow()
    share = (
        db.query(Share)
        .filter(
            Share.passcode_lookup_hash == lookup,
            Share.status == "active",
            Share.burned == False,  # noqa: E712
            Share.expires_at > now,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="No active share found for that code")

    url = f"{settings.frontend_origin}/s/{share.id}"
    return LookupByPasscodeResponse(share_id=share.id, share_url=url)


# ── GET /api/shares/{share_id} ───────────────────────────────────────────────

@router.get("/{share_id}", response_model=ShareMetaResponse)
@limiter.limit(settings.rate_limit_read)
async def get_share_meta(
    request: Request,
    share_id: str,
    x_passcode: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    share = _resolve_share(share_id, x_passcode, db)
    share.accessed_count += 1
    db.commit()

    return ShareMetaResponse(
        type=share.type,
        expires_at=share.expires_at,
        requires_passcode=bool(share.passcode_hash),
        one_time=share.one_time,
        files=[
            FileMetaOut(
                file_id=f.id, name=f.original_name, size=f.size_bytes, mime=f.mime_type
            )
            for f in share.files
            if f.upload_confirmed
        ]
        if share.type == "files"
        else [],
    )


# ── GET /api/shares/{share_id}/files/{file_id}/download-url ──────────────────

@router.get("/{share_id}/files/{file_id}/download-url", response_model=DownloadUrlResponse)
@limiter.limit(settings.rate_limit_read)
async def get_download_url(
    request: Request,
    share_id: str,
    file_id: int,
    x_passcode: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    share = _resolve_share(share_id, x_passcode, db)

    f = (
        db.query(File)
        .filter(
            File.id == file_id,
            File.share_id == share_id,
            File.upload_confirmed == True,  # noqa: E712
        )
        .first()
    )
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    url = generate_download_url(f.stored_key, f.original_name, settings.download_url_expiry)

    # v1: burn after first download-url issued regardless of file count
    if share.one_time:
        share.burned = True
        db.commit()

    return DownloadUrlResponse(url=url)


# ── GET /api/shares/{share_id}/text ──────────────────────────────────────────

@router.get("/{share_id}/text", response_model=TextContentResponse)
@limiter.limit(settings.rate_limit_read)
async def get_text_content(
    request: Request,
    share_id: str,
    x_passcode: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    share = _resolve_share(share_id, x_passcode, db)

    if share.type != "text" or not share.clipboard:
        raise HTTPException(status_code=404, detail="No text content for this share")

    content = share.clipboard.content

    if share.one_time:
        share.burned = True
        db.commit()

    return TextContentResponse(content=content)


# ── DELETE /api/shares/{share_id} ────────────────────────────────────────────

@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.rate_limit_delete)
async def delete_share(
    request: Request,
    share_id: str,
    x_delete_token: str = Header(...),
    db: Session = Depends(get_db),
):
    share = db.query(Share).filter(Share.id == share_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    if not verify_secret(x_delete_token, share.delete_token_hash):
        raise HTTPException(status_code=403, detail="Invalid delete token")

    delete_prefix(f"{share_id}/")
    db.delete(share)
    db.commit()
