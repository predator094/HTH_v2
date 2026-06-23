PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    delete_token_hash TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('files', 'text')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active')),
    passcode_hash TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    one_time BOOLEAN NOT NULL DEFAULT 0,
    accessed_count INTEGER NOT NULL DEFAULT 0,
    burned BOOLEAN NOT NULL DEFAULT 0,
    creator_ip TEXT,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_key TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    mime_type TEXT,
    sha256 TEXT,
    upload_confirmed BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clipboard (
    share_id TEXT PRIMARY KEY REFERENCES shares(id) ON DELETE CASCADE,
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bytes INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_status ON shares(status, created_at);
CREATE INDEX IF NOT EXISTS idx_upload_log_ip_time ON upload_log(ip, created_at);
