import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const workspace = fs.readFileSync('src/services/documents/canonicalDocumentWorkspaceService.js', 'utf8')
const uploadArea = fs.readFileSync('src/components/client-portal/documents/canonical/RequirementUploadArea.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/20260905091122_document_trust_phase3_role_scoped_projections.sql', 'utf8')
const docs = fs.readFileSync('docs/document-trust-phase3-role-projections.md', 'utf8')

assert.equal(packageJson.scripts['test:document-trust-phase3'], 'node scripts/document-trust-phase3-role-projections.test.mjs')
assert.match(workspace, /CANONICAL_DOCUMENT_ROLE_PROJECTION_VERSION = 'phase3'/)
assert.match(workspace, /function isExactCanonicalDocumentLink/)
assert.match(workspace, /getCanonicalBuyerPortalDocumentProjection/)
assert.doesNotMatch(workspace, /documentLooksLikeDefinition/)
assert.match(uploadArea, /requirement\.canOpenDocument/)
assert.match(migration, /bridge_client_portal_canonical_document_projection/)
assert.match(migration, /callers cannot choose a transaction or a role/)
assert.match(migration, /document_row\.canonical_requirement_instance_id = requirement\.id/)
assert.match(migration, /document_row\.is_client_visible, false\) is true/)
assert.match(docs, /exact canonical link/i)
assert.match(docs, /not a replacement for storage access control/i)

console.log('document trust Phase 3 role-projection contract tests passed')
