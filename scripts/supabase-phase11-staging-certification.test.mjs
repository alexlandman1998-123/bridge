#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./supabase-phase11-staging-certification.mjs', import.meta.url), 'utf8')

assert.match(source, /CERTIFY_STAGING/)
assert.match(source, /--approved-by is required/)
assert.match(source, /manifest\.rows\.length === 0/)
assert.match(source, /Governed manifest versions must be unique/)
assert.doesNotMatch(source, /EXPECTED_MANIFEST_ROWS/)
assert.match(source, /schema_migrations/)
assert.match(source, /attorney_role_integrity_v1/)
assert.match(source, /remediationRunId/)
assert.match(source, /attorney_role_release_certifications/)
assert.match(source, /merge-base.*--is-ancestor/)
assert.match(source, /rev-parse.*HEAD/)
assert.match(source, /productionMutated: false/)
assert.doesNotMatch(source, /update public|insert into|delete from/i)

console.log('Phase 11 staging certification guard tests passed.')
