# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TurfBook is a turf (sports ground) booking platform. It is split into two independently-run apps in one repo:

- **Frontend** (repo root, `src/`): Vite + React 18 + TypeScript, shadcn-ui (Radix + Tailwind), Redux Toolkit, axios. Originally scaffolded with Lovable (`lovable-tagger` plugin in dev mode).
- **Backend** (`backend/`): FastAPI on uvicorn (ASGI), MongoDB (pymongo), Redis, S3 (boto3), Razorpay for payments, Chroma (vector DB for the planned RAG chatbot). JWT auth is hand-rolled on PyJWT in `helpers/jwt_service.py`.

Main integration branch is `dev`.

**Target user journey:** sign up / log in → browse turfs → open a turf → pick a date and see its 30-minute slot availability → select slots and book → pay via Razorpay (backend creates order, verifies payment) → booking confirmed → view booking history.

**Out of scope unless explicitly added:** live location tracking, user-to-user chat, tournaments, team formation, social features. Turf-owner/admin management and in-app cancellation are planned extensions, not built. Cancellation/refund policy (decided): users cancel by contacting the turf owner (`owner_contact` on the turf doc), and refunds are at the owner's discretion, handled by the owner directly.

Background handover doc (product goals, roadmap, security checklist): `~/Downloads/TURF_PROJECT_DOCUMENTATION.md`. Its implementation details do not match the current code (it describes `/api/auth/login`, `/api/me`) — trust the code over it.

## Workflow rules

- After finishing any set of code changes (frontend or backend), run the `/code-review` skill on the diff and confirm the changes are valid before reporting the work as done. Fix or report confirmed findings. Docs-only edits (this file, memory files) are exempt.
- Keep this file current: when a change alters scope, endpoints, flows, env vars, collections, or resolves an open decision, update the relevant section here in the same change.

## Commands

### Frontend (run from repo root)

```sh
npm i
npm run dev          # Vite dev server on port 8080
npm run build        # production build
npm run lint         # eslint .
npm test             # vitest run (jsdom, setup in src/test/setup.ts)
npx vitest run src/path/to/file.test.ts   # single test file
npx vitest run -t "test name"             # single test by name
```

Tests must match `src/**/*.{test,spec}.{ts,tsx}`.

### Backend (run from `backend/`)

```sh
docker compose up --build    # backend (uvicorn w/ reload, port 8000) + mongo:6 + redis:7 + chroma (host port 8001) (+ jenkins on 8080)
python scripts/insert_turfs.py   # seed a turf document into Mongo (edit values in the script)
pytest                       # backend test suite (needs pytest, mongomock, fakeredis: pip install -r requirements-dev.txt)
pytest tests/test_bookings.py -k midnight   # single test
```

Interactive API docs: `http://localhost:8000/docs` (OpenAPI schema at `/openapi.json`).

The test suite (`backend/tests/`) talks to the app over HTTP with Starlette's `TestClient`, so it asserts paths, status codes and response bodies rather than framework internals. Mongo comes from `TEST_MONGO_URI`/`MONGO_URI` when reachable (database `turfbook_test`, cleared per test) and falls back to mongomock; Redis is fakeredis and Razorpay is mocked via the `fake_razorpay` fixture in `tests/conftest.py`.

Inside Compose, services reach Mongo/Redis/Chroma by service name (`turf-mongo`, `turf-redis`, `turf-chroma:8000`); from the host (e.g. MongoDB Compass) use `localhost:27017`. The database is `turfbook` with collections `users`, `turfs`, `bookings`.

The compose file mounts `backend/` into the container and runs `uvicorn --reload` with `WATCHFILES_FORCE_POLLING=true`, so code changes hot-reload. The image's own `CMD` is `uvicorn app:app --workers 2` (no reload); for gunicorn-style process management in production use `gunicorn app:app -k uvicorn_worker.UvicornWorker -w 2 --timeout 60 -b 0.0.0.0:8000`. Note the Jenkins service also binds port 8080, which collides with the Vite dev server.

