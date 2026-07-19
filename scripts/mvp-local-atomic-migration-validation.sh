#!/usr/bin/env bash

# Validates the current migration chain in an isolated local Supabase project.
# It never connects to a remote Supabase project or reads staging credentials.
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly SUPABASE_VERSION="2.109.1"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Local Supabase validation requires Docker Desktop (or another running Docker daemon)." >&2
  exit 2
fi

SANDBOX_DIR="$(mktemp -d "${TMPDIR:-/tmp}/arch9-mvp-atomic-XXXXXX")"
LOCAL_STARTED=false

cleanup() {
  if [ "$LOCAL_STARTED" = true ]; then
    npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" stop --no-backup >/dev/null 2>&1 || true
  fi
  rm -rf "$SANDBOX_DIR"
}
trap cleanup EXIT

mkdir -p "$SANDBOX_DIR/supabase"
cp -R "$REPOSITORY_ROOT/supabase/." "$SANDBOX_DIR/supabase/"
rm -rf "$SANDBOX_DIR/supabase/.temp"

npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" start
LOCAL_STARTED=true
npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" db reset --local --no-seed

STATUS_ENV="$(npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" status --output env)"
API_URL="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^API_URL=//p' | tr -d '"' | head -n 1)"
SERVICE_ROLE_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^SERVICE_ROLE_KEY=//p' | tr -d '"' | head -n 1)"

if [ -z "$API_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "Could not obtain local API_URL and SERVICE_ROLE_KEY from Supabase status." >&2
  exit 2
fi

FAILURES=()
probe_select() {
  local table_name="$1"
  local column_name="$2"
  local response_file
  local http_code
  response_file="$(mktemp "${TMPDIR:-/tmp}/arch9-mvp-atomic-response-XXXXXX")"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    "$API_URL/rest/v1/$table_name?select=$column_name&limit=0")"
  if [ "$http_code" != "200" ]; then
    FAILURES+=("missing or unreadable $table_name.$column_name (HTTP $http_code: $(tr '\n' ' ' < "$response_file" | cut -c1-180))")
  fi
  rm -f "$response_file"
}

for column_name in \
  creation_idempotency_key property_tenure seller_type seller_has_existing_bond existing_bond \
  cancellation_required vat_treatment routing_profile_version routing_profile_json otp_packet_id \
  commission_snapshot_id gross_commission_percentage gross_commission_amount \
  agent_split_percentage_snapshot agency_split_percentage_snapshot agent_commission_amount \
  agency_commission_amount mandate_packet_id; do
  probe_select transactions "$column_name"
done

probe_select transaction_participant_requirements id

RPC_RESPONSE_FILE="$(mktemp "${TMPDIR:-/tmp}/arch9-mvp-atomic-rpc-XXXXXX")"
RPC_HTTP_CODE="$(curl -sS -o "$RPC_RESPONSE_FILE" -w '%{http_code}' \
  -X POST "$API_URL/rest/v1/rpc/bridge_create_mvp_transaction" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"p_payload":{}}')"
RPC_RESPONSE="$(tr '\n' ' ' < "$RPC_RESPONSE_FILE")"
rm -f "$RPC_RESPONSE_FILE"

if [ "$RPC_HTTP_CODE" = "404" ] || [[ "$RPC_RESPONSE" == *"PGRST202"* ]]; then
  FAILURES+=("bridge_create_mvp_transaction(p_payload jsonb) did not resolve (HTTP $RPC_HTTP_CODE: ${RPC_RESPONSE:0:180})")
fi

if [ "${#FAILURES[@]}" -gt 0 ]; then
  printf '%s\n' 'Local atomic migration validation failed:' >&2
  printf '%s\n' "${FAILURES[@]}" >&2
  exit 1
fi

echo "Local atomic migration validation passed."
