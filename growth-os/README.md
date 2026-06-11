# Momentum Growth OS

A content + leads + attribution platform that ties Instagram engagement →
survey responses → trial signups. Built with Next.js 14 (App Router),
TypeScript, Tailwind CSS, and Supabase.

This lives in the `growth-os/` subdirectory of the `momentum-os` repo and is
independent of the static-HTML app at the repo root.

## Stack

- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`) — SSR auth + Postgres + RLS
- Zod for input validation
- Server Actions for mutations

## Folder map

```
growth-os/
├── app/
│   ├── page.tsx                       # public landing
│   ├── login/                         # sign-in (server action)
│   ├── signup/                        # sign-up (server action)
│   ├── auth/callback/route.ts         # exchanges ?code= for a session
│   ├── auth/sign-out/route.ts         # POST sign-out
│   ├── dashboard/                     # auth-gated app
│   │   ├── layout.tsx                 # nav + sign out
│   │   ├── page.tsx                   # overview counts
│   │   ├── content/                   # list + create/delete (server actions)
│   │   ├── leads/                     # list + create + status update
│   │   └── attribution/               # event log (content → leads → trials)
│   └── api/webhooks/
│       ├── instagram/route.ts         # GET verify + POST events
│       ├── survey/route.ts            # POST survey submissions
│       └── trial/route.ts             # POST trial start/convert
├── lib/
│   ├── auth.ts                        # getUserId() helper
│   ├── supabase/                      # client / server / middleware / admin / env
│   └── webhooks/                      # verify / idempotency / resolveOwner
├── supabase/migrations/
│   ├── 0001_phase4_init.sql           # schema + handle_new_user trigger
│   └── 0002_phase4_rls.sql            # RLS policies
├── scripts/
│   ├── sign.mjs                       # HMAC-SHA256 signer
│   └── test-webhooks.sh               # curl smoke tests
├── tests/                             # Vitest unit + integration suites
└── middleware.ts                      # auth gate for /dashboard/*
```

## Environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (browser + SSR) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — webhook routes only, bypasses RLS |
| `SITE_URL` | Base URL for the email confirmation redirect (`http://localhost:3000` in dev) |
| `INSTAGRAM_VERIFY_TOKEN` | Token echoed back in Meta's GET handshake |
| `INSTAGRAM_APP_SECRET` | HMAC secret for `x-hub-signature-256` |
| `SURVEY_WEBHOOK_SECRET` | HMAC secret for the survey webhook |
| `TRIAL_WEBHOOK_SECRET` | HMAC secret for the trial webhook |
| `OWNER_USER_ID` | Single-tenant owner the webhooks attribute rows to |

Runtime env reads are gated behind functions in `lib/supabase/env.ts`, so
`npm run build` succeeds without real values.

## Local development

```bash
cd growth-os
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run build
```

## Testing

