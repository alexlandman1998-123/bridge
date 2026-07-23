import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  ROLLOUT_PHASE2_REQUIRED_SCENARIOS,
  assessLegalDocumentRolloutPhase2,
  createPendingLegalDocumentRolloutPhase2Receipt,
  rolloutPhase2ManifestDigest,
} from './legal-document-rollout-phase2-policy.mjs'
import {
  finalizeLegalDocumentRolloutPhase2Receipt,
} from './legal-document-rollout-phase2-finalize.mjs'

const now = Date.parse('2026-07-23T11:40:00.000Z')
const timestamp = (minutes) => new Date(Date.parse('2026-07-23T11:00:00.000Z') + minutes * 60_000).toISOString()
const digest = (character) => `sha256:${character.repeat(64)}`
const commit = 'a'.repeat(40)
const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function phase0Freeze() {
  return {
    manifestDigest: digest('a'),
    source: { commitSha: commit, packageLockSha256: digest('b') },
  }
}

function phase1Receipt() {
  return {
    status: 'staging_evidence_recorded',
    manifestDigest: digest('c'),
    environment: {
      productionProjectRef: 'productionref001',
      stagingProjectRef: 'stagingref001',
      stagingOrigin: 'https://stagingref001.supabase.co',
    },
    source: {
      phase0ManifestDigest: digest('a'),
      commitSha: commit,
      packageLockSha256: digest('b'),
    },
    execution: {
      previewEvidence: {
        previewUrl: 'https://legal-docs-phase1-preview.vercel.app',
        previewReleaseId: commit,
        attestationEvidenceDigest: digest('d'),
        previewArtifactTreeSha256: digest('e'),
      },
    },
    evidence: { evidenceRecordedAt: timestamp(0) },
  }
}

function phase0Report(phase2ReceiptChangeCount = 0) {
  return {
    status: 'FROZEN',
    evidence: {
      phase1ReceiptChangeCount: 2,
      phase2ReceiptChangeCount,
    },
  }
}

function pendingFixture() {
  const phase1 = phase1Receipt()
  const receipt = createPendingLegalDocumentRolloutPhase2Receipt({
    phase1Receipt: phase1,
    preparedBy: 'Release Manager',
    changeReference: 'REL-003',
    fixtureNamespace: 'phase2_acceptance',
    fixtureWriteLimit: 4,
    testMailboxDigest: digest('f'),
    preparedAt: timestamp(5),
  })
  return {
    receipt,
    phase0Freeze: phase0Freeze(),
    phase0Report: phase0Report(0),
    phase1Receipt: phase1,
    phase1Report: { status: 'STAGING_EVIDENCE_RECORDED' },
  }
}

function positiveScenario(scenario, number) {
  const mandate = scenario.startsWith('mandate_')
  const roles = mandate ? ['seller'] : ['buyer', 'seller']
  const fixture = {
    organisationId: uuid(number),
    packetId: uuid(number + 100),
    packetVersionId: uuid(number + 200),
    transactionId: mandate ? null : uuid(number + 300),
    listingId: mandate ? uuid(number + 400) : null,
    leadId: mandate ? uuid(number + 500) : null,
  }
  const finalHash = digest(String.fromCharCode(97 + number))
  return {
    scenario,
    status: 'passed',
    fixture,
    source: {
      canonicalGenerator: 'generate-mandate',
      templateId: uuid(number + 600),
      templateKey: `${scenario}_template`,
      templateVersion: 'v1',
      templateContentDigest: digest('1'),
      factsDigest: digest('2'),
      missingRequiredFields: 0,
    },
    generatedPdf: {
      d1Verified: true,
      d2Verified: true,
      d3Persisted: true,
      path: `generated/${fixture.packetId}/source.pdf`,
      sha256: digest('3'),
      bytes: 1200,
      mediaType: 'application/pdf',
      evidenceDigest: digest('4'),
    },
    delivery: {
      dispatchId: `dispatch-${number}`,
      targetRoles: roles,
      providerConfirmed: true,
      providerMessageDigest: digest('5'),
      evidenceDigest: digest('6'),
    },
    signing: {
      requiredSignerCount: roles.length,
      completedSignerCount: roles.length,
      requiredFieldCount: roles.length * 2,
      completedFieldCount: roles.length * 2,
      signatureEvidenceDigest: digest('7'),
    },
    finalArtifact: {
      f2EventId: `f2-event-${number}`,
      f2EvidenceId: `f2-evidence-${number}`,
      transactionDocumentId: uuid(number + 700),
      storageBucket: 'legal-documents',
      path: `signed/${fixture.packetId}/final.pdf`,
      sha256: finalHash,
      bytes: 2400,
      mediaType: 'application/pdf',
      evidenceDigest: digest('8'),
    },
    download: {
      sha256: finalHash,
      bytes: 2400,
      mediaType: 'application/pdf',
      evidenceDigest: digest('9'),
    },
    startedAt: timestamp(10 + number),
    completedAt: timestamp(11 + number),
    reviewedBy: 'Acceptance Reviewer',
    evidenceDigest: digest('a'),
  }
}