Backend modules use flat imports (`from apis.turfs import ...`, `from helpers...`), so run Python from inside `backend/` (the Dockerfile sets `PYTHONPATH=/app`).

## Environment

- Frontend: `.env` at repo root (see `.env.example`): `VITE_API_BASE`, `VITE_RAZORPAY_KEY_ID`, `VITE_APP_NAME`. `src/env.ts` (imported first in `main.tsx`) maps these onto `process.env.API_BASE` / `RAZORPAY_KEY_ID` / `APP_NAME`; frontend code reads `process.env.*`, not `import.meta.env` directly.
- Backend: `backend/.env` (see `backend/.env.example`): Mongo, JWT secrets/expiry, Redis, AWS/S3, Razorpay keys (`RAZORPAY_API_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`), `FRONTEND_ORIGINS` for CORS, Chroma (`CHROMA_HOST`, `CHROMA_PORT`, `CHROMA_COLLECTION`), chatbot LLM via OpenRouter (`OPEN_ROUTER_API_KEY`, `OPEN_ROUTER_MODEL`, `OPEN_ROUTER_BASE_URL`). `docker compose restart` does not reread `.env`; use `docker compose up -d --force-recreate turf-backend`.

## Architecture

### Backend request flow

- `app.py` builds the FastAPI app in `create_app()` and includes the API router at `/api`. ASGI entrypoint is `app:app`. A `lifespan` closes the shared Mongo/Redis clients on shutdown.
- `config.py` reads env vars into module-level constants and creates **shared singleton clients** (`MongoClient`/`MongoDb`, `RedisClient`, `pwd_context`) at import time. Endpoints receive the clients through the dependencies `get_db` / `get_redis` / `get_pwd_context`, so tests swap them with `app.dependency_overrides`. Static config (bucket names, fee rates, JWT settings) is imported directly as constants — use a dependency only for per-request objects.
- `routers.py` is the single place where paths are registered, with `add_api_route` rather than route decorators, so every URL is visible in one file (`auth/...`, `turfs/...`, `bookings/...`, `chat`, and `webhook/...` for calls from external services, implemented in `apis/webhooks.py`). Adding an endpoint = write a plain function in `apis/` (no decorator) and `add_api_route` it here; an unregistered function is simply not served.
- `middleware.py` sets up CORS and the `current_user_id` dependency, which validates the bearer access token and returns the user id. `bookings`, `turfs` and `chat` carry it at router level in `routers.py`; `auth` applies it per route (`user-logout`, `current-user-data`). **A route is public simply by not depending on it** — there is no `PUBLIC_PATHS` list any more. It also provides `raw_request_body` for signature-verified webhooks.
- Endpoints return `JSONResponse({...}, status_code=...)` with a `status` field in the body; errors are logged with `logging.exception` and returned as 500. Exception handlers in `app.py` keep FastAPI's own errors in the same `{status, error}` shape: schema violations become **400** (not FastAPI's default 422), and `HTTPException`s (including auth 401s and unknown paths) and unhandled exceptions are rendered the same way, with no tracebacks.
- Endpoints are plain `def`, not `async def`, because pymongo, redis-py, boto3 and the Razorpay SDK all block; FastAPI runs them in a threadpool. Do not call those clients from an `async def` route — it blocks the event loop. The webhook needs the raw body, so it takes the async `raw_request_body` dependency while staying a sync function.
- Request bodies are Pydantic models whose fields are `Optional` with `None` defaults, so the endpoints' own ordered checks produce the existing 400 messages instead of generic validation errors.
- Status code conventions to use for new/changed endpoints: 400 invalid input/date/id format, 401 bad/expired token, 403 not the resource owner, 404 missing turf/booking/user, 409 slot already taken or duplicate resource, 500 unexpected (safe message only, no tracebacks/secrets), 502/503 provider (Razorpay) unavailable.
- Signup (`apis/auth.py`): requires `email`, `mobile`, `full_name`, `password` (≥8 chars); email lowercased/trimmed; mobile validated with `phonenumbers`; password hashed via `PWD_CONTEXT`. Never return password hashes.

