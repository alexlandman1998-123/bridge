#!/usr/bin/env bash

# Validates the current migration chain in an isolated local Supabase project.
# It never connects to a remote Supabase project or reads staging credentials.
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly SUPABASE_VERSION="2.109.1"
# Process-local opt-out avoids unrelated telemetry shutdown failures. It does
# not change the user's persisted CLI settings.
export SUPABASE_TELEMETRY_DISABLED=1

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Local Supabase validation requires Docker Desktop (or another running Docker daemon)." >&2
  exit 2
fi

DOCKER_ENDPOINT="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
case "$DOCKER_ENDPOINT" in
  unix://*|tcp://127.0.0.1:*|tcp://localhost:*) ;;
  *) echo "Local validation requires a local Docker endpoint." >&2; exit 2 ;;
esac
# The stack's image downloads can fill a small host filesystem even when the
# VM reports a large virtual disk. Fail before creating a sandbox or pulling.
AVAILABLE_KIB="$(df -Pk "${TMPDIR:-/tmp}" | awk 'END { print $4 }')"
if ! [[ "$AVAILABLE_KIB" =~ ^[0-9]+$ ]] || [ "$AVAILABLE_KIB" -lt 10485760 ]; then
  echo "Local migration validation requires at least 10 GiB free on the host filesystem." >&2
  exit 2
fi

SANDBOX_DIR="$(mktemp -d "${TMPDIR:-/tmp}/arch9-mvp-atomic-XXXXXX")"
LOCAL_STARTED=false
NETWORK_CREATED=false
readonly LOCAL_PROJECT_ID="$(basename "$SANDBOX_DIR")"
readonly LOCAL_NETWORK_ID="${LOCAL_PROJECT_ID}-network"

cleanup() {
  if [ "$LOCAL_STARTED" = true ]; then
    npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" stop --no-backup >/dev/null 2>&1 || true
  fi
  if [ "$NETWORK_CREATED" = true ]; then
    docker network rm "$LOCAL_NETWORK_ID" >/dev/null 2>&1 || true
  fi
  rm -rf "$SANDBOX_DIR"
}
trap cleanup EXIT

