import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const map = JSON.parse(readFileSync(fileURLToPath(new URL('../release/production-migration-ledger-reconciliation-2026-09-06-classified.json', import.meta.url)), 'utf8'))
assert.equal(map.mode, 'read_only')
assert.equal(map.entries.every((entry) => typeof entry.classification === 'string'), true)
assert.equal(
  map.entries.every((entry) => [
    'already_applied_under_renamed_timestamp',
    'missing_locally_must_be_restored',
    'local_work_not_yet_deployed',
  ].includes(entry.classification)),
  true,
)
assert.equal(map.classificationSummary.obsolete_superseded, 0)
console.log('migration-ledger-classification: passed')