### Auth model

- Tokens are issued and verified in `helpers/jwt_service.py` (PyJWT). Claims: `sub` (user id), `type` (`access`/`refresh`), `jti`, `fresh`, `iat`, `nbf`, `exp`. Access tokens are signed with `JWT_ACCESS_SECRET` and refresh tokens with `JWT_REFRESH_SECRET`, so rotating either secret invalidates only that kind of token.
- Access token: short-lived JWT returned in the login response body; the frontend keeps it only in Redux memory (`auth.token`).
- Refresh token: httpOnly cookie (`refresh_token`, path `/`, `SameSite` and `Secure` from `JWT_COOKIE_SAMESITE`/`JWT_COOKIE_SECURE`) set by `/api/auth/user-login`. Redis key `login_session:{user_id}` tracks the active session; logout deletes it and unsets the cookie.
- `/api/auth/user-logout` needs **both** the bearer access token and the refresh cookie; a missing/invalid cookie returns 401. Only `user-signup`, `user-login`, `refresh`, `/health-check` and the Razorpay webhook are public.
- Frontend `src/lib/api.ts` is the shared axios instance: attaches the bearer token from the store, and on a 401 performs a single de-duplicated `/api/auth/refresh` (then rehydrates user data via `/api/auth/current-user-data`) and retries; on failure redirects to `/login`.
- `App.tsx` `ProtectedRoute`/`PublicRoute` call `tryRefreshSession()` on mount when there's no token in the store, so a page reload restores the session from the cookie.

### Data

MongoDB collections: `users`, `turfs`, `bookings`, `payment_events` (webhook audit/dedup). Documents use a string public identifier (shortuuid, e.g. `turf_...`; `id` on turfs, `user_id` on users) and queries project out `_id`. Turf images live in S3 under keys stored on the turf doc (`thumbnail`, etc.).

Turf details (`GET /api/turfs/turf-details/<turf_id>?date=DD-MM-YYYY`) splits the day into 30-minute slots and marks those overlapping `confirmed` bookings unavailable. Dates before today return 400 ("That date is in the past.", checked in `get_turf_availability` after the turf lookup, so an unknown turf is still 404 and the chatbot's `get_availability` gets the check too); for today, slots that already started come back `available: false, past: true` (every slot carries a `past` flag) and the UI labels them "Passed" rather than "Booked"; "today" is `venue_now()` from `helpers/venue_time.py` (Asia/Kolkata, naive). There is no upper bound on the date server-side: the rolling 7-day booking window (today + next 6 days) is a frontend-only choice in `TurfDetails.tsx` (`BOOKING_WINDOW_DAYS`, a row of date chips built from the venue date via `getVenueToday()` in `src/lib/turfBooking.ts`, rolled forward every minute and on tab focus so a tab left open past midnight stays valid; `turfDetailsSlice` ignores out-of-order responses via `latestRequestId`), so the max booking horizon is still an open decision. Booking creation (`POST /api/bookings/create-booking`, body `turf_id`, `booking_date` `DD-MM-YYYY`, `booking_start_time`/`booking_end_time` `HH:MM`) treats an end time of `00:00` as the next day (the last slot), returns 400 if the start time has already passed ("That time is in the past."), 404 for an unknown turf, 400 if `price_per_hour` is missing/non-positive or end ≤ start, 409 if it overlaps a `confirmed`/`payment_pending` booking, prices it in whole rupees as `round(price_per_hour × hours)` plus a platform fee `max(MINIMUM_PLATFORM_FEE ₹9, round(subtotal × PLATFORM_FEE_RATE 3%))` using half-up rounding (`round_half_up`) to match `calculateBookingTotals` in `src/lib/turfBooking.ts` — keep the two in sync, creates a Razorpay order (failure → 502 via `PaymentProviderError`), inserts the booking as `payment_pending`, and returns `order_id` + `booking_id`. The frontend (`pages/TurfDetails.tsx`) checks that `window.Razorpay` and the key are available *before* calling create-booking (so a blocked checkout never leaves an unpaid booking), refreshes slots on a 409, then opens Razorpay checkout; its success handler posts `booking_id`, `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature` to `POST /api/bookings/verify-payment`, which checks the booking belongs to the caller and matches the order, verifies the signature with `RAZORPAY_KEY_SECRET`, and confirms via a conditional `payment_pending` → `confirmed` update (idempotent; 409 if the booking is in another state). Razorpay clients come from `get_razorpay_client()` and confirmation goes through `mark_booking_confirmed()` (both in `apis/bookings.py`), shared with the webhook. `GET /api/bookings/booking-details/<booking_id>` returns the caller's booking (`status`, `booking_date`, `booking_start_time`/`booking_end_time`, `amount`, …) for status polling; other users' bookings return 404. If verify-payment fails, `TurfDetails.tsx` (`waitForBookingConfirmation`) polls it every 3 s for up to 20 attempts, stops on `confirmed` or any non-pending status, and otherwise tells the user the booking will update shortly. On confirmation the page clears the selection and refetches slots. Dates/times are parsed as naive local times and stamped UTC.

**Razorpay webhook** (`POST /api/webhook/razorpay`, public, no JWT): verifies `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`), dedupes by `X-Razorpay-Event-Id` in the `payment_events` collection, and for `payment.captured`/`order.paid` checks the paid amount (paise) equals `booking.amount × 100` before confirming. `payment.failed` is recorded only (booking stays pending). Every handled event is stored with an `outcome` (`confirmed`, `already_confirmed`, `amount_mismatch`, `booking_not_found`, `paid_in_status_<status>`, …); `paid_in_status_expired` means money was taken for an expired booking and needs a refund/reconciliation. Returns 500 on processing errors so Razorpay retries. Local testing needs a tunnel (`ngrok http 8000`) registered in the Razorpay test dashboard.

