#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./supabase-phase10-attorney-assignment-repair.mjs', import.meta.url), 'utf8')

assert.match(source, /EXPECTED_ASSIGNMENT_COUNT = 43/)
assert.match(source, /REPAIR_43_ATTORNEY_ASSIGNMENTS/)
assert.match(source, /SUPABASE_STAGING_PROJECT_REF/)
assert.match(source, /for update/)
assert.match(source, /begin/)
assert.match(source, /rollback/)
assert.match(source, /attorney_primary_replaced/)
assert.match(source, /previousAttorneyUserId/)
assert.match(source, /remediationRunId/)
assert.match(source, /attorney_role_integrity_v1/)
assert.match(source, /certify_attorney_role_release_phase9/)
assert.doesNotMatch(source, /SUPABASE_PRODUCTION_DB_URL/)

console.log('Phase 10 attorney assignment repair guard tests passed.')
