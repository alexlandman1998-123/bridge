import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assessLegalDocumentRolloutPhase6,
  createPendingLegalDocumentRolloutPhase6Receipt,
  rolloutPhase6ManifestDigest,
} from './legal-document-rollout-phase6-policy.mjs'
import { sha256Digest } from './legal-document-rollout-phase1-artifacts.mjs'
import { finalizeLegalDocumentRolloutPhase6Receipt } from './legal-document-rollout-phase6-finalize.mjs'

const now = Date.parse('2026-07-10T00:00:00.000Z')
const preparedAt = '2026-07-08T00:00:00.000Z'
const digest = (character) => `sha256:${character.repeat(64)}`
const organisationId = '11111111-1111-4111-8111-111111111111'
const cohortDigest = sha256Digest(organisationId)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function phase5History() {
  return {
    receiptCommitSha: 'a'.repeat(40),
    receiptManifestDigest: digest('b'),
    receiptManifestDigestValid: true,
    receiptOnlyCommit: true,
    receiptStatus: 'pilot_observation_recorded',
    receiptPhase: 'ROLL_OUT_5',
    receiptContract: 'legal-document-production-pilot-observation-v1',
    phase4ReceiptCommitSha: 'c'.repeat(40),
    phase4ReceiptManifestDigest: digest('d'),
    sourceCommitSha: 'e'.repeat(40),
    packageLockSha256: digest('f'),
    activationPlanDigest: digest('1'),
    observationPlanDigest: digest('2'),
    cohortDigest,
    organisationIds: [organisationId],
    requiredPacketTypes: ['mandate', 'otp'],
    productionProjectRef: 'productionref001',
    productionOrigin: 'https://productionref001.supabase.co',
    productionUrl: 'https://legal.example.test',
    observationRecordedAt: '2026-07-07T00:00:00.000Z',
    runtimeGuardContract: 'legal-document-pilot-release-v1',
    watchdogContract: 'phase5-f2-f3-f4-v2',
  }
}

function fixture() {
  const history = phase5History()
  const receipt = createPendingLegalDocumentRolloutPhase6Receipt({
    phase5History: history,
    preparedByReference: 'release_manager_01',
    changeReference: 'REL-007',
    preparedAt,
  })
  return { receipt, phase5History: history }
}

function evidence() {
  return {
    inventory: { candidateCount: 3, candidateInventoryDigest: digest('3') },
    legalApproval: { evidenceDigest: digest('4'), approvedAt: '2026-07-08T12:00:00.000Z', actorReference: 'legal_reviewer_01' },
    releaseApproval: { evidenceDigest: digest('5'), approvedAt: '2026-07-08T13:00:00.000Z', actorReference: 'release_reviewer_01' },
    releaseEpochReadiness: {
      releaseEpochMigrationEvidenceDigest: digest('6'),
      legacyA3Q2V2MutatorRetirementEvidenceDigest: digest('7'),
      v1AllowlistPreservationEvidenceDigest: digest('8'),
    },
    proposalRecordedAt: '2026-07-09T00:00:00.000Z',
    proposalRecordedByReference: 'release_manager_01',
    reviewedByReference: 'governance_reviewer_01',
  }
}

function codes(result) {
  return result.blockers.map((blocker) => blocker.code)
}

function rehash(receipt) {
  receipt.manifestDigest = rolloutPhase6ManifestDigest(receipt)
}

const pending = fixture()
const ready = assessLegalDocumentRolloutPhase6({ ...pending, now })
assert.equal(ready.status, 'SUCCESSOR_PROPOSAL_READY')
assert.equal(ready.proposalState, 'pending_proposal')
assert.equal(ready.blockerCount, 0)
assert.equal(ready.pendingCount, 1)
assert.equal(ready.mutatedData, false)
assert.ok(ready.doesNotAuthorize.includes('cohort_expansion_or_scale'))
assert.ok(ready.doesNotAuthorize.includes('v1_allowlist_widening'))

