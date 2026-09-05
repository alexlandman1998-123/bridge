import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const repoRoot = path.resolve(root, '..')
const migration = await readFile(path.join(repoRoot, 'supabase/migrations/20260905101301_bond_application_portal_phase4_originator_action_centre.sql'), 'utf8')
const api = await readFile(path.join(root, 'src/lib/api.js'), 'utf8')
const page = await readFile(path.join(root, 'src/pages/bond/BondApplicationActionCentrePage.jsx'), 'utf8')
const routes = await readFile(path.join(root, 'src/App.jsx'), 'utf8')

assert.match(migration, /bridge_issue_bond_application_portal_access_link_for_originator/)
assert.match(migration, /assigned_to_profile_id = auth\.uid\(\)/)
assert.match(migration, /replace\(gen_random_uuid\(\)::text, '-', ''\)/)
assert.match(migration, /encode\(extensions\.digest\(v_token, 'sha256'\), 'hex'\)/)
assert.match(migration, /bridge_revoke_bond_application_portal_access_link_for_originator/)
assert.match(migration, /bridge_bond_application_portal_originator_action_centre_view/)
assert.match(migration, /remindersDeferredToPhase5/)
assert.doesNotMatch(migration, /'accessToken', access_link/)
assert.match(api, /export async function fetchBondApplicationOriginatorActionCentre/)
assert.match(api, /export async function issueBondApplicationPortalAccessLinkForOriginator/)
assert.match(api, /export async function createBondOriginatorWorkspaceDocumentRequest/)
assert.match(page, /Application action centre/)
assert.match(page, /Request a document/)
assert.match(page, /Email delivery is queued safely/)
assert.match(routes, /path="\/bond\/application-actions"/)

console.log('Bond application portal Phase 4 originator action-centre checks passed.')