### RAG chatbot (in progress)

Learning-oriented feature, built in stages: basic LLM chat → RAG → user agent with tools → admin agent. Stages 2–3 are built: `/api/chat` runs a user agent (RAG is one of its tools) behind a frontend chat widget. The admin agent is not built:

- Vector DB is **Chroma** (`turf-chroma` service, image tag pinned to match `chromadb` in `requirements.txt`; data in the `chroma_data` volume). Collection `turfbook_kb` (cosine).
- Get it via `helpers/chroma_client.py` (`get_chroma_client()`, `get_kb_collection()`, usable as FastAPI dependencies), not `config.py`: `chromadb.HttpClient` connects on construction, so it is created lazily and the API still starts when Chroma is down.
- Embeddings: Chroma's default embedding function (local `all-MiniLM-L6-v2`, ~80 MB downloaded on first use, cached in the `chroma_model_cache` volume). Changing the model means re-ingesting everything.
- Chroma is derived data only. Sources of truth: hand-written markdown in `backend/rag/knowledge/` (`booking_rules.md`, `payments.md`, `faq.md`) and the `turfs` collection. Turf chunks should include `owner_contact` (name + phone): sharing it in chat is approved, since cancellations go through the owner. Availability and opening-hours questions must be answered from live slot data (turf-details logic), never from the knowledge base. Replace `SUPPORT_EMAIL_PLACEHOLDER` in the knowledge files once a support address exists. Rebuild with `python -m rag.build_kb` (from `backend/` or inside `turf-backend`; RAG code goes in `backend/rag/`): one chunk per `## ` section (id `faq.md#2`) and one per turf (id `turf_<id>#0`), upserted by stable id, and chunks whose source is gone are deleted. Check retrieval (no LLM) with `python -m rag.query_kb ["question"] [-k N] [--source knowledge|turf]`, which prints the top chunks with cosine distances.
- LLM: OpenRouter through the `openai` SDK (`get_llm_client()` in `rag/chat.py`, lazy like the Chroma client). Free `:free` models share an upstream quota and often return 429 (surfaced as 503); there is no fallback model list. `rag/chat.py` `answer(question)` retrieves the top 4 chunks, drops those with cosine distance > 0.6, skips the LLM entirely when nothing is left (fixed "don't know" reply), otherwise prompts the model to answer only from the context and returns `{answer, sources}`. Try it with `python -m rag.chat "question"`. Chroma or LLM failures (incl. 429 and missing key/model) are raised as `AssistantUnavailable`.
- `POST /api/chat` (`apis/chat.py`, auth required): body `{message}` (trimmed, 1–1000 chars, else 400) → `rag/agent.py` `run_agent()` → 200 `{status: true, answer, sources}` (sources = knowledge chunk ids the agent searched); `AssistantUnavailable` (LLM/Chroma down, 429, missing key/model, or a 200 with no `choices`) → 503 `{status: false, error}`; anything else → 500. Stateless: no chat history is sent or stored. `rag/chat.py` `answer()` (plain RAG, no tools) is kept for experiments.
- Agent (`rag/agent.py`): tool-calling loop (max 6 LLM rounds, then a fallback answer) with a system prompt that includes today's date. "Now" comes from `venue_now()` in `helpers/venue_time.py` (Asia/Kolkata, naive, matching how slot times are stored); this is an assumption while the venue timezone is still an open decision. The OpenRouter client uses a 20 s timeout and 1 retry, since one chat can make several LLM calls on a worker thread. Try it with `python -m rag.agent <user_id> "question"`.
- Tools (`rag/tools.py`, all read-only): `search_knowledge_base`, `list_turfs`, `get_availability` (merged free ranges from `get_turf_availability` in `apis/turfs.py`, with end of day written as `24:00` so a free day reads `00:00-24:00`, not `00:00-00:00`; drops past slots today, refuses past dates; like the UI it counts only `confirmed` bookings as taken), `quote_price` (`parse_booking_window` + `calculate_amount`, same pricing as create-booking), `get_booking`, `list_my_bookings` (latest first, or `upcoming=true` for the next ones soonest first; `get_user_booking` / `list_user_bookings` in `apis/bookings.py`, shared with `booking-details`). `list_turfs` filters in Mongo and returns at most 20. Tools reuse these helpers; do not duplicate endpoint logic or call the API over HTTP.
- User-data rule: no tool schema has a user/email/phone parameter; the user comes only from `ToolContext.user_id`, filled from `current_user_id`. `run_tool` refuses any call carrying an identity argument with `OTHER_USER_MESSAGE`, another user's booking id reads as "not found", and the prompt tells the model to answer requests for other users' data with that same message. `run_tool` also validates arguments against each tool's schema (known keys, required, JSON types, enums), which keeps Mongo operators like `{"$ne": ...}` out of queries. Tool errors come back as `{"error": ...}` for the model to explain or retry; unexpected exceptions are logged. `razorpay_order_id` is stripped from tool results.
- Tests: `tests/test_chat.py` (endpoint, plain RAG) and `tests/test_agent.py` (tools against Mongo, agent loop with a scripted fake LLM, privacy cases).
- Not built yet: per-user rate limit on `/api/chat` (each message can make up to 6 LLM calls), chat history, streaming, write tools (an agent may create a `payment_pending` booking but never confirm one), admin agent, booking-history HTTP endpoint (`list_user_bookings` exists for it).

