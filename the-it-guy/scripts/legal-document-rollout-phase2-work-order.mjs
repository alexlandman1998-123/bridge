import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE2_REQUIRED_SCENARIOS,
  rolloutPhase2ManifestDigest,
} from './legal-document-rollout-phase2-policy.mjs'

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function fail(message) {
  throw new Error(`Phase 2 acceptance work order blocked: ${message}`)
}

function main() {
  const allowed = new Set(['plan'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--') || !allowed.has(value.slice(2).split('=')[0])) fail(`Unknown argument: ${value}`)
  }
  const planArg = option('plan')
  if (!planArg) fail('--plan=<saved-pending-plan.json> is required.')
  const plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), planArg), 'utf8'))
  if (plan.status !== 'pending_acceptance' || plan.manifestDigest !== rolloutPhase2ManifestDigest(plan)) fail('The supplied pending plan is not a valid Phase 2 plan.')
  console.log(JSON.stringify({
    action: 'emit_controlled_staging_acceptance_work_order',
    planManifestDigest: plan.manifestDigest,
    target: {
      stagingProjectRef: plan.environment?.stagingProjectRef || null,
      stagingOrigin: plan.environment?.stagingOrigin || null,
      previewUrl: plan.environment?.previewUrl || null,
      previewReleaseId: plan.environment?.previewReleaseId || null,
    },
    controls: {
      fixtureNamespace: plan.safety?.fixtureNamespace || null,
      fixtureWriteLimit: plan.safety?.fixtureWriteLimit || null,
      externalRecipientPolicy: plan.safety?.externalRecipientPolicy || null,
      testMailboxDigest: plan.safety?.testMailboxDigest || null,
      physicalSigningRequired: plan.safety?.physicalSigningRequired === true,
    },
    requiredScenarios: [...ROLLOUT_PHASE2_REQUIRED_SCENARIOS],
    evidenceRedaction: 'Record IDs, SHA-256 evidence digests, counts, and safe storage paths only. Do not record email addresses, signing tokens, signed URLs, credentials, raw document facts, or raw provider logs.',
    executionBoundary: 'This command makes no network request and writes no fixture. It is a work order for a separately authorised controlled staging procedure.',
    mutatedData: false,
  }, null, 2))
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 2 acceptance work order blocked.')
    process.exitCode = 1
  }
}
