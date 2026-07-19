import assert from 'node:assert/strict'
import fs from 'node:fs'

const harness = fs.readFileSync('../scripts/mvp-local-atomic-migration-validation.sh', 'utf8')
const record = fs.readFileSync('docs/audits/mvp-local-atomic-migration-validation-2026-07-19.md', 'utf8')

assert.match(harness, /mktemp -d .*arch9-mvp-atomic/)
assert.match(harness, /db reset --local --no-seed/)
assert.match(harness, /--workdir "\$SANDBOX_DIR"/)
assert.doesNotMatch(harness, /--linked/)
assert.match(harness, /agency_commission_amount mandate_packet_id/)
assert.match(harness, /bridge_create_mvp_transaction/)
assert.match(harness, /stop --no-backup/)
assert.match(record, /Docker is not installed or running/)

console.log('mvp-local-atomic-migration-validation: passed')
