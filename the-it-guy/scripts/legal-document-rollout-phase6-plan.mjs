import {
  assessLegalDocumentRolloutPhase6,
  createPendingLegalDocumentRolloutPhase6Receipt,
} from './legal-document-rollout-phase6-policy.mjs'
import { collectLegalDocumentRolloutPhase6Context } from './legal-document-rollout-phase6-context.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['environment', 'prepared-by-reference', 'reference', 'phase5-receipt-commit'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    if (!allowed.has(value.slice(2).split('=')[0])) throw new Error(`Unknown argument: ${value}`)
  }
}

function run() {
  assertKnownOptions()
  const phase5ReceiptCommitSha = option('phase5-receipt-commit')
  const context = collectLegalDocumentRolloutPhase6Context({ phase5ReceiptCommitSha })
  const receipt = createPendingLegalDocumentRolloutPhase6Receipt({
    phase5History: context.phase5History,
    preparedByReference: option('prepared-by-reference'),
    changeReference: option('reference'),
  })
  const report = assessLegalDocumentRolloutPhase6({ receipt, phase5History: context.phase5History })
  const environmentError = option('environment') === 'production' ? null : 'Phase 6 planning requires --environment=production.'
  const commitError = /^[0-9a-f]{40}$/i.test(phase5ReceiptCommitSha) ? null : 'Phase 6 planning requires an explicit --phase5-receipt-commit=<40-hex-SHA>.'
  console.log(JSON.stringify({
    ...report,
    action: 'emit_local_non_authoritative_successor_proposal_plan',
    environmentError,
    commitError,
    proposedReceipt: receipt,
    proposalEnvelope: {
      proposalPlanDigest: receipt.source.proposalPlanDigest,
      phase5ReceiptCommitSha: receipt.source.phase5ReceiptCommitSha,
      phase5ReceiptManifestDigest: receipt.source.phase5ReceiptManifestDigest,
      phase5ObservationPlanDigest: receipt.source.phase5ObservationPlanDigest,
      existingOrganisationIds: receipt.cohort.organisationIds,
      requiredPacketTypes: receipt.cohort.requiredPacketTypes,
      inventoryAuthority: receipt.inventory.authority,
      releaseEpochReadiness: {
        serverOwnedReleaseEpochContract: receipt.releaseEpochReadiness.serverOwnedReleaseEpochContract,
        releaseEpochMigrationId: receipt.releaseEpochReadiness.releaseEpochMigrationId,
        v1AllowlistWideningAllowed: receipt.releaseEpochReadiness.v1AllowlistWideningAllowed,
      },
    },
    requiredEvidence: [
      'Collect fresh, separately approved legal and release decisions through authorised governance procedures. The Phase 6 scripts do not contact those systems.',
      'Store only redacted SHA-256 approval evidence digests, opaque actor references, timestamps, and a digest-only non-authority candidate inventory. Do not place PII, customer identifiers, secrets, tokens, URLs, raw approval text, or candidate names in the receipt.',
      'Keep the existing one-organisation mandate/OTP cohort unchanged. The candidate inventory is research material only and does not grant a second organisation, scale, runtime, deployment, email, activation, or rollback authority.',
      'Require a redacted evidence digest for the server-owned release-epoch migration, retirement of legacy A3/Q2/V2 mutators, and preservation of the current v1 allowlist. Do not widen the v1 allowlist or activate a release epoch through this process.',
      'Use the local finalizer only after the evidence is reviewed. A recorded Phase 6 receipt is a future-review proposal, never an implementation instruction.',
    ],
    instructions: report.status === 'SUCCESSOR_PROPOSAL_READY' && !environmentError && !commitError
      ? 'Save the pending proposal outside the release worktree. This command made no network request and did not change a runtime, provider, customer, or repository receipt.'
      : 'Do not collect or record a successor proposal until every HOLD blocker is resolved. This command made no network request and changed no runtime state.',
  }, null, 2))
  if (environmentError || commitError || report.status === 'HOLD') process.exitCode = 1
}

try {
  run()
} catch (error) {
  console.error(`Phase 6 successor-proposal plan blocked: ${error.message}`)
  process.exitCode = 1
}
