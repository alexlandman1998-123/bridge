import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
  buildSellerDocumentCanonicalCleanupAudit,
} from '../src/services/documents/sellerDocumentCanonicalCleanupService.js'

const PHASE = 'document_request_phase5_seller_cleanup'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase5-seller-cleanup.json'

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
  const audit = buildSellerDocumentCanonicalCleanupAudit()
  const serviceSource = read('src/services/documents/sellerDocumentCanonicalCleanupService.js')
  const sellerRequirementSource = read('src/services/sellerDocumentRequirementsService.js')
  const portalSource = read('src/services/clientPortalWorkspaceService.js')

  const checks = [
    {
      key: 'seller_cleanup_service_exists',
      ok: serviceSource.includes(SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION),
    },
    {
      key: 'seller_scenarios_cover_core_entities',
      ok: audit.scenarioCount >= 10 &&
        ['company_seller', 'trust_seller', 'deceased_estate', 'power_of_attorney'].every((id) =>
          audit.results.some((result) => result.id === id),
        ),
    },
    {
      key: 'no_unmapped_seller_requirements',
      ok: audit.summary.unmappedCount === 0,
    },
    {
      key: 'deferred_acquisition_improvement_not_requested',
      ok: audit.summary.deferredSellerUploadCount === 0 &&
        sellerRequirementSource.includes('property_acquisition_record') &&
        sellerRequirementSource.includes('capital_improvement_records'),
    },
    {
      key: 'seller_portal_filters_deferred_uploads',
      ok: portalSource.includes('isDeferredSellerUploadRequirement') &&
        portalSource.includes('DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS'),
    },
    {
      key: 'seller_containers_are_modelled',
      ok: audit.results.every((result) => Number(result.profile.containerSummary?.total || 0) > 0),
    },
  ]
  const failed = checks.filter((check) => !check.ok)
  const warnings = []
  if (audit.summary.missingCoveredByCanonicalPlanCount > 0) {
    warnings.push({
      code: 'legacy_seller_generator_not_full_canonical_policy',
      message: 'The legacy seller generator is mapped, but some canonical seller policy containers are not emitted by every seller scenario yet.',
      count: audit.summary.missingCoveredByCanonicalPlanCount,
    })
  }
  if (audit.summary.duplicateCanonicalGroupCount > 0) {
    warnings.push({
      code: 'legacy_rows_roll_up_to_parent_containers',
      message: 'Some detailed seller rows roll up to one canonical parent container, such as company/trust FICA and bond-statement support rows.',
      count: audit.summary.duplicateCanonicalGroupCount,
    })
  }
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
    scenarioCount: audit.scenarioCount,
    summary: audit.summary,
    results: audit.results,
    unmapped: audit.unmapped,
    professionalOnly: audit.professionalOnly,
    missingCoveredByCanonicalPlan: audit.missingCoveredByCanonicalPlan,
    deferredSellerUploads: audit.deferredSellerUploads,
    phase5Decisions: [
      {
        key: 'seller_portal_agent_workspace_alignment',
        decision: 'Agent-upload and seller-portal seller documents are audited against the same canonical seller audience plan.',
      },
      {
        key: 'defer_acquisition_and_improvements',
        decision: 'Original acquisition records and capital-improvement/CGT records are not seller upload requests at this phase unless legal policy explicitly enables them later.',
      },
      {
        key: 'professional_only_separation',
        decision: 'Professional-only seller policy requests remain visible to attorney workflows, not as seller portal upload prompts.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'seller_cleanup_mapped_with_warnings',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase6: failed.length === 0,
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
    version: report.version,
    scenarioCount: report.scenarioCount,
    unmappedCount: report.summary.unmappedCount,
    deferredSellerUploadCount: report.summary.deferredSellerUploadCount,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
