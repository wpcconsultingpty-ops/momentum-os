#!/usr/bin/env bash
# Smoke test for the three webhook endpoints.
#
# Prereqs:
#   - Dev server running:  npm run dev   (defaults to http://localhost:3000)
#   - Secrets exported to match your .env:
#       export INSTAGRAM_APP_SECRET=...
#       export INSTAGRAM_VERIFY_TOKEN=...
#       export SURVEY_WEBHOOK_SECRET=...
#       export TRIAL_WEBHOOK_SECRET=...
#
# Usage:  bash scripts/test-webhooks.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGN="node ${SCRIPT_DIR}/sign.mjs"

echo "==> Instagram GET verification handshake"
curl -sS "${BASE_URL}/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${INSTAGRAM_VERIFY_TOKEN}&hub.challenge=test-challenge-123"
echo

echo "==> Instagram POST (signed with INSTAGRAM_APP_SECRET, sha256= prefix)"
IG_BODY='{"object":"instagram","entry":[{"id":"123","changes":[{"field":"comments","value":{"media_id":"IG_MEDIA_1","text":"love this"}}]}]}'
IG_SIG="sha256=$(printf '%s' "$IG_BODY" | ${SIGN} "${INSTAGRAM_APP_SECRET}")"
curl -sS -X POST "${BASE_URL}/api/webhooks/instagram" \
  -H "content-type: application/json" \
  -H "x-hub-signature-256: ${IG_SIG}" \
  --data "$IG_BODY"
echo

echo "==> Survey POST (signed with SURVEY_WEBHOOK_SECRET)"
SURVEY_BODY='{"email":"lead@example.com","full_name":"Sample Lead","ig_user_handle":"@sample","utm_campaign":"spring-launch","content_external_id":"IG_MEDIA_1"}'
SURVEY_SIG="$(printf '%s' "$SURVEY_BODY" | ${SIGN} "${SURVEY_WEBHOOK_SECRET}")"
curl -sS -X POST "${BASE_URL}/api/webhooks/survey" \
  -H "content-type: application/json" \
  -H "x-momentum-signature: ${SURVEY_SIG}" \
  -H "x-momentum-delivery-id: survey-delivery-1" \
  --data "$SURVEY_BODY"
echo

echo "==> Trial start POST (signed with TRIAL_WEBHOOK_SECRET)"
TRIAL_START_BODY='{"event":"trial_start","email":"lead@example.com","plan":"pro","utm_campaign":"spring-launch"}'
TRIAL_START_SIG="$(printf '%s' "$TRIAL_START_BODY" | ${SIGN} "${TRIAL_WEBHOOK_SECRET}")"
curl -sS -X POST "${BASE_URL}/api/webhooks/trial" \
  -H "content-type: application/json" \
  -H "x-momentum-signature: ${TRIAL_START_SIG}" \
  -H "x-momentum-delivery-id: trial-delivery-1" \
  --data "$TRIAL_START_BODY"
echo

echo "==> Trial convert POST"
TRIAL_CONVERT_BODY='{"event":"trial_convert","email":"lead@example.com","converted_to_paid":true}'
TRIAL_CONVERT_SIG="$(printf '%s' "$TRIAL_CONVERT_BODY" | ${SIGN} "${TRIAL_WEBHOOK_SECRET}")"
curl -sS -X POST "${BASE_URL}/api/webhooks/trial" \
  -H "content-type: application/json" \
  -H "x-momentum-signature: ${TRIAL_CONVERT_SIG}" \
  -H "x-momentum-delivery-id: trial-delivery-2" \
  --data "$TRIAL_CONVERT_BODY"
echo

echo "==> Done. Re-run any POST with the same delivery id to confirm idempotency ({\"ok\":true,\"duplicate\":true})."