### Domain rules

- Treat booking intervals as half-open `[start, end)`: overlap is `A.start < B.end AND A.end > B.start`. Adjacent bookings (one ends 18:00, next starts 18:00) must not conflict, and a midnight-starting booking belongs only to the next date.
- Displayed availability is advisory; booking creation must re-check. The current `find_one` then `insert_one` is not race-safe; prefer an atomic reservation design when touching this.
- Payment: Razorpay secret stays backend-only; a booking is confirmed only after server-side signature verification (and idempotent webhook handling), never because the frontend reports success. Pending-payment bookings need expiry/cleanup.
- Never trust a client-supplied `user_id`; take it from the `current_user_id` dependency.
- Razorpay calls from the backend container have previously failed with `Network is unreachable`, which was a container outbound-network problem, not a bad request.

### Open product decisions

Still undecided (ask rather than assume): venue timezone/storage convention, whether bookings may cross midnight, fixed slots vs. arbitrary-duration bookings, booking status lifecycle and payment timeout, whether listing/details should be public, whether mobile must be unique and email verification is required, refresh-token rotation and multi-device login policy, turf-owner/admin workflows, the support email address (`SUPPORT_EMAIL_PLACEHOLDER` in `backend/rag/knowledge/`), and production hosting/secret management.

### Testing priorities

