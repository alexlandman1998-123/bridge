import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE5_LIFECYCLE_TRACE_CONTRACT,
  ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT,
  ROLLOUT_PHASE5_WATCHDOG_CONTRACT,
  rolloutPhase5ManifestDigest,
} from './legal-document-rollout-phase5-policy.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function fail(message) {
  throw new Error(`Phase 5 pilot-observation work order blocked: ${message}`)
}

function main() {
  const allowed = new Set(['plan'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--') || !allowed.has(value.slice(2).split('=')[0])) fail(`Unknown argument: ${value}`)
  }
  const planArg = option('plan')
  if (!planArg) fail('--plan=<saved-pending-phase5-plan.json> is required.')
  const plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), planArg), 'utf8'))
  if (plan.status !== 'pending_observation' || plan.manifestDigest !== rolloutPhase5ManifestDigest(plan)) fail('The supplied pending plan is not a valid Phase 5 plan.')
  console.log(JSON.stringify({
    action: 'emit_one_organisation_read_only_pilot_observation_work_order',
    planManifestDigest: plan.manifestDigest,
    observationPlanDigest: plan.source?.observationPlanDigest || null,
    activationPlanDigest: plan.source?.activationPlanDigest || null,
    target: {
      productionProjectRef: plan.environment?.productionProjectRef || null,
      productionOrigin: plan.environment?.productionOrigin || null,
      productionUrl: plan.environment?.productionUrl || null,
      organisationIds: plan.cohort?.organisationIds || [],
      packetTypes: plan.cohort?.requiredPacketTypes || [],
      phase4ReceiptCommitSha: plan.source?.phase4ReceiptCommitSha || null,
    },
    contracts: {
      runtimeGuardContract: ROLLOUT_PHASE5_RUNTIME_GUARD_CONTRACT,
      watchdogContract: ROLLOUT_PHASE5_WATCHDOG_CONTRACT,
      lifecycleTraceContract: ROLLOUT_PHASE5_LIFECYCLE_TRACE_CONTRACT,
    },
    acceptance: {
      minimumObservationHours: plan.observation?.minimumObservationHours || null,
      minimumHealthyScopedSnapshots: plan.observation?.minimumHealthyScopedSnapshots || null,
      maximumWarningSnapshots: plan.observation?.maximumWarningSnapshots || null,
      maximumCriticalSnapshots: plan.observation?.maximumCriticalSnapshots || null,
      maximumBlockers: plan.observation?.maximumBlockers || null,
      maximumSnapshotGapMinutes: plan.observation?.maximumSnapshotGapMinutes || null,
    },
    sequence: [
      'Record the committed Phase 4 activation timestamp and keep the exact one-organisation runtime guard and watchdog configuration unchanged for the full observation window.',
      'Collect only scoped, read-only watchdog observations. Retain redacted evidence digests and aggregate counts; do not include secrets, customer data, tokens, signed URLs, raw logs, document bytes, storage paths, or email addresses.',
      'Capture one mandate and one OTP lifecycle proof with the same activation-plan digest at generation, signing, F2, F3, F4, and authorised final-resolver access. The packet references must be SHA-256 digests, not raw identifiers.',
      'Run the read-only reconciliation for exactly the named cohort and packet types. A warning, critical, blocker, stale packet, unresolved failure, F2/F3/F4 mismatch, or resolver-access failure is a stop condition.',
      'Confirm creation remains paused, scale remains false, and a dark-launch restore remains ready. Do not activate, rollback, expand, or modify any provider configuration as part of this work order.',
      'Build a redacted evidence JSON packet and use the local finalizer. Review the output before recording the one immutable receipt-only commit.',
    ],
    executionBoundary: 'This command makes no network request and writes no remote or repository state. It is a read-only evidence checklist, not a production operation.',
    mutatedData: false,
  }, null, 2))
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 5 pilot-observation work order blocked.')
    process.exitCode = 1
  }
}
