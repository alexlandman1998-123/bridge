import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolloutPhase3ManifestDigest } from './legal-document-rollout-phase3-policy.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function fail(message) {
  throw new Error(`Phase 3 production-preflight work order blocked: ${message}`)
}

function main() {
  const allowed = new Set(['plan'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--') || !allowed.has(value.slice(2).split('=')[0])) fail(`Unknown argument: ${value}`)
  }
  const planArg = option('plan')
  if (!planArg) fail('--plan=<saved-pending-phase3-plan.json> is required.')
  const plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), planArg), 'utf8'))
  if (plan.status !== 'pending_preflight' || plan.manifestDigest !== rolloutPhase3ManifestDigest(plan)) fail('The supplied pending plan is not a valid Phase 3 plan.')
  console.log(JSON.stringify({
    action: 'emit_production_dark_launch_preflight_work_order',
    planManifestDigest: plan.manifestDigest,
    target: {
      productionProjectRef: plan.environment?.productionProjectRef || null,
      productionOrigin: plan.environment?.productionOrigin || null,
      productionUrl: plan.environment?.productionUrl || null,
      frozenSourceCommitSha: plan.source?.commitSha || null,
      phase2ReceiptCommitSha: plan.source?.phase2ReceiptCommitSha || null,
    },
    controls: {
      pilotEnabled: plan.safety?.pilotEnabled === false,
      organisationIdsSentinel: plan.safety?.organisationIdsSentinel || null,
      creationPaused: plan.safety?.creationPaused === true,
      generationEnabled: plan.safety?.generationEnabled === false,
      customerDeliveryEnabled: plan.safety?.customerDeliveryEnabled === false,
      scaleEnabled: plan.safety?.scaleEnabled === false,
    },
    requiredEvidence: [
      'Provider-bound production deployment evidence for the frozen commit and production Supabase origin.',
      'Exact migration ledger and Edge Function deploy-unit observations for the production project.',
      'Read-only evidence that the runtime remains disabled, with no secret values included.',
      'B1-bound template-route evidence plus monitoring, incident, and disabled-runtime rollback dry-run evidence.',
    ],
    evidenceRedaction: 'Record SHA-256 evidence digests, safe opaque provider IDs, counts, timestamps, and target identities only. Do not record credentials, secret values, email addresses, signing tokens, document facts, document bytes, signed URLs, or raw provider logs.',
    executionBoundary: 'This command makes no network request and writes no production or repository state. It is a work order for separately authorised operators.',
    mutatedData: false,
  }, null, 2))
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 3 production-preflight work order blocked.')
    process.exitCode = 1
  }
}
