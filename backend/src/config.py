from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # R2 / Storage
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "h2h-shares"
    r2_endpoint_url: str = ""
    storage_region: str = "auto"  # "auto" for R2, real region e.g. "us-east-1" for S3

    # Limits
    max_upload_bytes: int = 100 * 1024 * 1024        # 100 MB per upload
    max_storage_bytes: int = 9 * 1024 * 1024 * 1024  # 9 GB total
    max_expiry_seconds: int = 30 * 24 * 60 * 60      # 30 days
    pending_upload_timeout: int = 600                  # 10 min
    download_url_expiry: int = 900                     # 15 min
    upload_url_expiry: int = 600                       # 10 min
    passcode_max_attempts: int = 5
    passcode_lockout_seconds: int = 300                # 5 min

    # Rate limiting
    rate_limit_upload: str = "10/hour"
    rate_limit_confirm: str = "20/hour"
    rate_limit_read: str = "30/minute"
    rate_limit_delete: str = "10/hour"

    # DB
    database_url: str = ""  # e.g. postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require

    # App
    frontend_origin: str = "https://h2h.pred8ar.in"

    class Config:
        env_file = ".env"


settings = Settings()