`backend/tests/` covers signup/login validation and duplicate email, missing/malformed tokens, refresh and logout, turf listing/pagination, slot availability (adjacent bookings, pending vs confirmed, other dates, midnight, past dates), booking creation (pricing, platform-fee minimum, past dates, conflicts, provider failure → 502), payment verification (signature failure, idempotency, ownership) and the webhook (signature, duplicate event, amount mismatch, `payment.failed`, `paid_in_status_expired`). Date-dependent API tests run against a frozen clock (autouse `fixed_venue_now` in `tests/conftest.py`, now = 20-10-2026; `test_agent.py` pins its own). Still missing: two concurrent bookings for the same slot (only one may succeed) and token expiry. Frontend (`pages/TurfDetails.test.tsx`, `store/turfDetailsSlice.test.ts`, `lib/turfBooking.test.ts`): 7 date chips with today selected, date change clears selected slots and refetches, midnight rollover, "Passed" vs "Booked" labels, stale-response guard, venue-timezone date; still to test: 409 conflict refreshes slots, confirmation shown only after backend confirms.

### Roadmap (remaining work)

1. Turf discovery: input validation/404s, indexes (unique `users.email`, `users.user_id`, `turfs.id`), real S3 URLs (currently a placeholder `s3_base_url` in `apis/turfs.py`).
2. Availability correctness: operating hours per turf, timezone convention, half-open boundaries, midnight tests.
3. Booking lifecycle: statuses (`payment_pending` → `confirmed` / `expired` / `payment_failed` / `cancelled`), booking history endpoint (no booking-history endpoint yet), concurrency-safe reservation, pending expiry.
4. Payments: `booking-details` should query Razorpay `order.fetch` while pending; reconciliation job for stuck/late payments (confirm, expire, or refund `paid_in_status_expired`); unique index on `payment_events.event_id`.
5. Hardening: rate limiting, CSRF strategy for refresh cookie, no tracebacks in responses, Jenkins pipeline.

### Frontend structure

- Assistant chat: `src/components/ChatWidget.tsx` is mounted once in `App.tsx` outside `<Routes>` and renders only when `auth.token` is set. The conversation is local component state (display-only, dropped on logout because the panel unmounts). The `/api/chat` contract (`sendChatMessage`, `ChatError` kinds `busy`=503 / `invalid`=400 / `generic`) lives only in `src/lib/chat.ts`. Answers are rendered as plain text, never HTML; sources show raw chunk ids. Full-screen panel on phones, no focus trap yet.
- Pages in `src/pages/`, routed in `App.tsx` (`/`, `/turfs/:turfId`, `/login`, `/signup`).
- Redux store `src/store/` slices: `auth`, `userData`, `turfDetails` (async thunks call `api`). Use `useAppSelector` from `src/hooks`.
- Booking/slot helpers and response types in `src/lib/turfBooking.ts`.
- `src/components/ui/` is generated shadcn-ui code (config in `components.json`); add components via the shadcn CLI rather than hand-writing.
- Path alias `@` → `src/`.
- All HTTP goes through `src/lib/api.ts`; don't hard-code backend URLs in components. `VITE_*` vars are public — never put secrets in them.
- Forms: the project has both react-hook-form/zod and Formik/yup installed; use one approach per form, matching neighbouring forms.
- Booking UI must load slots from the backend, clear selection when date/turf changes, handle loading/empty/error/conflict states, and not show "Booking Confirmed" until the backend confirms. `components/BookingForm.tsx` is an older local-slot prototype (posts to unregistered `/api/bookings`); the real flow lives in `pages/TurfDetails.tsx`.
