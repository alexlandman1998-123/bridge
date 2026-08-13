import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildBuyerDocumentCanonicalCleanupAudit,
} from '../src/services/documents/buyerDocumentCanonicalCleanupService.js'

const PHASE = 'document_request_phase3_buyer_cleanup'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase3-buyer-cleanup.json'

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    output: DEFAULT_OUTPUT_PATH,
    strict: false,
    pretty: true,
  }
  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg === '--strict') options.strict = true
    else if (arg === '--compact') options.pretty = false
  }
  return options
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function buildReport(options = {}) {
  const audit = buildBuyerDocumentCanonicalCleanupAudit()
  const buyerEngineSource = read('src/lib/buyerRequirementEngine.js')
  const portalSource = read('src/services/clientPortalWorkspaceService.js')
  const checks = [
    {
      key: 'buyer_engine_has_canonical_metadata',
      ok: buyerEngineSource.includes('withCanonicalDocumentRequestMetadata'),
    },
    {
      key: 'portal_filters_professional_only_buyer_rows',
      ok: portalSource.includes('isClientPortalProfessionalOnlyRequirement'),
    },
    {
      key: 'no_unmapped_buyer_rows',
      ok: audit.summary.unmappedCount === 0,
    },
    {
      key: 'professional_legacy_rows_identified',
      ok: audit.summary.professionalOnlyLegacyCount > 0,
    },
    {
      key: 'canonical_plan_covers_legacy_gaps',
      ok: audit.summary.missingCoveredByCanonicalPlanCount > 0,
    },
  ]
  const failed = checks.filter((check) => !check.ok)
  const warnings = [
    ...(audit.summary.professionalOnlyLegacyCount
      ? [
          {
            code: 'legacy_buyer_profile_contains_professional_rows',
            message: 'Legacy buyer profiles still emit professional/generated rows such as OTP and transfer documents; portal upload filtering and canonical overlay now keep buyer upload requests clean.',
            count: audit.summary.professionalOnlyLegacyCount,
          },
        ]
      : []),
    ...(audit.summary.missingCoveredByCanonicalPlanCount
      ? [
          {
            code: 'canonical_overlay_adds_buyer_policy_rows',
            message: 'Canonical buyer plans include policy rows not represented as one-to-one legacy upload rows, such as marital/source-of-funds declarations.',
            count: audit.summary.missingCoveredByCanonicalPlanCount,
          },
        ]
      : []),
  ]
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    audit,
    phase3Decisions: [
      {
        key: 'buyer_upload_source',
        decision: 'Buyer upload requests come from canonical buyer client-visible requirements, not raw legacy sale/transfer rows.',
      },
      {
        key: 'professional_generated_documents',
        decision: 'OTP and transfer documents remain transaction/professional documents and should not appear as buyer upload requests.',
      },
      {
        key: 'legacy_fallback',
        decision: 'Legacy buyer rows remain as fallback data until backfill and rollout prove parity; canonical metadata and portal filtering control client-facing upload behaviour.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : warnings.length ? 'buyer_cleanup_mapped_with_warnings' : 'buyer_cleanup_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase4: failed.length === 0,
      productionActivationReady: failed.length === 0 && warnings.length === 0,
      checks,
      failed,
      warnings,
    },
  }
}

async function main() {
  const options = parseArgs()
  const report = buildReport(options)
  const outputPath = path.resolve(process.cwd(), options.output)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`)
  console.log(JSON.stringify({
    phase: report.phase,
    status: report.gate.status,
    output: options.output,
    mutatedData: report.mutatedData,
    scenarioCount: report.audit.scenarioCount,
    unmappedCount: report.audit.summary.unmappedCount,
    professionalOnlyLegacyCount: report.audit.summary.professionalOnlyLegacyCount,
    missingCoveredByCanonicalPlanCount: report.audit.summary.missingCoveredByCanonicalPlanCount,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
