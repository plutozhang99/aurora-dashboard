# Aurora Dashboard — Backend (FastAPI)

Python/FastAPI backend for the email-centric morning dashboard. Replaces the old
Node/Express `server/`. Keeps the `/api` HTTP contract unchanged so the React
frontend is decoupled from the backend language.

## Structure

```
backend/
  app/
    main.py            FastAPI app; routers; dev CORS; prod StaticFiles + SPA fallback
    config.py          host/port/dist-dir from env (AURORA_HOST, AURORA_PORT, AURORA_DIST_DIR)
    models.py          Pydantic request/response models
    routers/
      health.py        GET  /api/health
      news.py          POST /api/news
      email.py         POST /api/email/important, /api/schedule/today, /api/email/todos
      briefing.py      POST /api/briefing
    services/
      llm.py           async LLM JSON helper (Anthropic / OpenAI SDKs)
      news.py          feedparser RSS fetch + normalization
      imap.py          multi-account IMAP fetch, concurrency, dedup/merge (pure logic)
      classify.py      importance / schedule / todo classification (AI + keyword), TTL cache
      briefing.py      assemble emails + schedule + news → LLM summary or structured fallback
  tests/               pytest suite (no network — IMAP/LLM injected or monkeypatched)
  pyproject.toml
```

## Install

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'        # dev extras = pytest, pytest-asyncio, httpx
```

(From the repo root the orchestrated form is
`python3 -m venv backend/.venv && backend/.venv/bin/pip install -e 'backend[dev]'`.)

## Run

```bash
# Dev (binds 127.0.0.1:5174 to reuse the Vite dev proxy):
uvicorn app.main:app --reload --port 5174        # run from backend/
# or from repo root:
uvicorn app.main:app --reload --port 5174 --app-dir backend

# Prod (serves built dist/ via StaticFiles when present):
uvicorn app.main:app --host 0.0.0.0 --port 5174 --app-dir backend
```

Environment variables (all optional):

| Var                       | Default        | Purpose                                   |
|---------------------------|----------------|-------------------------------------------|
| `AURORA_HOST`             | `127.0.0.1`    | Bind host                                 |
| `AURORA_PORT`             | `5174`         | Bind port                                 |
| `AURORA_DIST_DIR`         | `../dist`      | Built frontend dir; static served if exists |
| `AURORA_IMAP_CONCURRENCY` | `3`            | Max concurrent IMAP connections           |

No secrets are stored server-side: AI keys and IMAP credentials arrive only in
request bodies. The TTL cache (6h) is in-process.

## Test

```bash
.venv/bin/pytest tests -q       # from backend/
```

Tests never touch the network: the IMAP fetch is injected (`fetch_fn`) and the
LLM layer is monkeypatched / injected (`llm_fn`).