function recordedEvidence({ physicalStatus = 'passed' } = {}) {
  const positive = [
    positiveScenario('mandate_onboarding_individual', 1),
    positiveScenario('mandate_onboarding_company', 2),
    positiveScenario('otp_cash', 3),
    positiveScenario('otp_bond', 4),
  ]
  const physical = physicalStatus === 'passed'
    ? {
        scenario: 'physical_signature_capability',
        status: 'passed',
        capability: 'server_attested_physical_completion',
        serverAttested: true,
        blockerCode: null,
        startedAt: timestamp(25),
        completedAt: timestamp(26),
        reviewedBy: 'Acceptance Reviewer',
        evidenceDigest: digest('c'),
      }
    : {
        scenario: 'physical_signature_capability',
        status: 'unsupported',
        capability: 'server_attested_physical_completion',
        serverAttested: false,
        blockerCode: 'P2_PHYSICAL_SIGNATURE_UNSUPPORTED',
        startedAt: timestamp(25),
        completedAt: timestamp(26),
        reviewedBy: 'Acceptance Reviewer',
        evidenceDigest: digest('c'),
      }
  return {
    acceptanceRecordedBy: 'Staging Operator',
    reviewedBy: 'Release Reviewer',
    acceptanceRecordedAt: timestamp(30),
    fixtureWrites: 4,
    overallEvidenceDigest: digest('d'),
    browserEvidence: {
      status: 'passed',
      previewUrl: 'https://legal-docs-phase1-preview.vercel.app',
      previewReleaseId: commit,
      scenarioIds: ROLLOUT_PHASE2_REQUIRED_SCENARIOS.slice(0, 4),
      checkedAt: timestamp(28),
      evidenceDigest: digest('e'),
    },
    cleanupEvidence: {
      status: 'retained_for_evidence',
      archivedPacketIds: [],
      completedAt: timestamp(29),
      evidenceDigest: digest('f'),
    },
    scenarios: [
      ...positive,
      {
        scenario: 'negative_template_and_authority',
        status: 'passed',
        assertions: {
          alternateTemplateRejected: true,
          crossOrganisationRejected: true,
          unauthorisedActorRejected: true,
          dispatchTargetMismatchRejected: true,
          noArtifactCreated: true,
        },
        startedAt: timestamp(22),
        completedAt: timestamp(23),
        reviewedBy: 'Acceptance Reviewer',
        evidenceDigest: digest('b'),
      },
      {
        scenario: 'idempotency_and_recovery',
        status: 'passed',
        fixture: positive[3].fixture,
        assertions: {
          sendReusedCanonicalVersion: true,
          finaliseReusedCanonicalArtifact: true,
          noDuplicateFinalVersion: true,
          noDuplicateCompletion: true,
          recoveryReconciled: true,
        },
        startedAt: timestamp(23),
        completedAt: timestamp(24),
        reviewedBy: 'Acceptance Reviewer',
        evidenceDigest: digest('b'),
      },
      physical,
    ],
  }
}

function codes(result) {
  return result.blockers.map((blocker) => blocker.code)
}

const pending = pendingFixture()
const planned = assessLegalDocumentRolloutPhase2({ ...pending, now })
assert.equal(planned.status, 'STAGING_ACCEPTANCE_PLANNED')
assert.equal(planned.blockerCount, 0)
assert.equal(planned.pendingCount, 1)
assert.equal(planned.mutatedData, false)

