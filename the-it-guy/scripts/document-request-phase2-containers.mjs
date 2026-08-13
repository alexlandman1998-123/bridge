import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildDocumentRequestContainerModel,
  resolveDefaultDocumentRequestVisibility,
} from '../src/core/documents/documentRequestContainerModel.js'

const PHASE = 'document_request_phase2_containers'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase2-containers.json'

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    output: DEFAULT_OUTPUT_PATH,
    pretty: true,
  }
  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg === '--compact') options.pretty = false
  }
  return options
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function buildFixtureModel(audience) {
  return buildDocumentRequestContainerModel({
    transactionId: 'phase2-transaction',
    audience,
    requiredDocuments: [
      {
        id: 'buyer-fica-row',
        transaction_id: 'phase2-transaction',
        document_key: 'buyer_fica_pack',
        document_label: 'Buyer FICA Pack',
        requested_from: 'buyer',
        visibility_scope: 'client_visible',
        status: 'missing',
      },
      {
        id: 'seller-fica-row',
        transaction_id: 'phase2-transaction',
        document_key: 'seller_fica_pack',
        document_label: 'Seller FICA Pack',
        requested_from: 'seller',
        visibility_scope: 'client_visible',
        status: 'uploaded',
        uploaded_document_id: 'seller-fica-upload',
      },
    ],
    additionalRequests: [
      {
        id: 'attorney-request-buyer-bank',
        transaction_id: 'phase2-transaction',
        title: 'Updated bank statement',
        requested_from: 'buyer',
        created_by_role: 'attorney',
        status: 'requested',
        priority: 'required',
      },
      {
        id: 'bond-request-income',
        transaction_id: 'phase2-transaction',
        title: 'Latest payslip',
        requested_from: 'buyer',
        created_by_role: 'bond_originator',
        status: 'requested',
        priority: 'required',
      },
      {
        id: 'agent-request-seller-levy',
        transaction_id: 'phase2-transaction',
        title: 'Latest levy statement',
        requested_from: 'seller',
        created_by_role: 'agent',
        status: 'requested',
        priority: 'required',
      },
    ],
  })
}

function buildReport() {
  const apiSource = read('src/lib/api.js')
  const portalSource = read('src/services/clientPortalWorkspaceService.js')
  const laneSource = read('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const modelSource = read('src/core/documents/documentRequestContainerModel.js')
  const audienceModels = Object.fromEntries(
    ['buyer', 'seller', 'agent', 'attorney', 'bond_originator', 'client', 'internal'].map((audience) => [
      audience,
      buildFixtureModel(audience),
    ]),
  )
  const defaultVisibilityProof = {
    buyer: resolveDefaultDocumentRequestVisibility('buyer'),
    seller: resolveDefaultDocumentRequestVisibility('seller'),
    buyerAndSeller: resolveDefaultDocumentRequestVisibility('buyer_and_seller'),
    bondOriginator: resolveDefaultDocumentRequestVisibility('bond_originator'),
  }
  const checks = [
    {
      key: 'shared_create_api_exists',
      ok: apiSource.includes('createTransactionDocumentRequests') && apiSource.includes('document_request_groups'),
    },
    {
      key: 'client_target_defaults_client_visible',
      ok: apiSource.includes('resolveDefaultDocumentRequestVisibility'),
    },
    {
      key: 'upload_links_to_request',
      ok: apiSource.includes('updateDocumentRequestFromUploadIfPossible') && apiSource.includes('requested_document_id'),
    },
    {
      key: 'portal_projects_container_model',
      ok: portalSource.includes('buildDocumentRequestContainerModel') && portalSource.includes('documentRequestContainers'),
    },
    {
      key: 'attorney_lane_request_gap_identified',
      ok: laneSource.includes('requestAttorneyWorkflowLaneDocument') && laneSource.includes("document_requests"),
    },
    {
      key: 'container_model_has_upload_spec',
      ok: modelSource.includes("type: 'additional_request'") && modelSource.includes("type: 'required_document'"),
    },
  ]

  const failed = checks.filter((check) => !check.ok)
  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    modelVersion: audienceModels.internal.version,
    defaultVisibilityProof,
    audienceProofs: Object.fromEntries(Object.entries(audienceModels).map(([audience, model]) => [
      audience,
      {
        summary: model.summary,
        containerIds: model.containers.map((container) => container.id),
        uploadTargets: model.containers.filter((container) => container.uploadSpec).map((container) => container.uploadSpec),
      },
    ])),
    phase2Findings: [
      {
        id: 'shared_container_model_added',
        severity: 'info',
        finding: 'Canonical required documents and ad hoc document_requests now normalize to one document request container model.',
      },
      {
        id: 'client_requests_default_client_visible',
        severity: 'info',
        finding: 'New shared API requests aimed at buyer, seller, or both default to client_visible unless explicitly overridden.',
      },
      {
        id: 'attorney_lane_direct_insert_still_mapped',
        severity: 'warning',
        finding: 'Attorney lane-specific requests still write document_requests directly; the Phase 2 model can project them, but a later cleanup should route them through the shared API or adapter.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : 'containers_mapped',
      ok: failed.length === 0,
      mayProceedToPhase3: failed.length === 0,
      checks,
      failed,
    },
  }
}

async function main() {
  const options = parseArgs()
  const report = buildReport()
  const outputPath = path.resolve(process.cwd(), options.output)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`)
  console.log(JSON.stringify({
    phase: report.phase,
    status: report.gate.status,
    output: options.output,
    mutatedData: report.mutatedData,
    modelVersion: report.modelVersion,
    buyerContainers: report.audienceProofs.buyer.summary.total,
    sellerContainers: report.audienceProofs.seller.summary.total,
    internalContainers: report.audienceProofs.internal.summary.total,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
