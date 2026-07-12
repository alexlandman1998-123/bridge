import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  DEFAULT_DOCUMENT_GENERATOR_TRANSACTION_ID,
  DOCUMENT_GENERATOR_LAUNCH_REQUIREMENTS,
  evaluateDocumentGeneratorLaunchGate,
} from './document-generator-launch-gate.mjs'
import {
  hasFinalSignedArtifact,
  hasGeneratedDocumentRecord,
  hasGeneratedFileMetadata,
  summarizeSinglePacketGenerationHealth,
} from '../src/core/documents/packetGenerationChecks.js'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function buildSnapshot({
  missingFinalKey = '',
  missingLegacyKey = '',
  duplicateRequirementKey = '',
  linkRenderedDocuments = false,
} = {}) {
  const transactionId = DEFAULT_DOCUMENT_GENERATOR_TRANSACTION_ID
  const snapshot = {
    document_requirement_instances: [],
    transaction_required_documents: [],
    document_packets: [],
    document_packet_versions: [],
  }

  for (const spec of DOCUMENT_GENERATOR_LAUNCH_REQUIREMENTS) {
    const requirementId = `${spec.key}-requirement`
    const packetId = `${spec.key}-packet`
    const versionId = `${spec.key}-version`
    const requirement = {
      id: requirementId,
      document_definition_key: spec.key,
      context_type: 'transaction',
      context_id: transactionId,
      transaction_id: transactionId,
      status: 'completed',
      satisfied_by_packet_id: packetId,
      satisfied_by_packet_version_id: versionId,
    }

    snapshot.document_requirement_instances.push(requirement)
    if (duplicateRequirementKey === spec.key) {
      snapshot.document_requirement_instances.push({
        ...requirement,
        id: `${requirementId}-duplicate`,
      })
    }

    snapshot.document_packets.push({
      id: packetId,
      transaction_id: transactionId,
      packet_type: spec.packetType,
      canonical_requirement_instance_id: requirementId,
    })

    snapshot.document_packet_versions.push({
      id: versionId,
      packet_id: packetId,
      canonical_requirement_instance_id: requirementId,
      rendered_file_path: `canonical-packet-fixture/${spec.key}/generated.pdf`,
      rendered_document_id: linkRenderedDocuments ? `${versionId}-document` : null,
      final_signed_file_path: spec.signed && missingFinalKey !== spec.key
        ? `canonical-packet-fixture/${spec.key}/final-signed.pdf`
        : null,
    })

    if (missingLegacyKey !== spec.key) {
      snapshot.transaction_required_documents.push({
        id: `${spec.key}-legacy`,
        transaction_id: transactionId,
        document_key: spec.legacyKey,
        canonical_requirement_instance_id: requirementId,
        status: 'accepted',
        is_uploaded: true,
      })
    }
  }

  return snapshot
}

const passingReport = evaluateDocumentGeneratorLaunchGate({
  snapshot: buildSnapshot(),
  snapshotDurationMs: 250,
  snapshotBudgetMs: 1000,
})
assert.equal(passingReport.pass, true, 'complete OTP/Mandate fixture should pass the launch gate')
assert.equal(passingReport.readyRequirementCount, 4)
assert.equal(passingReport.warningCount, 4, 'missing rendered_document_id should remain a visible warning, not a default blocker')
assert.deepEqual(
  passingReport.packets.map((packet) => packet.key),
  ['generated_mandate', 'signed_mandate', 'generated_otp', 'signed_otp'],
)

const cleanLinkedReport = evaluateDocumentGeneratorLaunchGate({
  snapshot: buildSnapshot({ linkRenderedDocuments: true }),
  snapshotDurationMs: 250,
  snapshotBudgetMs: 1000,
})
assert.equal(cleanLinkedReport.pass, true, 'fixture with linked rendered document rows should pass the launch gate')
assert.equal(cleanLinkedReport.warningCount, 0, 'linked rendered document rows should clear document-generator fixture warnings')
assert.equal(
  cleanLinkedReport.packets.every((packet) => packet.checks.generatedDocumentRecord),
  true,
  'all launch packets should expose rendered_document_id once fixture cleanup is applied',
)

