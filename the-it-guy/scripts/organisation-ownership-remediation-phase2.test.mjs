#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const migrationPath = path.join(repoRoot, 'supabase/migrations/20260907131827_organisation_ownership_remediation_phase2.sql')
const migration = await readFile(migrationPath, 'utf8')

assert.match(migration, /bridge_organisation_ownership_remediation_report/)
assert.match(migration, /bridge_apply_safe_organisation_ownership_remediation/)
assert.match(migration, /p_apply boolean default false/)
assert.match(migration, /Only platform administrators can remediate organisation ownership/i)
assert.match(migration, /active_owner_count = 0/)
assert.match(migration, /active_primary_count = 1/)
assert.match(migration, /active_primary_principal_count = 1/)
assert.match(migration, /manual_review_multiple_primary_owners/)
assert.match(migration, /manual_review_no_active_owner/)
assert.match(migration, /organisation_ownership_remediated_phase2/)
assert.match(migration, /and not exists \(/)
assert.doesNotMatch(migration, /\n\s*select public\.bridge_apply_safe_organisation_ownership_remediation\(/)

console.log('organisation ownership remediation phase 2: passed')
