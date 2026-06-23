-- Add fast SHA-256 lookup hash for passcode-based share retrieval.
-- The bcrypt hash in passcode_hash is still used for actual auth.
ALTER TABLE shares ADD COLUMN passcode_lookup_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_shares_passcode_lookup ON shares(passcode_lookup_hash);
