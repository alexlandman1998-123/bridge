import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(path.join(repoRoot, 'supabase/migrations/20260905102813_bond_application_portal_phase7_submission_readiness.sql'), 'utf8')
const api = await readFile(path.join(appRoot, 'src/lib/api.js'), 'utf8')
const page = await readFile(path.join(appRoot, 'src/pages/bond/BondApplicationActionCentrePage.jsx'), 'utf8')
assert.match(migration, /bond_application_submission_readiness_assessments/)
assert.match(migration, /bridge_assess_bond_application_submission_readiness_phase7/)
assert.match(migration, /outstanding_documents/)
assert.match(migration, /pending_participants/)
assert.match(migration, /automaticBankSubmission', false/)
assert.match(migration, /assigned_to_profile_id = auth\.uid\(\)/)
assert.match(api, /fetchBondApplicationSubmissionReadiness/)
assert.match(api, /assessBondApplicationSubmissionReadiness/)
assert.match(page, /Assess readiness/)
console.log('Bond application portal Phase 7 submission-readiness checks passed.')
