import {
  assessLegalDocumentRolloutPhase5,
  createPendingLegalDocumentRolloutPhase5Receipt,
} from './legal-document-rollout-phase5-policy.mjs'
import { collectLegalDocumentRolloutPhase5Context } from './legal-document-rollout-phase5-context.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['environment', 'prepared-by', 'reference'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    const name = value.slice(2).split('=')[0]
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${value}`)
  }
}

function run() {
  assertKnownOptions()
  const context = collectLegalDocumentRolloutPhase5Context()
  const receipt = createPendingLegalDocumentRolloutPhase5Receipt({
    phase0Freeze: context.freeze,
    phase1Receipt: context.phase1Receipt,
    phase2Receipt: context.phase2Receipt,
    phase3Receipt: context.phase3Receipt,
    phase4Receipt: context.phase4Receipt,
    phase4History: context.phase4History,
    preparedBy: option('prepared-by'),
    changeReference: option('reference'),
  })
  const report = assessLegalDocumentRolloutPhase5({
    receipt,
    phase0Freeze: context.freeze,
    phase0Report: context.phase0Report,
    phase1Receipt: context.phase1Receipt,
    phase1Report: context.phase1Report,
    phase2Receipt: context.phase2Receipt,
    phase2Report: context.phase2Report,
    phase3Receipt: context.phase3Receipt,
    phase3Report: context.phase3Report,
    phase4Receipt: context.phase4Receipt,
    phase4Report: context.phase4Report,
    phase4History: context.phase4History,
  })
  const environmentError = option('environment') === 'production' ? null : 'Phase 5 planning requires --environment=production.'
  console.log(JSON.stringify({
    ...report,
    action: 'emit_one_organisation_read_only_pilot_observation_plan',
    environmentError,
    proposedReceipt: receipt,
    observationEnvelope: {
      observationPlanDigest: receipt.source.observationPlanDigest,
      activationPlanDigest: receipt.source.activationPlanDigest,
      phase4ReceiptCommitSha: receipt.source.phase4ReceiptCommitSha,
      productionProjectRef: receipt.environment.productionProjectRef,
      organisationIds: receipt.cohort.organisationIds,
      requiredPacketTypes: receipt.cohort.requiredPacketTypes,
      minimumObservationHours: receipt.observation.minimumObservationHours,
      minimumHealthyScopedSnapshots: receipt.observation.minimumHealthyScopedSnapshots,
    },
    requiredOperatorEvidence: [
      'Collect read-only, redacted evidence for the exact Phase 4 activation-plan digest and one configured organisation only. Do not alter pilot secrets, templates, source, data, or customer communications.',
      'Observe the scoped Phase 5 watchdog continuously from the committed Phase 4 activation timestamp for at least 144 hours; record at least seven healthy snapshots, zero warnings, zero criticals, zero blockers, and no gap over 90 minutes.',
      'For one mandate and one OTP packet, prove the same release marker at generation, signing, F2 final artifact, F3 delivery/transaction, F4 surface completion, and authorised final-resolver access. Use only redacted SHA-256 references, timestamps, UUIDs, and counts.',
      'Reconcile only the named cohort and packet types. Zero unresolved generation failures, stale signing packets, missing finals, F2/F3/F4 failures, final-resolver failures, and other blockers are required.',
      'Verify creation remains paused, scale remains disabled, and the dark-launch restore path remains ready. Phase 5 must not create a second organisation or grant scale authority.',
    ],
    instructions: report.status === 'PILOT_OBSERVATION_PLANNED' && !environmentError
      ? 'Save the proposed receipt outside the clean release worktree. This command made no network request. After the six-day read-only observation, use the Phase 5 finalizer with redacted evidence to produce the one permitted receipt.'
      : 'No pilot observation may be planned until every HOLD blocker is resolved. This command made no network request and changed no runtime state.',
  }, null, 2))
  if (environmentError || report.status === 'HOLD') process.exitCode = 1
}

try {
  run()
} catch (error) {
  console.error(`Phase 5 pilot-observation plan blocked: ${error.message}`)
  process.exitCode = 1
}
