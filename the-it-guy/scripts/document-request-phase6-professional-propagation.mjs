import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_VERSION,
  buildDocumentRequestProfessionalPropagationAudit,
} from '../src/services/documents/documentRequestProfessionalPropagationService.js'

const PHASE = 'document_request_phase6_professional_propagation'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase6-professional-propagation.json'

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
  const audit = buildDocumentRequestProfessionalPropagationAudit()
  const apiSource = read('src/lib/api.js')
  const laneSource = read('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const laneInsertSource = laneSource.slice(
    laneSource.indexOf('async function insertDocumentRequest'),
    laneSource.indexOf('async function uploadAttorneyDocumentFile'),
  )
  const containerSource = read('src/core/documents/documentRequestContainerModel.js')
  const migrationSource = read('../supabase/migrations/20260827163336_document_request_professional_visibility_phase6.sql')

  const checks = [
    {
      key: 'professional_propagation_model_exists',
      ok: read('src/services/documents/documentRequestProfessionalPropagationService.js')
        .includes(DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_VERSION),
    },
    {
      key: 'general_api_stores_request_container_fields',
      ok: [
        'requested_from',
        'visibility_scope',
        'created_by_role',
        'request_group_id',
        'resolveDefaultDocumentRequestVisibility',
      ].every((token) => apiSource.includes(token)),
    },
    {
      key: 'attorney_lane_preserves_shared_request_fields',
      ok: !laneInsertSource.includes('delete fallback.visibility_scope') &&
        !laneInsertSource.includes('delete fallback.requested_from'),
    },
    {
      key: 'visibility_is_authoritative_and_fail_closed',
      ok: containerSource.includes('normalizedVisibility === CLIENT_VISIBLE') &&
        apiSource.includes('Fail closed: without these fields the client audience cannot be determined safely') &&
        apiSource.includes('Professional document request propagation is not set up'),
    },
    {
      key: 'phase6_schema_contract_exists',
      ok: migrationSource.includes('document_requests_visibility_scope_check') &&
        migrationSource.includes('document_requests_requested_from_check'),
    },
    {
      key: 'container_model_supports_additional_requests',
      ok: containerSource.includes('normalizeAdditionalDocumentRequestContainer') &&
        containerSource.includes('createdByRole') &&
        containerSource.includes('requested_from'),
    },
    {
      key: 'no_missing_audience',
      ok: audit.summary.missingAudienceCount === 0,
    },
    {
      key: 'no_leaked_audience',
      ok: audit.summary.leakedAudienceCount === 0,
    },
    {
      key: 'upload_transition_links_container',
      ok: audit.summary.uploadTransitionOk === true,
    },
  ]
  const failed = checks.filter((check) => !check.ok)
  const warnings = []
  if (apiSource.includes("isMissingTableError(insert.error, 'document_requests')")) {
    warnings.push({
      code: 'runtime_requires_document_request_tables',
      message: 'Professional request propagation depends on the document_requests table being present in the target environment.',
    })
  }
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_VERSION,
    scenarioCount: audit.scenarioCount,
    summary: audit.summary,
    results: audit.results,
    missingAudience: audit.missingAudience,
    leakedAudience: audit.leakedAudience,
    uploadTransition: audit.uploadTransition,
    phase6Decisions: [
      {
        key: 'single_container_source',
        decision: 'Professional document requests use document_requests rows as the single source for additional request containers.',
      },
      {
        key: 'client_visible_request_propagation',
        decision: 'A client-visible request from an attorney or bond originator appears to the targeted client party, the agent, the requester role, attorneys, and internal users.',
      },
      {
        key: 'professional_only_request_scope',
        decision: 'Shared role-player requests stay out of buyer/seller portals even when a legacy target field names a client party.',
      },
      {
        key: 'visibility_scope_is_authoritative',
        decision: 'A professional-only visibility scope always overrides a buyer or seller target for portal, email, and notification delivery.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'professional_request_propagation_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase7: failed.length === 0,
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
    missingAudienceCount: report.summary.missingAudienceCount,
    leakedAudienceCount: report.summary.leakedAudienceCount,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
