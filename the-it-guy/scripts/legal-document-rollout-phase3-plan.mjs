import {
  assessLegalDocumentRolloutPhase3,
  createPendingLegalDocumentRolloutPhase3Receipt,
} from './legal-document-rollout-phase3-policy.mjs'
import { collectLegalDocumentRolloutPhase3Context } from './legal-document-rollout-phase3-context.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['environment', 'production-project-ref', 'production-origin', 'production-url', 'prepared-by', 'reference'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    const name = value.slice(2).split('=')[0]
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${value}`)
  }
}

function run() {
  assertKnownOptions()
  const context = collectLegalDocumentRolloutPhase3Context()
  const receipt = createPendingLegalDocumentRolloutPhase3Receipt({
    phase0Freeze: context.freeze,
    phase1Receipt: context.phase1Receipt,
    phase2Receipt: context.phase2Receipt,
    phase2History: context.phase2History,
    productionProjectRef: option('production-project-ref'),
    productionOrigin: option('production-origin'),
    productionUrl: option('production-url'),
    preparedBy: option('prepared-by'),
    changeReference: option('reference'),
  })
  const report = assessLegalDocumentRolloutPhase3({
    receipt,
    phase0Freeze: context.freeze,
    phase0Report: context.phase0Report,
    phase1Receipt: context.phase1Receipt,
    phase1Report: context.phase1Report,
    phase2Receipt: context.phase2Receipt,
    phase2Report: context.phase2Report,
    phase2History: context.phase2History,
  })
  const environmentError = option('environment') === 'production' ? null : 'Phase 3 planning requires --environment=production.'
  console.log(JSON.stringify({
    ...report,
    action: 'emit_production_dark_launch_preflight_plan',
    environmentError,
    proposedReceipt: receipt,
    requiredOperatorEvidence: [
      'Perform only explicitly authorised, read-only production observations plus the separately authorised dark deployment procedure. This command did neither.',
      'Bind a READY Vercel production deployment to the frozen commit, exact production URL, exact production Supabase origin, release marker, generated manifest/index/asset digests, and redacted provider metadata digest.',
      'Observe the complete Phase 1 migration set and Edge Function deploy unit in the exact production project; record chained ledger, catalog, behavior, no-residue, provider-revision, and configuration-review digests only.',
      'Prove the runtime remains disabled: pilot false, allowlist __none__, creation paused, generation false, customer delivery false, and scale false. Do not save secret values or credentials in evidence.',
      'Bind routable production templates to the frozen B1 review and record monitoring, incident, and disabled-runtime rollback dry-run evidence with named operations ownership.',
      'Do not activate a cohort, create customer documents, send email, modify templates, run a rollback, or execute a production write as part of this Phase 3 receipt.',
    ],
    instructions: report.status === 'PRODUCTION_PREFLIGHT_PLANNED' && !environmentError
      ? 'Save the proposed receipt outside the clean release worktree. After the separately authorised dark-launch observations, use the finalizer to produce the one permitted Phase 3 receipt; do not write the canonical config before review.'
      : 'No Phase 3 production preflight may be claimed as planned until every HOLD blocker is resolved. This command did not contact production or change any state.',
  }, null, 2))
  if (environmentError || report.status === 'HOLD') process.exitCode = 1
}

try {
  run()
} catch (error) {
  console.error(`Phase 3 production-preflight plan blocked: ${error.message}`)
  process.exitCode = 1
}
