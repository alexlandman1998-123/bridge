import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalClausePackOperationalDiagnostics,
  renderLegalClausePackOperationalDiagnosticsMarkdown,
} from '../legalClausePackOperationalDiagnosticsService.js'
import { buildLegalSignatureReleaseApproval } from '../../../core/documents/legalClausePackSignatureRelease.js'

function packet(id, status = 'generated') {
  return {
    id,
    organisation_id: 'org-1',
    template_id: 'template-1',
    packet_type: 'otp',
    title: `OTP ${id}`,
    status,
    updated_at: '2026-07-14T10:00:00.000Z',
  }
}

function version(packetId, { reviewItems = [], approvalRole = '', fingerprint = `fp-${packetId}`, canGenerate = true } = {}) {
  const row = {
    id: `version-${packetId}`,
    packet_id: packetId,
    version_number: 1,
    render_status: 'generated',
    validation_summary_json: {
      legalClausePackTransactionReadiness: {
        schemaVersion: 'sa_legal_clause_pack_transaction_readiness_v1',
        runtimeEnforced: true,
        canGenerate,
        attorneyReviewItems: reviewItems,
      },
      render_provenance: { contentFingerprint: fingerprint },
    },
  }
  if (approvalRole) {
    row.validation_summary_json.legal_signature_release = buildLegalSignatureReleaseApproval({
      version: row,
      reviewerRole: approvalRole,
      reviewedAt: '2026-07-14T11:00:00.000Z',
    })
  }
  return row
}

test('separates ordinary approval and attorney specialist queues', () => {
  const packets = [packet('clean'), packet('specialist')]
  const versions = [
    version('clean'),
    version('specialist', { reviewItems: [{ code: 'zero_rated_vat_specialist_review' }] }),
  ]
  const report = buildLegalClausePackOperationalDiagnostics({ packets, versions })

  assert.equal(report.gate.status, 'warning')
  assert.equal(report.summary.governedPackets, 2)
  assert.equal(report.summary.awaitingAttorney, 1)
  assert.equal(report.records.find((row) => row.packetId === 'clean')?.operationalState, 'awaiting_operational_approval')
  assert.equal(report.records.find((row) => row.packetId === 'specialist')?.operationalState, 'awaiting_attorney_approval')
})

test('fails the release gate when a governed OTP was sent without valid approval', () => {
  const report = buildLegalClausePackOperationalDiagnostics({
    packets: [packet('unsafe', 'sent')],
    versions: [version('unsafe')],
  })

  assert.equal(report.gate.status, 'fail')
  assert.equal(report.summary.criticalPackets, 1)
  assert.equal(report.actionQueues.critical[0].operationalState, 'released_without_valid_approval')
})

test('accepts attorney approval for specialist wording and reports release evidence', () => {
  const report = buildLegalClausePackOperationalDiagnostics({
    packets: [packet('safe', 'sent')],
    versions: [version('safe', {
      reviewItems: [{ code: 'zero_rated_vat_specialist_review' }],
      approvalRole: 'attorney',
    })],
  })

  assert.equal(report.gate.status, 'pass')
  assert.equal(report.summary.releasedPackets, 1)
  assert.equal(report.records[0].approvedByRole, 'attorney')
  assert.equal(report.records[0].operationalState, 'released_with_valid_approval')
})

test('detects invalid specialist approval roles before signature release', () => {
  const report = buildLegalClausePackOperationalDiagnostics({
    packets: [packet('invalid')],
    versions: [version('invalid', {
      reviewItems: [{ code: 'zero_rated_vat_specialist_review' }],
      approvalRole: 'agent',
    })],
  })

  assert.equal(report.gate.status, 'fail')
  assert.equal(report.records[0].operationalState, 'invalid_approval_role')
})

test('keeps legacy OTPs visible without failing the governed release gate', () => {
  const legacyVersion = version('legacy')
  legacyVersion.validation_summary_json.legalClausePackTransactionReadiness.runtimeEnforced = false
  const report = buildLegalClausePackOperationalDiagnostics({
    packets: [packet('legacy')],
    versions: [legacyVersion],
  })

  assert.equal(report.gate.status, 'pass')
  assert.equal(report.summary.legacyPackets, 1)
  assert.equal(report.records[0].operationalState, 'legacy_not_governed')
  assert.match(renderLegalClausePackOperationalDiagnosticsMarkdown(report), /Governed OTP Signature Release Report/)
})

test('proves a canonical generated OTP against its immutable template version', () => {
  const canonicalVersion = version('canonical')
  canonicalVersion.validation_summary_json.render_provenance = {
    contentFingerprint: 'fp-canonical',
    templateId: 'template-1',
    templateVersionId: 'template-version-1',
    templateContentHash: 'sha256-canonical',
  }
  const report = buildLegalClausePackOperationalDiagnostics({
    packets: [packet('canonical')],
    versions: [canonicalVersion],
    templateVersions: [{
      id: 'template-version-1',
      template_id: 'template-1',
      organisation_id: 'org-1',
      status: 'published',
      content_hash: 'sha256-canonical',
    }],
  })

  assert.equal(report.summary.canonicalPackets, 1)
  assert.equal(report.summary.canonicalVersionEvidenceValid, 1)
  assert.equal(report.records[0].canonicalVersionEvidenceValid, true)
  assert.equal(report.records[0].operationalState, 'awaiting_operational_approval')
})

test('stops release when canonical provenance does not match the immutable registry', () => {
  const canonicalVersion = version('canonical-mismatch')
  canonicalVersion.validation_summary_json.render_provenance = {
    contentFingerprint: 'fp-canonical-mismatch',
    templateId: 'template-1',
    templateVersionId: 'template-version-1',
    templateContentHash: 'unexpected-hash',
  }
  const report = buildLegalClausePackOperationalDiagnostics({
    packets: [packet('canonical-mismatch', 'sent')],
    versions: [canonicalVersion],
    templateVersions: [{
      id: 'template-version-1',
      template_id: 'template-1',
      organisation_id: 'org-1',
      status: 'superseded',
      content_hash: 'sha256-canonical',
    }],
  })

  assert.equal(report.gate.status, 'fail')
  assert.equal(report.summary.canonicalVersionEvidenceInvalid, 1)
  assert.equal(report.records[0].operationalState, 'canonical_version_evidence_invalid')
  assert.match(report.records[0].canonicalVersionEvidenceIssues[0], /content hash/i)
})
