# H2H — File & Clipboard Sharing (Revamp)

Peer-to-peer file and text sharing with no accounts required. Upload files or paste text, get a short share link, optionally protect it with a passcode, and it self-destructs on expiry or after a single download.

**Stack:** FastAPI · SQLite · Cloudflare R2 · Next.js 15 · Tailwind CSS · Docker Compose · Nginx

## Features

- Upload files (up to 100 MB) direct to Cloudflare R2 via pre-signed URLs — the backend never buffers file bytes
- Clipboard sharing for plain text
- Optional passcode protection with brute-force lockout (5 attempts → 5 min lockout)
- One-time download mode — share burns after first access
- Delete token — owner can destroy the share at any time
- Configurable expiry (up to 30 days)
- Auto-cleanup loop purges expired shares and their R2 objects
- Rate limiting on all write endpoints

## Prerequisites

- Docker & Docker Compose
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket
- (Production) A VPS with Nginx + Certbot

## Local development

### 1. Configure environment

```bash
cp .env.example .env
```

Fill in your R2 credentials in `.env`:

```env
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_key_id
R2_SECRET_ACCESS_KEY=your_secret
R2_BUCKET_NAME=h2h-shares
R2_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
```

Leave the other values as-is for local dev or tune them to taste.

### 2. Start with Docker Compose

```bash
docker compose up --build
```

| Service  | Port |
|----------|------|
| Backend  | 8000 |
| Frontend | 3000 |

Open [http://localhost:3000](http://localhost:3000).

### 3. Run backend without Docker

```bash
cd backend
pip install -r requirements.txt
# set env vars from .env, then:
uvicorn app.main:app --reload --port 8000
```

### 4. Run frontend without Docker

```bash
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

## Running tests

```bash
cd backend
pip install -r requirements.txt pytest httpx pytest-anyio
TESTING=true DB_PATH=:memory: pytest tests/ -v
```

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + CORS + rate limit wiring
│   │   ├── config.py        # Pydantic settings (reads .env)
│   │   ├── db.py            # SQLAlchemy engine
│   │   ├── models.py        # ORM models
│   │   ├── schemas.py       # Request/response schemas
│   │   ├── storage.py       # R2 pre-signed URL generation
│   │   ├── security.py      # Passcode hashing, delete token logic
│   │   ├── cleanup.py       # Background expiry loop
│   │   ├── rate_limit.py    # slowapi limiter instance
│   │   └── routers/
│   │       ├── shares.py    # All share endpoints
│   │       └── health.py    # GET /api/health
│   ├── migrations/
│   │   └── 001_init.sql     # Schema (SQLite, WAL mode)
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js app router pages
│   ├── components/          # FileDropzone, PasscodeGate, ProgressBar, etc.
│   ├── lib/api.ts           # Typed API client
│   └── package.json
├── nginx/
│   └── h2h.conf             # Nginx reverse proxy + SSL config
├── docker-compose.yml
└── .env.example
```

## API overview

All endpoints are under `/api/`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/shares` | Create a share (returns upload URLs for files) |
| `POST` | `/api/shares/{id}/confirm` | Confirm upload complete, activate share |
| `GET`  | `/api/shares/{id}` | Fetch share metadata (passcode gate) |
| `GET`  | `/api/shares/{id}/download` | Get signed download URL(s) |
| `DELETE` | `/api/shares/{id}` | Delete share using delete token |
| `GET`  | `/api/health` | Health check |

## Production deployment

CI/CD is handled by `.github/workflows/deploy.yml`. On push to `main`:

1. Backend tests run against an in-memory SQLite database
2. Frontend build is verified
3. On success, the workflow SSHs into the VPS, pulls the latest code, and runs `docker compose up -d`

### Required GitHub secrets

| Secret | Value |
|--------|-------|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH username |
| `VPS_SSH_KEY` | Private SSH key |

### Nginx + SSL

Copy `nginx/h2h.conf` to `/etc/nginx/sites-available/h2h` on the VPS, symlink it, then run Certbot:

```bash
sudo certbot --nginx -d h2h.pred8ar.in
sudo systemctl reload nginx
```

### Environment on the VPS

Place a `.env` file at `/opt/h2h-revamp/.env` with the same variables as `.env.example`. The `h2h-data` Docker volume persists the SQLite database across deploys.
