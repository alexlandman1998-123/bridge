import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const migration = fs.readFileSync('../supabase/migrations/20260905100908_bond_application_portal_phase3_draft_editing.sql', 'utf8')
const portal = fs.readFileSync('src/pages/BondApplicationPortal.jsx', 'utf8')
const api = fs.readFileSync('src/lib/api.js', 'utf8')

assert.equal(packageJson.scripts['test:bond-application-portal-phase3'], 'node scripts/bond-application-portal-phase3-editing.test.mjs')
assert.match(migration, /bridge_save_bond_application_portal_draft/)
assert.match(migration, /for update/i)
assert.match(migration, /p_expected_revision/)
assert.match(migration, /status in \('submitted', 'cancelled'\)/)
assert.match(migration, /grant execute on function public\.bridge_save_bond_application_portal_draft\(jsonb, integer\) to anon, authenticated/)
assert.match(portal, /GuidedBondApplication/)
assert.match(portal, /saveBondApplicationPortalDraft/)
assert.match(api, /fetchBondApplicationPortalDraft/)
assert.match(api, /saveBondApplicationPortalDraft/)
console.log('bond application portal Phase 3 editing contract tests passed')
