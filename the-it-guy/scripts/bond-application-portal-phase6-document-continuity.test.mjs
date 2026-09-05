import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(path.join(repoRoot, 'supabase/migrations/20260905102430_bond_application_portal_phase6_document_continuity.sql'), 'utf8')
const api = await readFile(path.join(appRoot, 'src/lib/api.js'), 'utf8')
const portalApi = await readFile(path.join(appRoot, 'src/lib/clientPortalApi.js'), 'utf8')
const buyerPortal = await readFile(path.join(appRoot, 'src/pages/BondApplicationPortal.jsx'), 'utf8')
const actionCentre = await readFile(path.join(appRoot, 'src/pages/bond/BondApplicationActionCentrePage.jsx'), 'utf8')

assert.match(migration, /add column if not exists linked_document_id uuid references public\.documents/)
assert.match(migration, /bond_application_document_continuity_events/)
assert.match(migration, /bridge_sync_bond_application_document_continuity_phase6/)
assert.match(migration, /trg_sync_bond_application_document_continuity_phase6/)
assert.match(migration, /transaction_required_document_sync/)
assert.match(migration, /bridge_reconcile_bond_application_document_continuity_phase6/)
assert.match(migration, /bridge_bond_application_portal_document_continuity\(\)/)
assert.match(migration, /bridge_bond_application_portal_originator_document_continuity_view\(\)/)
assert.match(migration, /never document storage coordinates or signed URLs/)
assert.match(api, /export async function fetchBondApplicationPortalDocumentContinuity/)
assert.match(api, /export async function fetchBondApplicationPortalOriginatorDocumentContinuity/)
assert.match(portalApi, /fetchBondApplicationPortalDocumentContinuity/)
assert.match(buyerPortal, /documentContinuity/)
assert.match(actionCentre, /Document continuity:/)

console.log('Bond application portal Phase 6 document continuity checks passed.')
