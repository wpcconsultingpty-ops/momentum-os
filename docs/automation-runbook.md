# Momentum Growth OS — Automation Runbook

Source of truth for the content automation stack. This documents how the pieces fit together so any deploy can be reproduced from scratch.

> SECURITY: Never commit API keys, tokens, or secrets to this repo. All keys live in environment variables (Vercel project settings) or n8n credential entries. Placeholders below use ALL_CAPS names.

## Stack overview

| Layer | Service | Purpose |
|-------|---------|---------|
| Frontend / app | Vercel (momentum-growth-os) | Dashboard + content views |
| Database / auth | Supabase | Users, attribution, content records |
| Workflow engine | n8n (wpcconsulting.app.n8n.cloud) | Orchestrates content -> AI -> video -> email |
| AI text | OpenAI API | Caption / coaching copy generation |
| AI video | HeyGen API (v3) | Avatar video generation |
| Social | Instagram (Meta for Developers) | Publishing target |
| Email | Gmail (via n8n node) | Human approval loop |

## Environment variables

Set these in Vercel > Project Settings > Environment Variables. Do NOT hardcode.

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-side only, never expose to client
OPENAI_API_KEY=
HEYGEN_API_KEY=
INSTAGRAM_APP_ID=1614593009612144
INSTAGRAM_APP_SECRET=
N8N_WEBHOOK_URL=
```

## n8n credentials (entered in n8n UI, never in git)

- OpenAI account credential -> used by the "Message a model" node
- Gmail OAuth2 credential -> used by both "Send a message" nodes
- HeyGen: HTTP Header Auth credential, header name `X-Api-Key`, value = HEYGEN_API_KEY

## Current workflow (as built)

Webhook -> Edit Fields -> HTTP Request -> Extract from PDF -> Switch (rules) -> 
multiple HTTP GET requests (raw.githubusercontent) -> OpenAI "Message a model" -> 
Code (JS) -> Gmail "Send a message" x2.

## Deploy / reproduce steps

1. Pull latest `main`.
2. In Vercel, confirm all env vars above are set for Production + Preview.
3. In n8n, open the workflow and confirm the three credentials resolve (no red node badges).
4. Trigger the Webhook node with a test payload; confirm an execution appears under Executions.
5. Confirm the approval email arrives in Gmail before anything is published.

## TODO / open items

- [ ] CI on `main` is currently failing (commit 552d98d) — investigate before next release.
- [ ] Add branch protection on `main`.
- [ ] Decide whether HeyGen video step is a separate node after OpenAI copy generation.
