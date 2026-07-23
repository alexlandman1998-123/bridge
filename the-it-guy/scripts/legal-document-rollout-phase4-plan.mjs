import {
  assessLegalDocumentRolloutPhase4,
  createPendingLegalDocumentRolloutPhase4Receipt,
} from './legal-document-rollout-phase4-policy.mjs'
import { collectLegalDocumentRolloutPhase4Context } from './legal-document-rollout-phase4-context.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set([
    'environment', 'production-project-ref', 'production-origin', 'production-url', 'organisation-id', 'prepared-by', 'reference',
    'approved-by', 'approved-at', 'approval-reference', 'legal-approval-evidence-digest', 'release-approval-evidence-digest',
  ])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    const name = value.slice(2).split('=')[0]
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${value}`)
  }
}

function run() {
  assertKnownOptions()
  const context = collectLegalDocumentRolloutPhase4Context()
  const receipt = createPendingLegalDocumentRolloutPhase4Receipt({
    phase0Freeze: context.freeze,
    phase1Receipt: context.phase1Receipt,
    phase2Receipt: context.phase2Receipt,
    phase3Receipt: context.phase3Receipt,
    phase3History: context.phase3History,
    organisationId: option('organisation-id'),
    productionProjectRef: option('production-project-ref'),
    productionOrigin: option('production-origin'),
    productionUrl: option('production-url'),
    preparedBy: option('prepared-by'),
    changeReference: option('reference'),
    approvedBy: option('approved-by'),
    approvedAt: option('approved-at'),
    approvalReference: option('approval-reference'),
    legalApprovalEvidenceDigest: option('legal-approval-evidence-digest'),
    releaseApprovalEvidenceDigest: option('release-approval-evidence-digest'),
  })
  const report = assessLegalDocumentRolloutPhase4({
    receipt,
    phase0Freeze: context.freeze,
    phase0Report: context.phase0Report,
    phase1Receipt: context.phase1Receipt,
    phase1Report: context.phase1Report,
    phase2Receipt: context.phase2Receipt,
    phase2Report: context.phase2Report,
    phase3Receipt: context.phase3Receipt,
    phase3Report: context.phase3Report,
    phase3History: context.phase3History,
  })
  const environmentError = option('environment') === 'production' ? null : 'Phase 4 planning requires --environment=production.'
  console.log(JSON.stringify({
    ...report,
    action: 'emit_single_organisation_production_pilot_plan',
    environmentError,
    proposedReceipt: receipt,
    activationEnvelope: {
      activationPlanDigest: receipt.source.activationPlanDigest,
      productionProjectRef: receipt.environment.productionProjectRef,
      organisationIds: receipt.cohort.organisationIds,
      runtimeGuardContract: receipt.safety.runtimeGuardContract,
      requiredRuntimeValues: {
        LEGAL_DOCUMENT_PILOT_ENABLED: 'true',
        LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: receipt.cohort.organisationIds.join(','),
        LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: receipt.source.activationPlanDigest,
      },
    },
    requiredOperatorEvidence: [
      'Verify the dark-launch runtime is currently false/__none__/no scale in the exact production project before changing anything.',
      'Verify the one selected organisation is active, staffed, has legally bound mandate and OTP routes, and has the approved attorney/release evidence. Do not reuse staging readiness output.',
      'Use only the separately authorised Phase 4 activation procedure, bind it to this activationPlanDigest, and verify the exact runtime values after the remote change. Do not edit config/legal-document-pilot.json.',
      'Prove the server-side route-coverage guard is active for generation and outbound signing/final delivery, then arm the scoped Phase 5 watchdog with zero blockers.',
      'Record a production dark-launch restore dry run, named rollback owner, and template-revocation evidence. Do not run an actual rollback unless an incident requires it.',
      'Do not add a second organisation, enable scale, modify source/templates/migrations/functions, or automatically create/send customer documents as part of the receipt procedure.',
    ],
    instructions: report.status === 'PILOT_ACTIVATION_PLANNED' && !environmentError
      ? 'Save the proposed receipt outside the clean release worktree. The remote activation remains separately authorised; after post-write evidence is captured, use the Phase 4 finalizer to produce the one permitted receipt.'
      : 'No pilot activation may be planned until every HOLD blocker is resolved. This command made no network request and changed no runtime state.',
  }, null, 2))
  if (environmentError || report.status === 'HOLD') process.exitCode = 1
}

try {
  run()
} catch (error) {
  console.error(`Phase 4 pilot plan blocked: ${error.message}`)
  process.exitCode = 1
}
