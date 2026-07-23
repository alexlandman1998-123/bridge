import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertLegalTemplateApproved,
  assessLegalTemplateApproval,
} from '../legalTemplateApproval.js'

function approvedTemplate(overrides = {}) {
  return {
    id: 'template-1',
    packet_type: 'otp',
    status: 'published',
    is_active: true,
    metadata_json: {
      legal_review_status: 'approved',
      legal_approved_at: '2026-07-20T09:00:00.000Z',
      legal_approval_reference: 'COUNSEL-42',
      legal_approval_content_digest: 'sha256:content',
      legal_counsel_review_evidence_digest: 'sha256:evidence',
      legal_b1_manifest_digest: 'sha256:manifest',
      legal_b3_applied_at: '2026-07-20T10:00:00.000Z',
      legal_b3_applied_by: 'release-operator',
      legal_b3_application_reference: 'B3-42',
      legal_phase4_b3_release_contract: 'phase4-b3-integrity-v1',
    },
    ...overrides,
  }
}

test('accepts only a published active template with complete B3 runtime approval', () => {
  const assessment = assessLegalTemplateApproval(approvedTemplate(), { expectedPacketType: 'otp' })
  assert.equal(assessment.approved, true)
  assert.equal(assertLegalTemplateApproved(approvedTemplate(), { expectedPacketType: 'otp' }).approved, true)
})

test('rejects a hand-written approval that was not promoted through B3', () => {
  const template = approvedTemplate()
  delete template.metadata_json.legal_b3_applied_at
  delete template.metadata_json.legal_b3_applied_by
  delete template.metadata_json.legal_b3_application_reference

  const assessment = assessLegalTemplateApproval(template, { expectedPacketType: 'otp' })
  assert.equal(assessment.approved, false)
  assert.ok(assessment.reasons.includes('LEGAL_B3_APPLICATION_TIME_MISSING'))
  assert.throws(
    () => assertLegalTemplateApproved(template, { expectedPacketType: 'otp' }),
    (error) => error?.code === 'LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED',
  )
})

test('requires the fresh Phase 4 B3 release contract', () => {
  const template = approvedTemplate()
  delete template.metadata_json.legal_phase4_b3_release_contract

  const assessment = assessLegalTemplateApproval(template, { expectedPacketType: 'otp' })
  assert.equal(assessment.approved, false)
  assert.ok(assessment.reasons.includes('LEGAL_B3_PHASE4_RELEASE_CONTRACT_MISSING'))
})

test('rejects a template whose active release flag is absent', () => {
  const template = approvedTemplate()
  delete template.is_active

  const assessment = assessLegalTemplateApproval(template, { expectedPacketType: 'otp' })
  assert.equal(assessment.approved, false)
  assert.ok(assessment.reasons.includes('TEMPLATE_NOT_ACTIVE'))
})

test('rejects a revoked template even when its prior B3 metadata remains', () => {
  const assessment = assessLegalTemplateApproval(approvedTemplate({
    metadata_json: {
      ...approvedTemplate().metadata_json,
      legal_revoked_at: '2026-07-21T09:00:00.000Z',
    },
  }), { expectedPacketType: 'otp' })
  assert.equal(assessment.approved, false)
  assert.ok(assessment.reasons.includes('LEGAL_APPROVAL_REVOKED'))
})
