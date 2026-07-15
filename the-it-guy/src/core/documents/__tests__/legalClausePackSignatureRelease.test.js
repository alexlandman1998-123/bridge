import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalSignatureReleaseApproval,
  resolveLegalClausePackSignatureRelease,
} from '../legalClausePackSignatureRelease.js'

function governedVersion(overrides = {}) {
  const readiness = {
    schemaVersion: 'sa_legal_clause_pack_transaction_readiness_v1',
    runtimeEnforced: true,
    canGenerate: true,
    selectionKey: 'individual|individual|full_title|cash',
    attorneyReviewItems: [],
    ...overrides.readiness,
  }
  return {
    id: overrides.id || 'version-1',
    version_number: overrides.versionNumber || 1,
    validation_summary_json: {
      legalClausePackTransactionReadiness: readiness,
      render_provenance: { contentFingerprint: overrides.fingerprint || 'fingerprint-1' },
      ...(overrides.summary || {}),
    },
  }
}

const otpPacket = { id: 'packet-1', packet_type: 'otp' }

test('requires version approval before a governed clean OTP can be released', () => {
  const version = governedVersion()
  const release = resolveLegalClausePackSignatureRelease({ packet: otpPacket, version, actorRole: 'agent' })

  assert.equal(release.governed, true)
  assert.equal(release.canApprove, true)
  assert.equal(release.approved, false)
  assert.equal(release.canSendForSignature, false)
  assert.match(release.blockers[0], /Approve the current OTP version/)
})

test('accepts an approval bound to the exact version and fingerprint', () => {
  const version = governedVersion()
  version.validation_summary_json.legal_signature_release = buildLegalSignatureReleaseApproval({
    version,
    reviewerRole: 'agent',
    reviewerId: 'agent-1',
  })
  const release = resolveLegalClausePackSignatureRelease({ packet: otpPacket, version, actorRole: 'agent' })

  assert.equal(release.approved, true)
  assert.equal(release.canSendForSignature, true)
  assert.equal(release.approval.reviewedByUserId, 'agent-1')
})

test('invalidates approval when the generated content changes', () => {
  const original = governedVersion()
  const approval = buildLegalSignatureReleaseApproval({ version: original, reviewerRole: 'agent' })
  const changed = governedVersion({ fingerprint: 'fingerprint-2', summary: { legal_signature_release: approval } })
  const release = resolveLegalClausePackSignatureRelease({ packet: otpPacket, version: changed, actorRole: 'agent' })

  assert.equal(release.staleApproval, true)
  assert.equal(release.canSendForSignature, false)
  assert.match(release.blockers[0], /older OTP version/)
})

test('requires an attorney to clear specialist legal review items', () => {
  const version = governedVersion({
    readiness: {
      attorneyReviewItems: [{
        code: 'zero_rated_vat_specialist_review',
        message: 'Confirm zero-rating requirements.',
      }],
    },
  })
  const agentRelease = resolveLegalClausePackSignatureRelease({ packet: otpPacket, version, actorRole: 'agent' })
  const attorneyRelease = resolveLegalClausePackSignatureRelease({ packet: otpPacket, version, actorRole: 'attorney' })

  assert.equal(agentRelease.requiresLegalSpecialist, true)
  assert.equal(agentRelease.canApprove, false)
  assert.equal(attorneyRelease.canApprove, true)

  version.validation_summary_json.legal_signature_release = buildLegalSignatureReleaseApproval({ version, reviewerRole: 'agent' })
  assert.equal(resolveLegalClausePackSignatureRelease({ packet: otpPacket, version }).canSendForSignature, false)

  version.validation_summary_json.legal_signature_release = buildLegalSignatureReleaseApproval({ version, reviewerRole: 'attorney' })
  assert.equal(resolveLegalClausePackSignatureRelease({ packet: otpPacket, version }).canSendForSignature, true)
})

test('does not change legacy or non-OTP signing behaviour', () => {
  const legacyOtp = governedVersion({ readiness: { runtimeEnforced: false } })
  const mandate = { id: 'packet-2', packet_type: 'mandate' }

  assert.equal(resolveLegalClausePackSignatureRelease({ packet: otpPacket, version: legacyOtp }).canSendForSignature, true)
  assert.equal(resolveLegalClausePackSignatureRelease({ packet: mandate, version: governedVersion() }).canSendForSignature, true)
})