Tests use [Vitest](https://vitest.dev) (node environment). The default `npm test`
run is **unit-only** and never touches a database or the network — it mocks the
Supabase admin client and drives webhook route handlers with hand-built
`Request`s. The integration suite is opt-in (`RUN_INTEGRATION_TESTS=1`) and runs
against a real local Supabase stack.

```bash
cd growth-os
npm test                 # unit tests only — fast, no DB
npm run test:watch       # watch mode
npm run test:coverage    # unit tests + coverage (text + lcov)
npm run typecheck        # tsc --noEmit
```

### Coverage thresholds

Coverage is scoped differently per mode:

| Mode | `coverage.include` | Thresholds |
| --- | --- | --- |
| `npm test` (unit) | `lib/webhooks/**`, `app/api/webhooks/**` | lines 80 / functions 80 / branches 70 / statements 80 |
| `RUN_INTEGRATION_TESTS=1` (unit + integration) | `lib/**`, `app/auth/**`, `app/dashboard/**/actions.ts`, `app/api/webhooks/**` | lines 75 / functions 80 / branches 65 / statements 75 |

Branches are lower in integration mode because Next.js cookie/redirect code
paths are hard to fully exercise from a harness.

```
tests/
├── unit/
│   ├── verify.test.ts            # HMAC verify + sha256Hex
│   ├── idempotency.test.ts       # recordDelivery / markDelivery
│   ├── resolveOwner.test.ts      # owner resolution contract
│   ├── client.test.ts            # browser supabase client smoke
│   ├── helpers/supabaseMock.ts   # chainable Supabase client stub
│   └── webhooks/                 # instagram / survey / trial route handlers
└── integration/                  # gated behind RUN_INTEGRATION_TESTS=1
    ├── setup.ts                          # env + client/user/db helpers
    ├── global-setup.ts                   # fail-fast env + DB reachability check
    ├── helpers/fakeCookies.ts            # in-memory CookieAdapter
    ├── helpers/nextMocks.ts              # next/headers + redirect mocks
    ├── ssr.integration.test.ts           # server.ts + middleware.ts
    ├── auth.integration.test.ts          # signup/login/callback/sign-out + trigger
    ├── server-actions.integration.test.ts# content/leads actions + RLS + Zod
    ├── rls.integration.test.ts           # owner-isolation RLS across two JWTs
    └── webhooks.integration.test.ts      # signed survey ingest end-to-end
```

### Integration tests (local Supabase)

The integration suite proves the SSR helpers refresh/authenticate against real
cookies, the auth routes and profile trigger work end-to-end, the dashboard
server actions enforce `auth.uid()` ownership (rejecting client-supplied
`owner_id`) and Zod validation, RLS blocks cross-tenant access, and a signed
survey webhook ingests end-to-end. It needs a local Supabase stack (Docker) and
is **skipped by default**. Run it locally:

```bash
cd growth-os
supabase start                              # boots Postgres+GoTrue+… in Docker
RUN_INTEGRATION_TESTS=1 npm run test:integration
supabase stop                               # tear the stack down when done
```

`supabase start` applies `supabase/migrations/*.sql` automatically, so the DB is
ready as soon as it boots. The harness reads the CLI's local URL/keys (or the
well-known local defaults) — no real secrets. Between tests, `resetDb()`
truncates the domain tables over a direct Postgres connection
(`SUPABASE_DB_URL`, default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

## CI

`.github/workflows/growth-os-ci.yml` (at the repo root, path-filtered to
`growth-os/**`) runs lint, typecheck, unit tests with coverage, and build on
every PR and on pushes to `main`, `phase-4-auth-attribution`, and
`phase-5-tests-ci`. Integration tests are not yet wired into CI (they require a
dockerized Supabase service).

## Supabase setup

1. Create a Supabase project; copy the URL, anon key, and service-role key into
   `.env.local`.
2. Apply the migrations — either with the Supabase CLI:

   ```bash
   supabase db push
   ```

   or by pasting `supabase/migrations/0001_phase4_init.sql` then
   `0002_phase4_rls.sql` into the SQL editor (in that order).
3. Sign up through `/signup`. The `on_auth_user_created` trigger inserts a
   matching `public.profiles` row. Use that user's UUID as `OWNER_USER_ID`.

## Webhook configuration

All three endpoints verify an HMAC-SHA256 signature over the **raw** request
body before doing anything else, then record the delivery into
`webhook_deliveries` for idempotency.

| Endpoint | Method(s) | Signature header | Secret | Delivery id |
| --- | --- | --- | --- | --- |
| `/api/webhooks/instagram` | GET (verify), POST | `x-hub-signature-256` (`sha256=...`) | `INSTAGRAM_APP_SECRET` | signature value |
| `/api/webhooks/survey` | POST | `x-momentum-signature` | `SURVEY_WEBHOOK_SECRET` | `x-momentum-delivery-id` or sha256(body) |
| `/api/webhooks/trial` | POST | `x-momentum-signature` | `TRIAL_WEBHOOK_SECRET` | `x-momentum-delivery-id` or sha256(body) |

### Meta / Instagram verification

Point the Meta webhook at `https://<host>/api/webhooks/instagram` and set the
verify token to `INSTAGRAM_VERIFY_TOKEN`. Meta's GET handshake
(`hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`) returns the
challenge as plain text when the token matches.

### Sample signed requests

```bash
# survey
BODY='{"email":"lead@example.com","utm_campaign":"spring-launch","content_external_id":"IG_MEDIA_1"}'
SIG=$(printf '%s' "$BODY" | node scripts/sign.mjs "$SURVEY_WEBHOOK_SECRET")
curl -X POST http://localhost:3000/api/webhooks/survey \
  -H "content-type: application/json" \
  -H "x-momentum-signature: $SIG" \
  -H "x-momentum-delivery-id: survey-1" \
  --data "$BODY"
```

Or run the whole suite (server must be running, secrets exported):

```bash
bash scripts/test-webhooks.sh
```

Re-sending a POST with the same delivery id returns `{"ok":true,"duplicate":true}`.

## What each phase delivered

- **Phase 1–3** — Next.js + Supabase SSR scaffold, middleware auth gate,
  login/signup/callback/sign-out, dashboard layout, and content/leads/
  attribution pages backed by Zod-validated server actions.
- **Phase 4** — real Supabase email/password auth, two SQL migrations (schema +
  owner-isolation RLS) covering profiles/content/leads/trials/
  attribution_events/webhook_deliveries, and three HMAC-verified webhook routes
  with idempotency and a shared service-role admin client.
- **Phase 5** — Vitest unit tests (HMAC verify, idempotency, owner resolution,
  and all three webhook route handlers via mocked Supabase), a local-Supabase
  integration harness for migrations + RLS + end-to-end ingest, and a
  path-filtered GitHub Actions CI workflow (lint, typecheck, test, build).