const strictDocumentRecordReport = evaluateDocumentGeneratorLaunchGate({
  snapshot: buildSnapshot(),
  snapshotDurationMs: 250,
  snapshotBudgetMs: 1000,
  enforceDocumentRecord: true,
})
assert.equal(strictDocumentRecordReport.pass, false, 'strict mode should fail when generated versions are not linked to rendered document rows')
assert.equal(
  strictDocumentRecordReport.blockingIssues.filter((item) => item.code === 'GENERATED_DOCUMENT_RECORD_NOT_LINKED').length,
  4,
)

const missingFinalReport = evaluateDocumentGeneratorLaunchGate({
  snapshot: buildSnapshot({ missingFinalKey: 'signed_otp' }),
  snapshotDurationMs: 250,
  snapshotBudgetMs: 1000,
})
assert.equal(missingFinalReport.pass, false, 'signed OTP should fail without a final signed artifact')
assert.ok(
  missingFinalReport.blockingIssues.some((item) => item.code === 'MISSING_FINAL_SIGNED_ARTIFACT' && item.message.includes('Signed OTP')),
)

const missingLegacyReport = evaluateDocumentGeneratorLaunchGate({
  snapshot: buildSnapshot({ missingLegacyKey: 'signed_mandate' }),
  snapshotDurationMs: 250,
  snapshotBudgetMs: 1000,
})
assert.equal(missingLegacyReport.pass, false, 'signed mandate should fail when it does not pull through to legacy transaction requirements')
assert.ok(
  missingLegacyReport.blockingIssues.some((item) => item.code === 'MISSING_LEGACY_PROJECTION' && item.message.includes('Signed Mandate')),
)

const duplicateReport = evaluateDocumentGeneratorLaunchGate({
  snapshot: buildSnapshot({ duplicateRequirementKey: 'generated_mandate' }),
  snapshotDurationMs: 250,
  snapshotBudgetMs: 1000,
})
assert.equal(duplicateReport.pass, false, 'duplicate generated mandate requirements should block launch readiness')
assert.ok(duplicateReport.blockingIssues.some((item) => item.code === 'DUPLICATE_CANONICAL_REQUIREMENT'))

const slowReport = evaluateDocumentGeneratorLaunchGate({
  snapshot: buildSnapshot(),
  snapshotDurationMs: 1250,
  snapshotBudgetMs: 1000,
})
assert.equal(slowReport.pass, false, 'snapshot reads over the launch budget should fail the gate')
assert.ok(slowReport.blockingIssues.some((item) => item.code === 'SNAPSHOT_TOO_SLOW'))

assert.equal(hasGeneratedFileMetadata({ rendered_file_path: 'generated.pdf' }), true)
assert.equal(hasGeneratedDocumentRecord({ rendered_file_path: 'generated.pdf' }), false)
assert.equal(hasFinalSignedArtifact({ final_signed_file_path: 'signed.pdf' }), true)
assert.equal(
  summarizeSinglePacketGenerationHealth({
    rendered_file_path: 'generated.pdf',
    final_signed_file_path: 'signed.pdf',
  }, { signed: true }).launchReady,
  true,
)

const packageJson = JSON.parse(await read('../package.json'))
assert.equal(
  packageJson.scripts?.['test:document-generator-launch-gate'],
  'node scripts/document-generator-launch-gate.test.mjs',
  'package.json should expose the document generator launch gate regression test.',
)
assert.equal(
  packageJson.scripts?.['verify:document-generator-launch'],
  'node scripts/document-generator-launch-gate.mjs',
  'package.json should expose the runnable OTP/Mandate document generator launch gate.',
)
assert.equal(
  packageJson.scripts?.['cleanup:document-generator-fixture-links'],
  'node scripts/document-generator-fixture-document-link-cleanup.mjs',
  'package.json should expose the guarded fixture document-link cleanup.',
)

console.log('document generator launch gate tests passed')
