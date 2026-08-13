import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  DOCUMENT_REQUEST_WORKSPACE_SMOKE_VERSION,
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'

const PHASE = 'document_request_phase7_workspace_smoke'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase7-workspace-smoke.json'

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
  const audit = buildDocumentRequestWorkspaceSmokeAudit()
  const clientPortalService = read('src/services/clientPortalWorkspaceService.js')
  const clientPortalPage = read('src/pages/ClientPortal.jsx')
  const unitDetailPage = read('src/pages/UnitDetail.jsx')
  const attorneyTransactionPage = read('src/pages/AttorneyTransactionDetail.jsx')
  const attorneyLanePanel = read('src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx')

  const checks = [
    {
      key: 'workspace_smoke_service_exists',
      ok: read('src/services/documents/documentRequestWorkspaceSmokeService.js').includes(DOCUMENT_REQUEST_WORKSPACE_SMOKE_VERSION),
    },
    {
      key: 'client_portal_document_center_returns_containers',
      ok: clientPortalService.includes('documentRequestContainers') &&
        clientPortalService.includes('documentRequestContainerSummary') &&
        clientPortalService.includes('buildDocumentRequestContainerModel'),
    },
    {
      key: 'client_portal_consumes_additional_requests',
      ok: clientPortalPage.includes('additionalDocumentRequestsForWorkspace') &&
        clientPortalPage.includes('onUploadRequestDocument'),
    },
    {
      key: 'agent_workspace_can_create_additional_requests',
      ok: unitDetailPage.includes('createTransactionDocumentRequests') &&
        unitDetailPage.includes('handleCreateDocumentRequest') &&
        unitDetailPage.includes('additionalDocumentRequests'),
    },
    {
      key: 'attorney_workspace_can_create_additional_requests',
      ok: attorneyTransactionPage.includes('createTransactionDocumentRequests') &&
        attorneyTransactionPage.includes('handleCreateDocumentRequest') &&
        attorneyTransactionPage.includes('buildAttorneyDocumentControl') &&
        attorneyTransactionPage.includes('additionalRequests: additionalDocumentRequests'),
    },
    {
      key: 'attorney_lane_request_ui_wired',
      ok: attorneyLanePanel.includes('requestAttorneyWorkflowLaneDocument') &&
        attorneyLanePanel.includes('handleDocumentSubmit'),
    },
    {
      key: 'workspace_smoke_passed',
      ok: audit.summary.failedSmokeCount === 0,
    },
    {
      key: 'container_ids_stable_across_audiences',
      ok: audit.summary.unstableContainerIdCount === 0,
    },
    {
      key: 'no_deferred_seller_upload_leak',
      ok: audit.summary.deferredSellerUploadLeakCount === 0,
    },
  ]
  const failed = checks.filter((check) => !check.ok)
  const warnings = []
  if (!clientPortalPage.includes('documentRequestContainers')) {
    warnings.push({
      code: 'client_portal_renders_legacy_additional_request_lists',
      message: 'The client portal service returns documentRequestContainers, while the page still renders its existing additional-request lists.',
    })
  }
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: DOCUMENT_REQUEST_WORKSPACE_SMOKE_VERSION,
    transactionId: audit.transactionId,
    scenario: audit.scenario,
    fixtureSummary: audit.fixtureSummary,
    audienceSummaries: audit.audienceSummaries,
    results: audit.results,
    crossAudienceContainerIds: audit.crossAudienceContainerIds,
    failed: audit.failed,
    unstableContainerIds: audit.unstableContainerIds,
    summary: audit.summary,
    phase7Decisions: [
      {
        key: 'workspace_smoke_matrix',
        decision: 'Phase 7 uses a synthetic but canonical transaction fixture to smoke buyer, seller, agent, attorney, bond-originator, and internal audiences.',
      },
      {
        key: 'same_container_everywhere',
        decision: 'The same document_requests row must resolve to the same request container id wherever it is visible.',
      },
      {
        key: 'deferred_seller_docs_guard',
        decision: 'Acquisition and capital-improvement records remain blocked from seller upload smoke fixtures.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'workspace_smoke_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase8: failed.length === 0,
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
    failedSmokeCount: report.summary.failedSmokeCount,
    unstableContainerIdCount: report.summary.unstableContainerIdCount,
    deferredSellerUploadLeakCount: report.summary.deferredSellerUploadLeakCount,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
