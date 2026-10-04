# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TurfBook is a turf (sports ground) booking platform. It is split into two independently-run apps in one repo:

- **Frontend** (repo root, `src/`): Vite + React 18 + TypeScript, shadcn-ui (Radix + Tailwind), Redux Toolkit, axios. Originally scaffolded with Lovable (`lovable-tagger` plugin in dev mode).
- **Backend** (`backend/`): Flask + Flask-RESTful + flask-jwt-extended, MongoDB (pymongo), Redis, S3 (boto3), Razorpay for payments.

Main integration branch is `dev`.

**Target user journey:** sign up / log in → browse turfs → open a turf → pick a date and see its 30-minute slot availability → select slots and book → pay via Razorpay (backend creates order, verifies payment) → booking confirmed → view booking history.

**Out of scope unless explicitly added:** live location tracking, chat, tournaments, team formation, social features. Turf-owner/admin management, cancellations/refunds are planned extensions, not built.

Background handover doc (product goals, roadmap, security checklist): `~/Downloads/TURF_PROJECT_DOCUMENTATION.md`. Its implementation details predate the current code (it describes a FastAPI `bookings.py`, `/api/auth/login`, `/api/me`, Uvicorn) — trust the code over it.

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
docker compose up --build    # backend (gunicorn w/ reload, port 8000) + mongo:6 + redis:7 (+ jenkins on 8080)
python scripts/insert_turfs.py   # seed a turf document into Mongo (edit values in the script)
```

Inside Compose, services reach Mongo/Redis by service name (`turf-mongo`, `turf-redis`); from the host (e.g. MongoDB Compass) use `localhost:27017`. The database is `turfbook` with collections `users`, `turfs`, `bookings`.

The compose file mounts `backend/` into the container, so code changes hot-reload. Note the Jenkins service also binds port 8080, which collides with the Vite dev server.

Backend modules use flat imports (`from apis.turfs import ...`, `from helpers...`), so run Python from inside `backend/` (the Dockerfile sets `PYTHONPATH=/app`).

## Environment

- Frontend: `.env` at repo root (see `.env.example`): `VITE_API_BASE`, `VITE_RAZORPAY_KEY_ID`, `VITE_APP_NAME`. `src/env.ts` (imported first in `main.tsx`) maps these onto `process.env.API_BASE` / `RAZORPAY_KEY_ID` / `APP_NAME`; frontend code reads `process.env.*`, not `import.meta.env` directly.
- Backend: `backend/.env` (see `backend/.env.example`): Mongo, JWT secrets/expiry, Redis, AWS/S3, Razorpay keys (`RAZORPAY_API_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`), `FRONTEND_ORIGINS` for CORS. `docker compose restart` does not reread `.env`; use `docker compose up -d --force-recreate turf-backend`.

## Architecture

### Backend request flow

- `app.py` builds the Flask app, loads `config.APP_CONFIG` into `app.config`, and mounts a Flask-RESTful `Api` at `/api/`. Gunicorn entrypoint is `app:flask_app`.
- `config.py` creates **shared singleton clients** (Mongo DB, Redis, passlib context) at import time and puts them in `APP_CONFIG`. Resources fetch them via `current_app.config['MONGO_DB']`, `['REDIS_CLIENT']`, etc. in `__init__`.
- `routers.py` is the single place where Resource classes are registered to URL paths (`auth/...`, `turfs/...`, `bookings/...`, and `webhook/...` for calls from external services, implemented in `apis/webhooks.py`). Adding an endpoint = write a `Resource` in `apis/` and `api.add_resource` it here.
- `middleware.py` sets up CORS and a global `before_request` that **requires a valid JWT access token (Authorization header) on every route** except those in `PUBLIC_PATHS`. The user id is exposed as `g.current_user_id`. New public endpoints must be added to `PUBLIC_PATHS`.
- Resources return `make_response({...}, status)` with a `status` field in the body; errors are logged with `logging.exception` and returned as 500.
- Status code conventions to use for new/changed endpoints: 400 invalid input/date/id format, 401 bad/expired token, 403 not the resource owner, 404 missing turf/booking/user, 409 slot already taken or duplicate resource, 500 unexpected (safe message only, no tracebacks/secrets), 502/503 provider (Razorpay) unavailable.
- Signup (`apis/auth.py`): requires `email`, `mobile`, `full_name`, `password` (≥8 chars); email lowercased/trimmed; mobile validated with `phonenumbers`; password hashed via `PWD_CONTEXT`. Never return password hashes.

### Auth model

- Access token: short-lived JWT returned in the login response body; the frontend keeps it only in Redux memory (`auth.token`).
- Refresh token: httpOnly cookie (`refresh_token`) set by `/api/auth/user-login`. Redis key `login_session:{user_id}` tracks the active session; logout deletes it and unsets the cookie.
- Frontend `src/lib/api.ts` is the shared axios instance: attaches the bearer token from the store, and on a 401 performs a single de-duplicated `/api/auth/refresh` (then rehydrates user data via `/api/auth/current-user-data`) and retries; on failure redirects to `/login`.
- `App.tsx` `ProtectedRoute`/`PublicRoute` call `tryRefreshSession()` on mount when there's no token in the store, so a page reload restores the session from the cookie.

### Data

MongoDB collections: `users`, `turfs`, `bookings`, `payment_events` (webhook audit/dedup). Documents use a string public identifier (shortuuid, e.g. `turf_...`; `id` on turfs, `user_id` on users) and queries project out `_id`. Turf images live in S3 under keys stored on the turf doc (`thumbnail`, etc.).

Turf details (`GET /api/turfs/turf-details/<turf_id>?date=DD-MM-YYYY`) splits the day into 30-minute slots and marks those overlapping `confirmed` bookings unavailable. Booking creation (`POST /api/bookings/create-booking`, body `turf_id`, `booking_date` `DD-MM-YYYY`, `booking_start_time`/`booking_end_time` `HH:MM`) treats an end time of `00:00` as the next day (the last slot), returns 404 for an unknown turf, 400 if `price_per_hour` is missing/non-positive or end ≤ start, 409 if it overlaps a `confirmed`/`payment_pending` booking, prices it in whole rupees as `round(price_per_hour × hours)` plus a platform fee `max(MINIMUM_PLATFORM_FEE ₹9, round(subtotal × PLATFORM_FEE_RATE 3%))` using half-up rounding (`round_half_up`) to match `calculateBookingTotals` in `src/lib/turfBooking.ts` — keep the two in sync, creates a Razorpay order (failure → 502 via `PaymentProviderError`), inserts the booking as `payment_pending`, and returns `order_id` + `booking_id`. The frontend (`pages/TurfDetails.tsx`) checks that `window.Razorpay` and the key are available *before* calling create-booking (so a blocked checkout never leaves an unpaid booking), refreshes slots on a 409, then opens Razorpay checkout; its success handler posts `booking_id`, `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature` to `POST /api/bookings/verify-payment`, which checks the booking belongs to the caller and matches the order, verifies the signature with `RAZORPAY_KEY_SECRET`, and confirms via a conditional `payment_pending` → `confirmed` update (idempotent; 409 if the booking is in another state). Razorpay clients come from `get_razorpay_client()` and confirmation goes through `mark_booking_confirmed()` (both in `apis/bookings.py`), shared with the webhook. `GET /api/bookings/booking-details/<booking_id>` returns the caller's booking (`status`, `booking_date`, `booking_start_time`/`booking_end_time`, `amount`, …) for status polling; other users' bookings return 404. If verify-payment fails, `TurfDetails.tsx` (`waitForBookingConfirmation`) polls it every 3 s for up to 20 attempts, stops on `confirmed` or any non-pending status, and otherwise tells the user the booking will update shortly. On confirmation the page clears the selection and refetches slots. Dates/times are parsed as naive local times and stamped UTC.

**Razorpay webhook** (`POST /api/webhook/razorpay`, in `PUBLIC_PATHS`, no JWT): verifies `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`), dedupes by `X-Razorpay-Event-Id` in the `payment_events` collection, and for `payment.captured`/`order.paid` checks the paid amount (paise) equals `booking.amount × 100` before confirming. `payment.failed` is recorded only (booking stays pending). Every handled event is stored with an `outcome` (`confirmed`, `already_confirmed`, `amount_mismatch`, `booking_not_found`, `paid_in_status_<status>`, …); `paid_in_status_expired` means money was taken for an expired booking and needs a refund/reconciliation. Returns 500 on processing errors so Razorpay retries. Local testing needs a tunnel (`ngrok http 8000`) registered in the Razorpay test dashboard.

### Domain rules

- Treat booking intervals as half-open `[start, end)`: overlap is `A.start < B.end AND A.end > B.start`. Adjacent bookings (one ends 18:00, next starts 18:00) must not conflict, and a midnight-starting booking belongs only to the next date.
- Displayed availability is advisory; booking creation must re-check. The current `find_one` then `insert_one` is not race-safe; prefer an atomic reservation design when touching this.
- Payment: Razorpay secret stays backend-only; a booking is confirmed only after server-side signature verification (and idempotent webhook handling), never because the frontend reports success. Pending-payment bookings need expiry/cleanup.
- Never trust a client-supplied `user_id`; derive it from `g.current_user_id`.
- Razorpay calls from the backend container have previously failed with `Network is unreachable`, which was a container outbound-network problem, not a bad request.

### Open product decisions

Still undecided (ask rather than assume): venue timezone/storage convention, whether bookings may cross midnight, fixed slots vs. arbitrary-duration bookings, booking status lifecycle and payment timeout, whether listing/details should be public, whether mobile must be unique and email verification is required, refresh-token rotation and multi-device login policy, cancellation/refund policy, turf-owner/admin workflows, and production hosting/secret management.

### Testing priorities

No backend test suite exists yet. When adding tests, cover: signup/login validation and duplicate email; expired/missing tokens and refresh failure; turf not found / malformed id; availability boundaries (adjacent bookings, midnight, past dates, timezone); two concurrent bookings for the same slot (only one may succeed); payment signature failure, duplicate/delayed webhooks, amount mismatch. Frontend: date change clears selected slots, 409 conflict refreshes slots, confirmation shown only after backend confirms.

### Roadmap (remaining work)

1. Turf discovery: input validation/404s, indexes (unique `users.email`, `users.user_id`, `turfs.id`), real S3 URLs (currently a placeholder `s3_base_url` in `apis/turfs.py`).
2. Availability correctness: operating hours per turf, timezone convention, half-open boundaries, midnight tests.
3. Booking lifecycle: statuses (`payment_pending` → `confirmed` / `expired` / `payment_failed` / `cancelled`), booking history endpoint (`ListBookings` route is commented out in `routers.py`), concurrency-safe reservation, pending expiry.
4. Payments: `booking-details` should query Razorpay `order.fetch` while pending; reconciliation job for stuck/late payments (confirm, expire, or refund `paid_in_status_expired`); unique index on `payment_events.event_id`.
5. Hardening: backend test suite (only an ad-hoc `test_razorpar.py` script exists), rate limiting, CSRF strategy for refresh cookie, no tracebacks in responses, Jenkins pipeline.

### Frontend structure

- Pages in `src/pages/`, routed in `App.tsx` (`/`, `/turfs/:turfId`, `/login`, `/signup`).
- Redux store `src/store/` slices: `auth`, `userData`, `turfDetails` (async thunks call `api`). Use `useAppSelector` from `src/hooks`.
- Booking/slot helpers and response types in `src/lib/turfBooking.ts`.
- `src/components/ui/` is generated shadcn-ui code (config in `components.json`); add components via the shadcn CLI rather than hand-writing.
- Path alias `@` → `src/`.
- All HTTP goes through `src/lib/api.ts`; don't hard-code backend URLs in components. `VITE_*` vars are public — never put secrets in them.
- Forms: the project has both react-hook-form/zod and Formik/yup installed; use one approach per form, matching neighbouring forms.
- Booking UI must load slots from the backend, clear selection when date/turf changes, handle loading/empty/error/conflict states, and not show "Booking Confirmed" until the backend confirms. `components/BookingForm.tsx` is an older local-slot prototype (posts to unregistered `/api/bookings`); the real flow lives in `pages/TurfDetails.tsx`.
