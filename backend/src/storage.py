from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .config import settings


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url or None,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name=settings.storage_region,
        config=Config(signature_version="s3v4"),
    )


def generate_upload_url(stored_key: str, mime_type: str | None, expiry: int) -> str:
    """Return a presigned PUT URL for direct browser→R2 upload."""
    params: dict = {"Bucket": settings.r2_bucket_name, "Key": stored_key}
    if mime_type:
        params["ContentType"] = mime_type
    return _client().generate_presigned_url("put_object", Params=params, ExpiresIn=expiry)


def generate_download_url(stored_key: str, original_name: str, expiry: int) -> str:
    """Return a presigned GET URL that forces download with the correct filename."""
    encoded = quote(original_name, safe="")
    disposition = f"attachment; filename*=UTF-8''{encoded}"
    return _client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": stored_key,
            "ResponseContentDisposition": disposition,
        },
        ExpiresIn=expiry,
    )


def verify_uploaded(stored_key: str) -> bool:
    """Return True if the object exists in R2 (head_object check)."""
    try:
        _client().head_object(Bucket=settings.r2_bucket_name, Key=stored_key)
        return True
    except ClientError:
        return False


def delete_file(stored_key: str) -> None:
    try:
        _client().delete_object(Bucket=settings.r2_bucket_name, Key=stored_key)
    except ClientError:
        pass


def delete_prefix(prefix: str) -> None:
    """Delete every R2 object whose key starts with prefix (e.g. '{share_id}/')."""
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.r2_bucket_name, Prefix=prefix):
        objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
        if objects:
            client.delete_objects(
                Bucket=settings.r2_bucket_name, Delete={"Objects": objects}
            )
