import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202607170016_legal_document_counsel_approval_b3.sql', 'utf8')
const apply = fs.readFileSync('scripts/legal-document-phase-b3-apply.mjs', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-b3-verify.mjs', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const runtime = fs.readFileSync('src/core/documents/legalTemplateApproval.js', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.match(migration, /^begin;/)
assert.match(migration, /commit;\s*$/)
assert.match(migration, /bridge_apply_legal_document_counsel_approvals/)
assert.match(migration, /auth\.role\(\) <> 'service_role'/)
assert.match(migration, /for update/)
assert.match(migration, /status[\s\S]*'published'/)
assert.match(migration, /is_active/)
assert.match(migration, /v_decision <> 'approved'/)
for (const key of ['legal_approval_content_digest', 'legal_counsel_review_evidence_digest', 'legal_b1_manifest_digest', 'legal_b3_applied_by', 'legal_b3_application_reference']) assert.match(migration, new RegExp(key))
assert.match(migration, /legal_counsel_approval_applied/)
assert.match(migration, /revoke all[\s\S]*anon, authenticated/)
assert.match(migration, /grant execute[\s\S]*service_role/)

assert.match(apply, /LEGAL_DOCUMENT_PHASE_B3_WRITE/)
for (const guard of ['confirm-project-ref', 'confirm-b1-manifest-digest', 'confirm-template-ids', 'applied-by', 'reference']) assert.match(apply, new RegExp(guard))
assert.match(apply, /legal-document-phase-b2-verify\.mjs/)
assert.match(apply, /\.rpc\('bridge_apply_legal_document_counsel_approvals'/)
assert.doesNotMatch(apply, /client[\s\S]{0,80}\.update\(/)

assert.match(verify, /legal-document-phase-b2-verify\.mjs/)
assert.match(verify, /legal_approval_content_digest/)
assert.match(verify, /legal_counsel_review_evidence_digest/)
assert.match(verify, /legal_b1_manifest_digest/)
assert.match(verify, /legal_counsel_approval_applied/)
assert.match(verify, /payload\.contentDigest === frozen\.contentDigest/)
assert.match(runtime, /legal_counsel_review_evidence_digest/)
assert.match(a2, /legal-document-phase-b3-verify\.mjs/)
assert.match(a2, /runtimeApproval/)

for (const name of ['test:legal-documents-phase-b3', 'apply:legal-documents:phase-b3', 'verify:legal-documents:phase-b3']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)

console.log('Legal document B3 atomic approval contract passed.')
