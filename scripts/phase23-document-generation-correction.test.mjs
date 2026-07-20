#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/202607200007_document_generator_least_privilege_h2_fix.sql', 'utf8')
const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const correction = manifest.rows.find((row) => row.version === '202607200007')
const original = manifest.rows.find((row) => row.version === '202607180049')

assert.match(migration, /revoke insert, update, delete, truncate, references, trigger/i)
for (const table of [
  'document_signing_field_layouts',
  'document_signing_dispatches',
  'legal_final_transaction_publications',
  'legal_final_completion_receipts',
  'legal_final_completion_retry_attempts',
]) assert.match(migration, new RegExp(table))
assert.match(migration, /from authenticated, anon/i)
assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)
assert.equal(correction?.dependsOn, '202607180048')
assert.equal(correction?.action, 'apply_original_after_dependency_check')
assert.equal(original?.dependsOn, '202607200007')
assert.equal(manifest.rows.length, 68)

console.log('Phase 23 document-generation corrective migration contract passed.')
