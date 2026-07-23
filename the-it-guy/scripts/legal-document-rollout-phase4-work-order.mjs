import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
  ROLLOUT_PHASE4_WATCHDOG_CONTRACT,
  rolloutPhase4ManifestDigest,
} from './legal-document-rollout-phase4-policy.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function fail(message) {
  throw new Error(`Phase 4 pilot work order blocked: ${message}`)
}

function main() {
  const allowed = new Set(['plan'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--') || !allowed.has(value.slice(2).split('=')[0])) fail(`Unknown argument: ${value}`)
  }
  const planArg = option('plan')
  if (!planArg) fail('--plan=<saved-pending-phase4-plan.json> is required.')
  const plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), planArg), 'utf8'))
  if (plan.status !== 'pending_activation' || plan.manifestDigest !== rolloutPhase4ManifestDigest(plan)) fail('The supplied pending plan is not a valid Phase 4 plan.')
  console.log(JSON.stringify({
    action: 'emit_single_organisation_production_pilot_work_order',
    planManifestDigest: plan.manifestDigest,
    activationPlanDigest: plan.source?.activationPlanDigest || null,
    target: {
      productionProjectRef: plan.environment?.productionProjectRef || null,
      productionOrigin: plan.environment?.productionOrigin || null,
      productionUrl: plan.environment?.productionUrl || null,
      organisationIds: plan.cohort?.organisationIds || [],
      phase3ReceiptCommitSha: plan.source?.phase3ReceiptCommitSha || null,
    },
    runtime: {
      runtimeGuardContract: ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
      watchdogContract: ROLLOUT_PHASE4_WATCHDOG_CONTRACT,
      requiredActivationValues: {
        LEGAL_DOCUMENT_PILOT_ENABLED: 'true',
        LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: Array.isArray(plan.cohort?.organisationIds) ? plan.cohort.organisationIds.join(',') : null,
        LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: plan.source?.activationPlanDigest || null,
      },
      requiredDarkLaunchValues: {
        LEGAL_DOCUMENT_PILOT_ENABLED: 'false',
        LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: '__none__',
      },
    },
    sequence: [
      'Capture redacted pre-activation evidence proving the production runtime is disabled and no scale is enabled.',
      'Capture redacted candidate-readiness evidence for only the named organisation and its mandate/OTP routes.',
      'Use the separately authorised remote activation procedure with exact plan/project/cohort confirmations; verify the resulting secret/configuration digests and route coverage.',
      'Arm and probe the scoped production watchdog. A zero-completion baseline may be warning_empty only when blockerCount is zero.',
      'Capture the owned dark-launch restore dry run and rollback evidence, then finalize the local P4 receipt.',
    ],
    evidenceRedaction: 'Record SHA-256 digests, safe opaque provider identifiers, UUIDs, timestamps, counts, project/origin identities, and safe source metadata only. Do not record secret values, credentials, email addresses, signer tokens, signed URLs, raw provider logs, onboarding facts, or document bytes.',
    executionBoundary: 'This command makes no network request and writes no remote or repository state. It is a work order for separately authorised operators.',
    mutatedData: false,
  }, null, 2))
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 4 pilot work order blocked.')
    process.exitCode = 1
  }
}
