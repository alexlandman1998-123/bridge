import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalTemplateApproval } from '../src/core/documents/legalTemplateApproval.js'

const approved = assessLegalTemplateApproval({ packet_type: 'otp', status: 'published', is_active: true, metadata_json: { legal_review_status: 'approved', legal_approved_at: '2026-07-16T12:00:00Z', legal_approval_reference: 'COUNSEL-001' } }, { expectedPacketType: 'otp' })
assert.equal(approved.approved, true)
assert.equal(assessLegalTemplateApproval({ packet_type: 'otp', status: 'published', is_active: true, metadata_json: {} }, { expectedPacketType: 'otp' }).approved, false)
assert.equal(assessLegalTemplateApproval({ packet_type: 'otp', status: 'published', is_active: true, metadata_json: { legal_review_status: 'approved', legal_approved_at: '2026-07-16T12:00:00Z', legal_approval_reference: 'COUNSEL-001', legal_revoked_at: '2026-07-16T13:00:00Z' } }, { expectedPacketType: 'otp' }).approved, false)

const files = {
  packet: fs.readFileSync('src/core/documents/packetService.js', 'utf8'),
  otp: fs.readFileSync('../supabase/functions/generate-otp/index.ts', 'utf8'),
  mandate: fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8'),
  approval: fs.readFileSync('scripts/legal-document-template-approval.mjs', 'utf8'),
  rollback: fs.readFileSync('scripts/legal-document-phase4-rollback.mjs', 'utf8'),
  monitor: fs.readFileSync('scripts/legal-document-phase4-monitor.mjs', 'utf8'),
  gate: fs.readFileSync('scripts/legal-document-phase4-release-gate.mjs', 'utf8'),
  stagingSmoke: fs.readFileSync('scripts/legal-document-phase4-staging-smoke.mjs', 'utf8'),
}
for (const source of [files.packet, files.otp, files.mandate]) assert.match(source, /LEGAL_TEMPLATE_APPROVAL_REQUIRED|assertLegalTemplateApproved/)
for (const source of [files.otp, files.mandate]) {
  assert.match(source, /requireCaller/)
  assert.match(source, /LEGAL_TEMPLATE_SOURCE_MISMATCH/)
  assert.match(source, /LEGAL_DOCUMENT_PILOT_ENABLED/)
  assert.match(source, /LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS/)
  assert.match(source, /legal_document_generation_started/)
  assert.match(source, /legal_document_generation_completed/)
  assert.match(source, /legal_document_generation_failed/)
}
assert.match(files.approval, /LEGAL_TEMPLATE_APPROVAL_WRITE/)
assert.match(files.rollback, /LEGAL_DOCUMENT_ROLLBACK_WRITE/)
assert.match(files.rollback, /revoke_template_approval/)
assert.doesNotMatch(files.monitor, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
assert.doesNotMatch(files.gate, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(files.stagingSmoke, /LEGAL_TEMPLATE_APPROVAL_REQUIRED/)
assert.match(files.stagingSmoke, /mutatedData: false/)
for (const name of ['test:legal-documents-phase4', 'verify:legal-documents:phase4-monitor', 'verify:legal-documents:phase4-release', 'verify:legal-documents:phase4-staging-smoke', 'approve:legal-document-template', 'rollback:legal-documents:phase4']) assert.ok(pkg.scripts?.[name], `Missing package script ${name}`)
console.log('Legal document Phase 4 controlled-launch contract passed')