# Start from the CLI's local defaults. Never copy production SMTP, function,
# Vault, seed, linked-project or environment configuration into this sandbox.
npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" init >/dev/null
mkdir -p "$SANDBOX_DIR/supabase/migrations"
cp -R "$REPOSITORY_ROOT/supabase/migrations/." "$SANDBOX_DIR/supabase/migrations/"
node - "$SANDBOX_DIR/supabase/config.toml" "$LOCAL_PROJECT_ID" <<'NODE'
const fs = require('node:fs')
const net = require('node:net')
const [configPath, projectId] = process.argv.slice(2)
const servers = []
;(async () => {
  const ports = []
  for (let index = 0; index < 6; index++) {
    const server = net.createServer()
    await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, '127.0.0.1', resolve) })
    servers.push(server)
    ports.push(server.address().port)
  }
  let config = fs.readFileSync(configPath, 'utf8').replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`)
  const edit = (section, key, value) => {
    const header = `[${section}]`
    const start = config.indexOf(header)
    if (start < 0) throw new Error(`Missing local config section: ${section}`)
    const next = config.indexOf('\n[', start + header.length)
    const end = next < 0 ? config.length : next
    const body = config.slice(start, end)
    const pattern = new RegExp(`^${key}\\s*=.*$`, 'm')
    if (!pattern.test(body)) throw new Error(`Missing local config key: ${section}.${key}`)
    config = config.slice(0, start) + body.replace(pattern, `${key} = ${value}`) + config.slice(end)
  }
  edit('api', 'port', ports[0])
  edit('db', 'port', ports[1])
  edit('db', 'shadow_port', ports[2])
  edit('studio', 'port', ports[3])
  edit(config.includes('[local_smtp]') ? 'local_smtp' : 'inbucket', 'port', ports[4])
  edit('analytics', 'port', ports[5])
  edit('db', 'major_version', 17)
  edit('db.migrations', 'enabled', 'false')
  edit('db.seed', 'enabled', 'false')
  edit('studio', 'enabled', 'false')
  edit('analytics', 'enabled', 'false')
  edit('edge_runtime', 'enabled', 'false')
  fs.writeFileSync(configPath, config)
})().catch(error => { console.error(error.message); process.exitCode = 2 }).finally(() => servers.forEach(server => server.close()))
NODE

# An internal network blocks outbound calls from jobs or SQL in the historical
# migrations. Image downloads occur through Docker, outside this network.
docker network create --internal "$LOCAL_NETWORK_ID" >/dev/null
NETWORK_CREATED=true
LOCAL_STARTED=true
if ! npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" --network-id "$LOCAL_NETWORK_ID" start > "$SANDBOX_DIR/start.log" 2>&1; then
  echo "Local migration validation could not start its isolated stack." >&2
  node - "$SANDBOX_DIR/start.log" <<'NODE'
const fs = require('node:fs')
const log = fs.readFileSync(process.argv[2], 'utf8')
const categories = [
  ['image_download', /failed to pull|pull access denied|manifest unknown|download.*failed/i],
  ['container_health', /unhealthy|not healthy|not ready|health check.*fail/i],
  ['connection', /connection refused|network is unreachable|timed out|timeout|no such host/i],
  ['config', /invalid config|failed to parse|unsupported.*version|unknown.*field/i],
  ['permission', /permission denied|operation not permitted/i],
  ['mount', /mounts denied|mount.*does not exist|invalid mount/i],
].filter(([, pattern]) => pattern.test(log)).map(([category]) => category)
const sqlState = log.match(/SQLSTATE\s+([A-Z0-9]{5})/)?.[1]
const containers = [...new Set(log.match(/supabase_[a-z0-9_]+_[a-z0-9-]+/gi) || [])]
console.error(JSON.stringify({ stage: 'start', categories, sqlState: sqlState || null, containers }))
NODE
  exit 2
fi
# Prevent historical scheduled jobs from running while the chain is replayed.
docker exec "supabase_db_${LOCAL_PROJECT_ID}" psql -U postgres -d postgres -c "alter system set cron.launch_active_jobs = 'off'" >/dev/null
docker exec "supabase_db_${LOCAL_PROJECT_ID}" psql -U postgres -d postgres -c 'select pg_reload_conf()' >/dev/null
node - "$SANDBOX_DIR/supabase/config.toml" <<'NODE'
const fs = require('node:fs')
const configPath = process.argv[2]
const config = fs.readFileSync(configPath, 'utf8')
fs.writeFileSync(configPath, config.replace(/(\[db\.migrations\][\s\S]*?enabled\s*=\s*)false/, '$1true'))
NODE
if ! npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" db reset --local --no-seed > "$SANDBOX_DIR/replay.log" 2>&1; then
  echo "Local migration replay failed; the isolated stack will be removed." >&2
  # Print only migration locations/error codes, never CLI credentials or SQL.
  node - "$SANDBOX_DIR/replay.log" <<'NODE'
const fs = require('node:fs')
const log = fs.readFileSync(process.argv[2], 'utf8')
const migration = [...log.matchAll(/Applying migration ([0-9]+_[a-z0-9_]+\.sql)/g)].at(-1)?.[1]
const sqlState = log.match(/SQLSTATE\s+([A-Z0-9]{5})/)?.[1]
console.error(JSON.stringify({ failedMigration: migration || null, sqlState: sqlState || null }))
NODE
  exit 1
fi

STATUS_ENV="$(npx --yes "supabase@${SUPABASE_VERSION}" --workdir "$SANDBOX_DIR" status --output env)"
API_URL="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^API_URL=//p' | tr -d '"' | head -n 1)"
SERVICE_ROLE_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^SERVICE_ROLE_KEY=//p' | tr -d '"' | head -n 1)"

if [ -z "$API_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "Could not obtain local API_URL and SERVICE_ROLE_KEY from Supabase status." >&2
  exit 2
fi

node - "$API_URL" "$SANDBOX_DIR/supabase/config.toml" <<'NODE'
const fs = require('node:fs')
const url = new URL(process.argv[2])
const config = fs.readFileSync(process.argv[3], 'utf8')
const apiPort = config.match(/\[api\][\s\S]*?^port\s*=\s*(\d+)/m)?.[1]
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== apiPort) {
  console.error('Local validation refused a non-sandbox API target.')
  process.exit(2)
}
NODE

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