const finalized = finalizeLegalDocumentRolloutPhase6Receipt({ pendingPlan: pending.receipt, phase5History: pending.phase5History, evidenceInput: evidence(), now })
const recorded = { receipt: finalized, phase5History: pending.phase5History }
const completed = assessLegalDocumentRolloutPhase6({ ...recorded, now })
assert.equal(completed.status, 'SUCCESSOR_PROPOSAL_RECORDED')
assert.equal(completed.blockerCount, 0)
assert.equal(completed.pendingCount, 0)

for (const [label, mutate, expectedCode] of [
  ['Phase 5 commit drift', (value) => { value.receipt.source.phase5ReceiptCommitSha = 'f'.repeat(40) }, 'P6_PHASE5_PARENT_BINDING_INVALID'],
  ['second organisation', (value) => { value.receipt.cohort.organisationIds.push('22222222-2222-4222-8222-222222222222') }, 'P6_EXISTING_COHORT_SCOPE_INVALID'],
  ['authority-bearing inventory', (value) => { value.receipt.inventory.authority = 'activate' }, 'P6_INVENTORY_NON_AUTHORITY_INVALID'],
  ['stale legal approval', (value) => { value.receipt.evidence.legalApprovalApprovedAt = '2026-06-01T00:00:00.000Z' }, 'P6_FRESH_APPROVAL_EVIDENCE_INVALID'],
  ['v1 allowlist widening', (value) => { value.receipt.releaseEpochReadiness.v1AllowlistWideningAllowed = true }, 'P6_SERVER_OWNED_RELEASE_EPOCH_READINESS_INVALID'],
  ['evidence digest tamper', (value) => { value.receipt.evidence.reviewedByReference = 'different_reviewer_02' }, 'P6_EVIDENCE_PACKET_DIGEST_INVALID'],
]) {
  const value = clone(recorded)
  mutate(value)
  rehash(value.receipt)
  assert.ok(codes(assessLegalDocumentRolloutPhase6({ ...value, now })).includes(expectedCode), `${label} should produce ${expectedCode}`)
}

assert.throws(
  () => finalizeLegalDocumentRolloutPhase6Receipt({
    pendingPlan: pending.receipt,
    phase5History: pending.phase5History,
    evidenceInput: { ...evidence(), legalApproval: { ...evidence().legalApproval, emailAddress: 'forbidden@example.test' } },
    now,
  }),
  /missing or unknown fields|forbidden sensitive|must contain only/i,
)

const policy = fs.readFileSync(new URL('./legal-document-rollout-phase6-policy.mjs', import.meta.url), 'utf8')
const context = fs.readFileSync(new URL('./legal-document-rollout-phase6-context.mjs', import.meta.url), 'utf8')
const finalizer = fs.readFileSync(new URL('./legal-document-rollout-phase6-finalize.mjs', import.meta.url), 'utf8')
const plan = fs.readFileSync(new URL('./legal-document-rollout-phase6-plan.mjs', import.meta.url), 'utf8')
const verify = fs.readFileSync(new URL('./legal-document-rollout-phase6-verify.mjs', import.meta.url), 'utf8')
const workOrder = fs.readFileSync(new URL('./legal-document-rollout-phase6-work-order.mjs', import.meta.url), 'utf8')
for (const source of [policy, context, finalizer, plan, verify, workOrder]) {
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|fetch\(|npx\s+supabase|secrets\s+(?:list|set)/)
}
for (const source of [policy, context, plan, verify, workOrder]) assert.doesNotMatch(source, /writeFileSync/)
assert.match(finalizer, /RECORD_PHASE6_SUCCESSOR_PROPOSAL/)
assert.match(finalizer, /legal-document-rollout-phase6-successor-proposal\.json/)
assert.match(finalizer, /status !== 'not_recorded'/, 'The finalizer must refuse to overwrite a Phase 6 receipt that is no longer the inert placeholder.')

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
for (const name of [
  'test:legal-documents:rollout-phase6',
  'plan:legal-documents:rollout-phase6',
  'work-order:legal-documents:rollout-phase6',
  'finalize:legal-documents:rollout-phase6',
  'verify:legal-documents:rollout-phase6',
]) assert.ok(pkg.scripts?.[name], `Missing ${name}`)

console.log('Legal-document rollout Phase 6 successor-proposal contract passed.')
