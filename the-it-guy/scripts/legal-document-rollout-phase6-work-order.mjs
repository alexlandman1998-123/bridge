import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessLegalDocumentRolloutPhase6, rolloutPhase6ManifestDigest } from './legal-document-rollout-phase6-policy.mjs'
import { collectLegalDocumentRolloutPhase6Context } from './legal-document-rollout-phase6-context.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function fail(message) {
  throw new Error(`Phase 6 successor-proposal work order blocked: ${message}`)
}

function main() {
  const allowed = new Set(['plan'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--') || !allowed.has(value.slice(2).split('=')[0])) fail(`Unknown argument: ${value}`)
  }
  const planArg = option('plan')
  if (!planArg) fail('--plan=<saved-pending-phase6-proposal.json> is required.')
  const plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), planArg), 'utf8'))
  if (plan.status !== 'pending_proposal' || plan.manifestDigest !== rolloutPhase6ManifestDigest(plan)) fail('The supplied pending plan is not a valid Phase 6 proposal plan.')
  const context = collectLegalDocumentRolloutPhase6Context({ phase5ReceiptCommitSha: plan.source?.phase5ReceiptCommitSha })
  const report = assessLegalDocumentRolloutPhase6({ receipt: plan, phase5History: context.phase5History })
  if (report.status !== 'SUCCESSOR_PROPOSAL_READY') fail('The pending proposal no longer binds a valid committed Phase 5 receipt.')
  console.log(JSON.stringify({
    action: 'emit_non_authoritative_successor_proposal_work_order',
    proposalPlanDigest: plan.source?.proposalPlanDigest || null,
    committedParent: {
      phase5ReceiptCommitSha: plan.source?.phase5ReceiptCommitSha || null,
      phase5ReceiptManifestDigest: plan.source?.phase5ReceiptManifestDigest || null,
      phase5ObservationPlanDigest: plan.source?.phase5ObservationPlanDigest || null,
    },
    existingScope: {
      organisationIds: plan.cohort?.organisationIds || [],
      packetTypes: plan.cohort?.requiredPacketTypes || [],
      maxOrganisations: plan.cohort?.maxOrganisations ?? null,
    },
    inventoryBoundary: plan.inventory,
    releaseEpochBoundary: {
      serverOwnedReleaseEpochContract: plan.releaseEpochReadiness?.serverOwnedReleaseEpochContract || null,
      releaseEpochMigrationId: plan.releaseEpochReadiness?.releaseEpochMigrationId || null,
      v1AllowlistWideningAllowed: plan.releaseEpochReadiness?.v1AllowlistWideningAllowed ?? null,
    },
    sequence: [
      'Use separately authorised governance channels to obtain fresh legal and release approval decisions. This work order does not invoke those channels.',
      'Reduce each approval to its SHA-256 evidence digest, approved-at timestamp, and opaque actor reference. Do not copy approval text, PII, credentials, emails, tokens, URLs, or provider data into the evidence JSON.',
      'If useful, prepare only a digest and aggregate count for the potential successor inventory. Do not list candidate organisations or treat the inventory as approval to contact, activate, or add anyone.',
      'Obtain only redacted evidence digests that the server-owned release-epoch migration is ready, legacy A3/Q2/V2 mutators are retired, and the current v1 allowlist has not been widened. Those facts are readiness evidence, not permission to activate an epoch.',
      'Confirm the one existing organisation and mandate/OTP packet types remain unchanged. Do not alter runtime configuration, templates, database state, deployment state, customer messages, or rollback state.',
      'Use the local finalizer to derive immutable proposal and evidence digests, then obtain separate authority before any future implementation work.',
    ],
    executionBoundary: 'This command makes no network request and performs no production, provider, customer, deployment, email, rollback, or repository mutation.',
    mutatedData: false,
  }, null, 2))
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 6 successor-proposal work order blocked.')
    process.exitCode = 1
  }
}
