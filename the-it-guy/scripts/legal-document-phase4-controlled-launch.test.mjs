import assert from 'node:assert/strict'
import fs from 'node:fs'

const files = {
  packet: fs.readFileSync('src/core/documents/packetService.js', 'utf8'),
  templateApproval: fs.readFileSync('src/core/documents/legalTemplateApproval.js', 'utf8'),
  editableGeneration: fs.readFileSync('src/core/documents/editableDocumentGeneration.js', 'utf8'),
  workspace: fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8'),
  retiredOtp: fs.readFileSync('../supabase/functions/generate-otp/index.ts', 'utf8'),
  canonicalGenerator: fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8'),
  approval: fs.readFileSync('scripts/legal-document-template-approval.mjs', 'utf8'),
  rollback: fs.readFileSync('scripts/legal-document-phase4-rollback.mjs', 'utf8'),
  monitor: fs.readFileSync('scripts/legal-document-phase4-monitor.mjs', 'utf8'),
  gate: fs.readFileSync('scripts/legal-document-phase4-release-gate.mjs', 'utf8'),
  stagingSmoke: fs.readFileSync('scripts/legal-document-phase4-staging-smoke.mjs', 'utf8'),
}
assert.match(files.packet, /assertLegalTemplateApproved/)
assert.match(files.packet, /LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED/)
for (const marker of ['legal_b1_manifest_digest', 'legal_b3_applied_at', 'legal_b3_applied_by', 'legal_b3_application_reference', 'legal_phase4_b3_release_contract', 'phase4-b3-integrity-v1', 'LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED']) {
  assert.match(files.templateApproval, new RegExp(marker))
}
assert.match(files.packet, /editableSections/)
assert.match(files.packet, /native_structured/)
assert.match(files.editableGeneration, /planned_signing_fields/)
assert.match(files.workspace, /Generate PDF/)
assert.match(files.retiredOtp, /OTP_LEGACY_RENDERER_RETIRED/)
assert.match(files.retiredOtp, /CREATE_OR_REISSUE_CANONICAL_OTP_PDF/)
assert.match(files.retiredOtp, /return jsonResponse\(410/)
for (const marker of ['requireCaller', 'LEGAL_TEMPLATE_SOURCE_MISMATCH', 'LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED', 'legal_b1_manifest_digest', 'legal_b3_applied_at', 'legal_b3_applied_by', 'legal_b3_application_reference', 'legal_phase4_b3_release_contract', 'phase4-b3-integrity-v1', 'legal_document_generation_started', 'legal_document_generation_completed', 'legal_document_generation_failed', 'packetType === "otp"']) {
  assert.match(files.canonicalGenerator, new RegExp(marker))
}
assert.match(files.approval, /LEGAL_TEMPLATE_APPROVAL_WRITE/)
assert.match(files.rollback, /LEGAL_DOCUMENT_ROLLBACK_WRITE/)
assert.match(files.rollback, /revoke_template_approval/)
assert.doesNotMatch(files.monitor, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
assert.doesNotMatch(files.gate, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
assert.match(files.gate, /legal-document-phase-a2-readiness\.mjs/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(files.stagingSmoke, /AbortSignal\.timeout/)
assert.match(files.stagingSmoke, /LEGAL_DOCUMENT_PHASE4_AUDIT_SMOKE_APPROVED/)
assert.match(files.stagingSmoke, /LEGAL_DOCUMENT_PHASE4_OTP_SMOKE_PACKET_ID/)
assert.match(files.stagingSmoke, /LEGAL_DOCUMENT_PHASE4_MANDATE_SMOKE_PACKET_ID/)
assert.match(files.stagingSmoke, /legal_template_approval_blocked/)
assert.match(files.stagingSmoke, /auditEventsRecorded: true/)
assert.match(files.stagingSmoke, /mutatedData: true/)
assert.match(files.stagingSmoke, /generate-mandate/)
assert.match(files.stagingSmoke, /authenticated_pre_render/)
assert.match(files.stagingSmoke, /canGeneratePacket/)
assert.match(files.stagingSmoke, /invoke\(token/)
assert.doesNotMatch(files.stagingSmoke, /\bcapacityProbe\s*:/)
assert.doesNotMatch(files.stagingSmoke, /invoke\(env\.SUPABASE_SERVICE_ROLE_KEY/)
assert.match(files.stagingSmoke, /LEGAL_TEMPLATE_APPROVAL_REQUIRED/)
assert.match(files.stagingSmoke, /LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED/)
assert.match(files.stagingSmoke, /LEGAL_TEMPLATE_SOURCE_MISMATCH/)
assert.doesNotMatch(files.stagingSmoke, /generate-otp/)
for (const name of ['test:legal-documents-phase4', 'test:legal-documents-phase4-cohort', 'test:legal-documents-phase-a2', 'test:legal-documents-phase-a3', 'test:legal-documents-phase-b1', 'test:legal-documents-phase-b2', 'test:legal-documents-phase-b3', 'test:legal-documents-phase-c1', 'test:legal-documents-phase-c2', 'test:legal-documents-phase-c3', 'test:legal-documents-phase-d1', 'test:legal-documents-phase-d2', 'test:legal-documents-phase-d3', 'test:legal-documents-phase-e1', 'test:legal-documents-phase-e2', 'test:legal-documents-phase-e3', 'test:legal-documents-phase-e4', 'test:legal-documents-phase-f1', 'test:legal-documents-phase-f2', 'test:legal-documents-phase-f3', 'test:legal-documents-phase-g1', 'test:legal-documents-phase-g2', 'test:legal-documents-phase-g3', 'verify:legal-documents:phase4-cohort', 'verify:legal-documents:phase-a2', 'activate:legal-documents:phase-a3', 'deactivate:legal-documents:phase-a3', 'verify:legal-documents:phase-a3', 'freeze:legal-documents:phase-b1', 'verify:legal-documents:phase-b1', 'prepare:legal-documents:phase-b2', 'record:legal-documents:phase-b2', 'verify:legal-documents:phase-b2', 'apply:legal-documents:phase-b3', 'verify:legal-documents:phase-b3', 'restore:legal-documents:phase-c1', 'verify:legal-documents:phase-c1', 'verify:legal-documents:phase-c2', 'restart:legal-documents:phase-c3', 'verify:legal-documents:phase-c3', 'verify:legal-documents:phase-d1', 'verify:legal-documents:phase-d2', 'verify:legal-documents:phase-d3', 'verify:legal-documents:phase-e1', 'verify:legal-documents:phase-e2', 'verify:legal-documents:phase-e3', 'verify:legal-documents:phase-e4', 'verify:legal-documents:phase-f1', 'verify:legal-documents:phase-f2', 'verify:legal-documents:phase-f3', 'verify:legal-documents:phase-g1', 'verify:legal-documents:phase-g2', 'verify:legal-documents:phase-g3', 'verify:legal-documents:phase4-monitor', 'verify:legal-documents:phase4-release', 'verify:legal-documents:phase4-staging-smoke', 'approve:legal-document-template', 'rollback:legal-documents:phase4']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-g4', 'verify:legal-documents:phase-g4']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-h1', 'verify:legal-documents:phase-h1']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-h2', 'verify:legal-documents:phase-h2']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-h3', 'verify:legal-documents:phase-h3']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-h4', 'verify:legal-documents:phase-h4']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-i1', 'verify:legal-documents:phase-i1']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-i2', 'verify:legal-documents:phase-i2']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
for (const name of ['test:legal-documents-phase-i3', 'verify:legal-documents:phase-i3']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
console.log('Legal document Phase 4 controlled-launch contract passed')
