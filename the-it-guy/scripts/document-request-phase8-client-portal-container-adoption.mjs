import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'

const PHASE = 'document_request_phase8_client_portal_container_adoption'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase8-client-portal-container-adoption.json'

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
  const clientPortalSource = read('src/pages/ClientPortal.jsx')
  const documentCentreSource = read('src/components/client-portal/documents/ClientDocumentCentre.jsx')
  const serviceSource = read('src/services/clientPortalWorkspaceService.js')
  const smokeAudit = buildDocumentRequestWorkspaceSmokeAudit()
  const checks = [
    {
      key: 'document_center_service_returns_containers',
      ok: serviceSource.includes('documentRequestContainers') &&
        serviceSource.includes('documentRequestContainerSummary') &&
        serviceSource.includes('allDocumentRequestContainerSummary'),
    },
    {
      key: 'client_portal_reads_container_payload',
      ok: clientPortalSource.includes('documentRequestContainers') &&
        clientPortalSource.includes('workspaceData?.documentCenter?.documentRequestContainers'),
    },
    {
      key: 'client_portal_builds_container_backed_cards',
      ok: clientPortalSource.includes('additionalDocumentRequestContainersForWorkspace') &&
        clientPortalSource.includes('additionalDocumentRequestCardsForWorkspace') &&
        clientPortalSource.includes("source: 'container'"),
    },
    {
      key: 'primary_buyer_and_seller_workspaces_adopt_containers',
      ok: documentCentreSource.includes('hasDocumentRequestContainerPayload') &&
        documentCentreSource.includes('normalizeAdditionalRequestContainer') &&
        documentCentreSource.includes('documentRequestContainerMatchesWorkspace'),
    },
    {
      key: 'authoritative_empty_container_payload_is_fail_closed',
      ok: documentCentreSource.includes('hasDocumentRequestContainerPayload') &&
        documentCentreSource.includes("item.sourceType !== 'additional_request'") &&
        documentCentreSource.includes('containerAdditionalRequests'),
    },
    {
      key: 'client_portal_keeps_legacy_fallback',
      ok: clientPortalSource.includes("source: 'legacy_request'") &&
        clientPortalSource.includes('additionalDocumentRequestsForWorkspace.map'),
    },
    {
      key: 'additional_tab_uses_container_cards',
      ok: clientPortalSource.includes('additionalDocumentRequestCardsForWorkspace.length') &&
        clientPortalSource.includes('additionalDocumentRequestCardsForWorkspace.map') &&
        !clientPortalSource.includes('{additionalDocumentRequestsForWorkspace.map((request) =>'),
    },
    {
      key: 'container_upload_uses_upload_spec_request_id',
      ok: clientPortalSource.includes('request.uploadSpec?.requestId') &&
        clientPortalSource.includes('documentRequestId,') &&
        clientPortalSource.includes("category: 'Additional Requests'"),
    },
    {
      key: 'workspace_smoke_still_passes',
      ok: smokeAudit.summary.failedSmokeCount === 0 &&
        smokeAudit.summary.unstableContainerIdCount === 0 &&
        smokeAudit.summary.deferredSellerUploadLeakCount === 0,
    },
  ]
  const failed = checks.filter((check) => !check.ok)
  const warnings = []
  if (clientPortalSource.includes("source: 'legacy_request'")) {
    warnings.push({
      code: 'legacy_request_fallback_retained',
      message: 'The client portal keeps a fallback path for older payloads that do not include documentRequestContainers.',
    })
  }
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: 'document_request_client_portal_container_adoption_v2',
    smokeSummary: smokeAudit.summary,
    phase8Decisions: [
      {
        key: 'container_first_rendering',
        decision: 'The primary buyer, primary seller, and advanced client document views render documentRequestContainers first and use raw additionalDocumentRequests only when the container field is absent.',
      },
      {
        key: 'upload_spec_drives_request_upload',
        decision: 'Container-backed request cards upload against uploadSpec.requestId so the same request container is updated after upload.',
      },
      {
        key: 'legacy_payload_compatibility',
        decision: 'Legacy request rendering remains as fallback until all environments reliably return documentRequestContainers.',
      },
      {
        key: 'authoritative_empty_payload_boundary',
        decision: 'When documentRequestContainers is present but empty, the portal treats it as authoritative and does not revive legacy request rows.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'client_portal_container_adoption_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase9: failed.length === 0,
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
    failedChecks: report.gate.failed.length,
    warnings: report.gate.warnings.length,
    smokeSummary: report.smokeSummary,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
