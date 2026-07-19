import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(repoRoot, 'supabase/migrations/202607190001_mvp_seller_acceptance_canonical_creation_phase1.sql')
const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

assert.match(sql, /bridge_create_mvp_transaction\(jsonb_build_object/)
assert.match(sql, /creationpath', 'bridge_create_mvp_transaction'/)
assert.match(sql, /creation_idempotency_key/)
assert.match(sql, /participant_bootstrap/)
assert.match(sql, /document_bootstrap/)
assert.match(sql, /workflow_bootstrap/)
assert.doesNotMatch(sql, /insert\s+into\s+public\.transactions/)

console.log('MVP seller-acceptance canonical creation contract passed.')