const evidence = recordedEvidence()
const finalized = finalizeLegalDocumentRolloutPhase2Receipt({ pendingPlan: pending.receipt, evidenceInput: evidence, now })
const recorded = {
  ...pending,
  receipt: finalized,
  phase0Report: phase0Report(1),
}
const completed = assessLegalDocumentRolloutPhase2({ ...recorded, now })
assert.equal(completed.status, 'STAGING_ACCEPTANCE_RECORDED')
assert.equal(completed.blockerCount, 0)

for (const [label, mutate, expectedCode] of [
  ['phase one report', (fixture) => { fixture.phase1Report.status = 'HOLD' }, 'P2_PHASE1_NOT_RECORDED'],
  ['phase two receipt history', (fixture) => { fixture.phase0Report.evidence.phase2ReceiptChangeCount = 0 }, 'P2_RECEIPT_HISTORY_INVALID'],
  ['preview drift', (fixture) => { fixture.receipt.environment.previewUrl = 'https://different-preview.vercel.app' }, 'P2_PHASE1_ENVIRONMENT_OR_PREVIEW_DRIFT'],
  ['template merge drift', (fixture) => { fixture.receipt.execution.scenarios[0].source.missingRequiredFields = 1 }, 'P2_TEMPLATE_OR_MERGE_EVIDENCE_INVALID'],
  ['cash completion', (fixture) => { fixture.receipt.execution.scenarios[2].signing.completedSignerCount = 1 }, 'P2_SIGNING_COMPLETION_EVIDENCE_INVALID'],
  ['final download drift', (fixture) => { fixture.receipt.execution.scenarios[3].download.sha256 = digest('0') }, 'P2_FINAL_DOWNLOAD_EVIDENCE_INVALID'],
  ['negative control', (fixture) => { fixture.receipt.execution.scenarios[4].assertions.noArtifactCreated = false }, 'P2_NEGATIVE_CONTROLS_INCOMPLETE'],
  ['idempotency fixture', (fixture) => { fixture.receipt.execution.scenarios[5].fixture.packetId = uuid(9999) }, 'P2_IDEMPOTENCY_FIXTURE_UNBOUND'],
]) {
  const fixture = clone(recorded)
  mutate(fixture)
  fixture.receipt.manifestDigest = rolloutPhase2ManifestDigest(fixture.receipt)
  assert.ok(codes(assessLegalDocumentRolloutPhase2({ ...fixture, now })).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

const physicalHoldFixture = clone(recorded)
const physicalHoldEvidence = recordedEvidence({ physicalStatus: 'unsupported' })
physicalHoldFixture.receipt = finalizeLegalDocumentRolloutPhase2Receipt({ pendingPlan: pending.receipt, evidenceInput: physicalHoldEvidence, now })
physicalHoldFixture.phase0Report = phase0Report(1)
assert.ok(codes(assessLegalDocumentRolloutPhase2({ ...physicalHoldFixture, now })).includes('P2_PHYSICAL_SIGNATURE_CAPABILITY_HOLD'))

const staleEvidence = clone(recorded)
staleEvidence.receipt.evidence.acceptanceRecordedAt = '2026-07-22T09:00:00.000Z'
staleEvidence.receipt.manifestDigest = rolloutPhase2ManifestDigest(staleEvidence.receipt)
assert.ok(codes(assessLegalDocumentRolloutPhase2({ ...staleEvidence, now })).includes('P2_RECORDING_ACCOUNTABILITY_OR_TIME_INVALID'))

assert.throws(
  () => finalizeLegalDocumentRolloutPhase2Receipt({ pendingPlan: pending.receipt, evidenceInput: { ...evidence, fixtureWrites: 5 }, now }),
  /fixtureWrites must be within the pending plan bound/,
)

const legacyHarness = fs.readFileSync(new URL('./otp-phase2-staging-acceptance.mjs', import.meta.url), 'utf8')
assert.match(legacyHarness, /OTP_PHASE2_LEGACY_HARNESS_APPROVED/)
assert.match(legacyHarness, /--acknowledge-legacy-harness/)
assert.match(legacyHarness, /OTP_PHASE2_LEGACY_STAGING_PROJECT_REF/)
assert.doesNotMatch(legacyHarness, /url\.includes\(STAGING_PROJECT_REF\)/)
assert.match(legacyHarness, /--finalize-existing is retired from the legacy harness/)

console.log('Legal-document rollout Phase 2 staging-acceptance contract passed.')
