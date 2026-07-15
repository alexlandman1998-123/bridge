import assert from 'node:assert/strict'
import test from 'node:test'
import { runCanonicalOtpReferenceMatrix } from '../otpCanonicalReferenceMatrix.js'
import {
  OTP_CANONICAL_ROLLOUT_VERSION,
  buildCanonicalOtpActivationReadiness,
  buildCanonicalOtpActivationRequest,
} from '../otpCanonicalRollout.js'

function certifiedFixture() {
  const template = {
    id: 'template-1',
    organisation_id: 'org-1',
    packet_type: 'otp',
    document_model: 'single_master_document',
    canonical_contract_version: 'kingstons_2026_otp_phase_1_v1',
    live_version_id: 'version-live',
    candidate_version_id: 'version-candidate',
    template_storage_bucket: 'legal-templates',
    template_storage_path: 'org-1/otp/candidate.docx',
    template_file_name: 'candidate.docx',
    metadata_json: { document_model: 'single_master_document' },
  }
  const matrix = runCanonicalOtpReferenceMatrix({ template })
  template.metadata_json = {
    ...template.metadata_json,
    canonical_otp_reference_matrix_version: matrix.schemaVersion,
    last_canonical_otp_reference_matrix: {
      schemaVersion: matrix.schemaVersion,
      scenarioCount: matrix.scenarioCount,
      passedCount: matrix.passedCount,
      failedCount: matrix.failedCount,
      canPublish: matrix.canPublish,
      templateFingerprint: matrix.templateFingerprint,
      certificationKey: matrix.certificationKey,
      validatedAt: '2026-07-15T12:00:00.000Z',
    },
  }
  const versions = [
    { id: 'version-live', template_id: 'template-1', status: 'published', version_tag: '2026.1' },
    {
      id: 'version-candidate', template_id: 'template-1', status: 'approved', version_tag: '2026.2',
      based_on_live_version_id: 'version-live', previous_version_id: 'version-live',
      canonical_contract_version: 'kingstons_2026_otp_phase_1_v1',
      canonical_runtime_binding_version: 'kingstons_2026_otp_runtime_v1',
      canonical_template_asset_version: 'kingstons_2026_otp_docx_v1',
      storage_bucket: 'legal-templates', storage_path: 'org-1/otp/candidate.docx', file_name: 'candidate.docx',
    },
  ]
  const approvals = [{
    id: 'approval-1', template_version_id: 'version-candidate', decision: 'approved', is_current: true,
    reviewer_name: 'Attorney Reviewer', reviewer_role: 'transferring_attorney',
    template_fingerprint: matrix.templateFingerprint, decided_at: '2026-07-15T12:05:00.000Z',
  }]
  return { template, versions, approvals, matrix }
}

test('allows only an approved and exactly certified canonical candidate to activate', () => {
  const fixture = certifiedFixture()
  const readiness = buildCanonicalOtpActivationReadiness(fixture)

  assert.equal(readiness.schemaVersion, OTP_CANONICAL_ROLLOUT_VERSION)
  assert.equal(readiness.canActivate, true)
  assert.equal(readiness.checks.every((check) => check.passed), true)
  assert.deepEqual(buildCanonicalOtpActivationRequest(readiness), {
    templateId: 'template-1',
    candidateVersionId: 'version-candidate',
    certificationKey: fixture.matrix.certificationKey,
    templateFingerprint: fixture.matrix.templateFingerprint,
  })
})

test('blocks an approval that belongs to a different candidate fingerprint', () => {
  const fixture = certifiedFixture()
  fixture.approvals[0].template_fingerprint = 'stale-fingerprint'
  const readiness = buildCanonicalOtpActivationReadiness(fixture)

  assert.equal(readiness.canActivate, false)
  assert.equal(readiness.checks.find((check) => check.key === 'attorney_approval').passed, false)
  assert.throws(() => buildCanonicalOtpActivationRequest(readiness), /attorney approval/i)
})

test('blocks a candidate that was prepared from an older live version', () => {
  const fixture = certifiedFixture()
  fixture.versions[1].based_on_live_version_id = 'obsolete-version'
  const readiness = buildCanonicalOtpActivationReadiness(fixture)

  assert.equal(readiness.canActivate, false)
  assert.equal(readiness.checks.find((check) => check.key === 'version_state').passed, false)
})

test('blocks activation when the saved Phase 5 result becomes stale', () => {
  const fixture = certifiedFixture()
  fixture.template.template_storage_path = 'org-1/otp/replaced.docx'
  const readiness = buildCanonicalOtpActivationReadiness(fixture)

  assert.equal(readiness.canActivate, false)
  assert.equal(readiness.checks.find((check) => check.key === 'reference_certification').passed, false)
})
