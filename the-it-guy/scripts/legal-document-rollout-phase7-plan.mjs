import {
  assessLegalDocumentRolloutPhase7,
  createPendingLegalDocumentRolloutPhase7Receipt,
} from './legal-document-rollout-phase7-policy.mjs'
import { collectLegalDocumentRolloutPhase7Context } from './legal-document-rollout-phase7-context.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['environment', 'prepared-by-reference', 'reference', 'phase6-receipt-commit', 'implementation-commit'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    if (!allowed.has(value.slice(2).split('=')[0])) throw new Error(`Unknown argument: ${value}`)
  }
}

function validCommit(value) {
  return /^[0-9a-f]{40}$/i.test(value)
}

function run() {
  assertKnownOptions()
  const phase6ReceiptCommitSha = option('phase6-receipt-commit')
  const implementationCommitSha = option('implementation-commit')
  const context = collectLegalDocumentRolloutPhase7Context({ phase6ReceiptCommitSha, implementationCommitSha })
  const receipt = createPendingLegalDocumentRolloutPhase7Receipt({
    phase6History: context.phase6History,
    staticBoundaryFacts: context.staticBoundaryFacts,
    preparedByReference: option('prepared-by-reference'),
    changeReference: option('reference'),
  })
  const report = assessLegalDocumentRolloutPhase7({
    receipt,
    phase6History: context.phase6History,
    staticBoundaryFacts: context.staticBoundaryFacts,
  })
  const environmentError = option('environment') === 'production' ? null : 'Phase 7 planning requires --environment=production.'
  const phase6CommitError = validCommit(phase6ReceiptCommitSha) ? null : 'Phase 7 planning requires an explicit --phase6-receipt-commit=<40-hex-SHA>.'
  const implementationCommitError = validCommit(implementationCommitSha) ? null : 'Phase 7 planning requires an explicit --implementation-commit=<40-hex-SHA>.'
  console.log(JSON.stringify({
    ...report,
    action: 'emit_local_non_executable_successor_implementation_boundary_plan',
    environmentError,
    phase6CommitError,
    implementationCommitError,
    proposedReceipt: receipt,
    immutableInputs: {
      phase6ReceiptCommitSha: receipt.source.phase6ReceiptCommitSha,
      implementationCommitSha: receipt.source.implementationCommitSha,
      implementationCommitDiffDigest: receipt.source.implementationCommitDiffDigest,
      implementationSourceTreeDigest: receipt.source.implementationSourceTreeDigest,
      migrationSourceDigest: receipt.migrationReference.migrationSourceDigest,
      migrationInvariantDigest: receipt.migrationReference.migrationInvariantDigest,
    },
    staticBoundary: {
      sourcePathsRegular: context.staticBoundaryFacts.sourcePathsRegular,
      noSuccessorRpcRuntimeCallers: context.staticBoundaryFacts.noSuccessorRpcRuntimeCallers,
      noMigrationApplyCallers: context.staticBoundaryFacts.noMigrationApplyCallers,
      legacyActivatorsRetired: context.staticBoundaryFacts.legacyActivatorsRetired,
      implementationCommitDescendsFromPhase6: context.staticBoundaryFacts.implementationCommitDescendsFromPhase6,
      implementationCommitDiffValid: context.staticBoundaryFacts.implementationCommitDiffValid,
    },
    requiredEvidence: [
      'Obtain fresh, separately governed architecture, security, and non-activation review decisions. These scripts do not contact those governance systems.',
      'Record only SHA-256 evidence digests, opaque actor references, and timestamps. Do not include PII, candidate or organisation identifiers, secrets, tokens, URLs, raw approval text, logs, document bytes, or storage paths.',
      'Keep the existing one-organisation mandate/OTP cohort unchanged. The Phase 6 migration remains an unapplied reference; do not prepare an epoch, register membership, add a candidate, call a successor RPC, change runtime, deploy, generate/send a customer document, or roll back.',
      'Use the local finalizer only after review. A recorded Phase 7 boundary is a future-review artifact, never an implementation or activation instruction.',
    ],
    instructions: report.status === 'IMPLEMENTATION_BOUNDARY_READY' && !environmentError && !phase6CommitError && !implementationCommitError
      ? 'Save the pending plan outside the release worktree. This command used only local Git blobs and did not change a runtime, provider, customer, migration, or repository receipt.'
      : 'Do not collect or record a Phase 7 boundary until every HOLD blocker is resolved. This command used only local Git blobs and changed no state.',
  }, null, 2))
  if (environmentError || phase6CommitError || implementationCommitError || report.status === 'HOLD') process.exitCode = 1
}

try {
  run()
} catch (error) {
  console.error(`Phase 7 implementation-boundary plan blocked: ${error.message}`)
  process.exitCode = 1
}
