import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assessLegalDocumentRolloutPhase7,
  rolloutPhase7ManifestDigest,
} from './legal-document-rollout-phase7-policy.mjs'
import { collectLegalDocumentRolloutPhase7Context } from './legal-document-rollout-phase7-context.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function fail(message) {
  throw new Error(`Phase 7 implementation-boundary work order blocked: ${message}`)
}

function main() {
  const allowed = new Set(['plan'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--') || !allowed.has(value.slice(2).split('=')[0])) fail(`Unknown argument: ${value}`)
  }
  const planArg = option('plan')
  if (!planArg) fail('--plan=<saved-pending-phase7-boundary.json> is required.')
  const plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), planArg), 'utf8'))
  if (plan.status !== 'pending_boundary' || plan.manifestDigest !== rolloutPhase7ManifestDigest(plan)) fail('The supplied pending plan is not a valid Phase 7 boundary plan.')
  const context = collectLegalDocumentRolloutPhase7Context({
    phase6ReceiptCommitSha: plan.source?.phase6ReceiptCommitSha,
    implementationCommitSha: plan.source?.implementationCommitSha,
  })
  const report = assessLegalDocumentRolloutPhase7({
    receipt: plan,
    phase6History: context.phase6History,
    staticBoundaryFacts: context.staticBoundaryFacts,
  })
  if (report.status !== 'IMPLEMENTATION_BOUNDARY_READY') fail('The pending boundary no longer binds valid immutable Phase 6 history and implementation-source facts.')
  console.log(JSON.stringify({
    action: 'emit_non_executable_successor_implementation_boundary_work_order',
    immutableInputs: {
      phase6ReceiptCommitSha: plan.source?.phase6ReceiptCommitSha || null,
      phase6ReceiptManifestDigest: plan.source?.phase6ReceiptManifestDigest || null,
      implementationCommitSha: plan.source?.implementationCommitSha || null,
      implementationCommitDiffDigest: plan.source?.implementationCommitDiffDigest || null,
      implementationSourceTreeDigest: plan.source?.implementationSourceTreeDigest || null,
      migrationSourceDigest: plan.migrationReference?.migrationSourceDigest || null,
      migrationInvariantDigest: plan.migrationReference?.migrationInvariantDigest || null,
    },
    existingScope: {
      organisationCount: Array.isArray(plan.cohort?.organisationIds) ? plan.cohort.organisationIds.length : 0,
      cohortDigest: plan.cohort?.cohortDigest || null,
      packetTypes: plan.cohort?.requiredPacketTypes || [],
      maxOrganisations: plan.cohort?.maxOrganisations ?? null,
    },
    boundary: plan.changeSurface,
    sequence: [
      'Use separately authorised governance channels to obtain fresh architecture, security, and non-activation review decisions. This work order does not invoke those channels.',
      'Reduce each decision to a SHA-256 evidence digest, review timestamp, and opaque actor reference. Do not copy approval text, PII, candidate or organisation identifiers, credentials, email addresses, tokens, URLs, raw logs, document bytes, or storage paths into the evidence JSON.',
      'Confirm the exact one existing organisation and mandate/OTP packet types remain unchanged. Do not choose or contact a candidate organisation.',
      'Treat the Phase 6 migration only as an immutable source reference. Do not apply it, prepare a release epoch, register a membership, call a successor RPC, change a runtime guard/secret, deploy, generate/send customer documents, or roll back.',
      'Use the local finalizer to derive immutable boundary and evidence digests. A later, separately authorised process—not this work order—would be required before any implementation work.',
    ],
    executionBoundary: 'This command reads a saved plan and named local Git blobs only. It performs no network, database, migration, deployment, provider, customer, email, rollback, or repository mutation.',
    mutatedData: false,
  }, null, 2))
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 7 implementation-boundary work order blocked.')
    process.exitCode = 1
  }
}
