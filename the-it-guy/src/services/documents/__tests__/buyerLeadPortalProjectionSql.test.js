import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../../../../supabase/migrations/20260926145705_buyer_document_unlinked_portal_projection_phase3.sql', import.meta.url), 'utf8')
const portalApi = await readFile(new URL('../../../lib/api.js', import.meta.url), 'utf8')
const workspaceService = await readFile(new URL('../canonicalDocumentWorkspaceService.js', import.meta.url), 'utf8')

test('unmatched portal projection is token-scoped, buyer-only, and cannot satisfy requirements', () => {
  assert.match(migration, /bridge_client_portal_unmatched_buyer_documents_projection\(\)/)
  assert.match(migration, /bridge_client_portal_request_token\(\)/)
  assert.match(migration, /link\.token = v_token/)
  assert.match(migration, /link\.is_active is true/)
  assert.match(migration, /document_row\.transaction_id = v_link\.transaction_id/)
  assert.match(migration, /document_row\.client_recipient_role = 'buyer'/)
  assert.match(migration, /document_row\.uploaded_by_party = 'buyer'/)
  assert.match(migration, /document_row\.canonical_requirement_instance_id is null/)
  assert.match(migration, /document_security\.can_read\(document_row\)/)
  assert.match(migration, /requirement\.satisfied_by_document_id = document_row\.id/)
})

test('buyer portal keeps its canonical room during the additive projection rollout', () => {
  assert.match(portalApi, /unmatchedRpc\.error\.code !== 'PGRST202'/)
  assert.match(workspaceService, /unmatchedResult\.error\.code !== 'PGRST202'/)
  assert.match(portalApi, /if \(!unmatchedRpc\.error && \(String\(unmatched\.role/)
  assert.match(workspaceService, /if \(!unmatchedResult\.error && \(normalizeRole\(unmatchedResult\.data\?\.role/)
})
