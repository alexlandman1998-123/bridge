#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/202607209903_transaction_participant_requirements_least_privilege_phase25_fix.sql', 'utf8')
const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const correction = manifest.rows.find((row) => row.version === '202607209903')
const historical = manifest.rows.find((row) => row.version === '202607180046')

assert.match(sql, /revoke all on table public\.transaction_participant_requirements from public, anon, authenticated/i)
assert.match(sql, /grant select on table public\.transaction_participant_requirements to authenticated/i)
assert.doesNotMatch(sql, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)
assert.equal(correction?.action, 'apply_original_after_dependency_check')
assert.equal(historical?.dependsOn, '202607209903')
assert.equal(historical?.action, 'repair_only_after_smoke')

console.log('Phase 25 transaction creation least-privilege correction passed.')
