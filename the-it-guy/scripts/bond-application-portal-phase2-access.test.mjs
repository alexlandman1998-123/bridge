import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const migration = fs.readFileSync('../supabase/migrations/20260905100612_bond_application_portal_phase2_access_tokens.sql', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const portal = fs.readFileSync('src/pages/BondApplicationPortal.jsx', 'utf8')
const api = fs.readFileSync('src/lib/api.js', 'utf8')
const link = fs.readFileSync('src/lib/bondApplicationPortalAccessLink.js', 'utf8')

assert.equal(packageJson.scripts['test:bond-application-portal-phase2'], 'node scripts/bond-application-portal-phase2-access.test.mjs')
assert.match(migration, /token_hash text not null unique/)
assert.match(migration, /expires_at timestamptz not null/)
assert.match(migration, /revoked_at timestamptz/)
assert.match(migration, /x-bridge-bond-application-token/)
assert.match(migration, /bridge_bond_application_portal_projection/)
assert.match(migration, /grant execute on function public\.bridge_bond_application_portal_projection\(\) to anon, authenticated/)
assert.match(migration, /grant execute on function public\.bridge_create_bond_application_portal_access_link[\s\S]*to service_role/)
assert.match(app, /path="\/bond-application\/:accessToken"/)
assert.match(portal, /fetchBondApplicationPortalProjection/)
assert.match(api, /requireBondApplicationPortalTokenClient/)
assert.match(api, /bridge_bond_application_portal_projection/)
assert.match(link, /encodeURIComponent/)

console.log('bond application portal Phase 2 access contract tests passed')
