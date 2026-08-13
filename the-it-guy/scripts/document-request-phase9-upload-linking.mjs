import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'
import {
  buildProfessionalDocumentRequestUploadTransition,
} from '../src/services/documents/documentRequestProfessionalPropagationService.js'

const PHASE = 'document_request_phase9_upload_linking'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase9-upload-linking.json'

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
  const apiSource = read('src/lib/api.js')
  const privateListingSource = read('src/services/privateListingService.js')
  const clientPortalSource = read('src/pages/ClientPortal.jsx')
  const smokeAudit = buildDocumentRequestWorkspaceSmokeAudit()
  const uploadTransition = buildProfessionalDocumentRequestUploadTransition({
    id: 'phase9-upload-linking-request',
    transactionId: 'phase9-upload-linking-transaction',
    documentId: 'phase9-linked-document',
  })

  const checks = [
    {
      key: 'buyer_upload_links_document_request',
      ok: apiSource.includes('async function updateDocumentRequestFromUploadIfPossible') &&
        apiSource.includes('documentRequestId = null') &&
        apiSource.includes('requested_document_id: documentId') &&
        apiSource.includes("source: 'document_request_upload_linked'") &&
        apiSource.includes('await updateDocumentRequestFromUploadIfPossible(client,'),
    },
    {
      key: 'seller_upload_accepts_request_id',
      ok: privateListingSource.includes('documentRequestId =') &&
        privateListingSource.includes('export async function uploadSellerClientPortalDocument'),
    },
    {
      key: 'seller_upload_links_document_request',
      ok: privateListingSource.includes('async function linkSellerPortalDocumentRequestUpload') &&
        privateListingSource.includes(".from('document_requests')") &&
        privateListingSource.includes('requested_document_id: normalizedDocumentId') &&
        privateListingSource.includes('requires_review') &&
        privateListingSource.includes('completed_at') &&
        privateListingSource.includes('rejected_reason') &&
        privateListingSource.includes('updated_at'),
    },
    {
      key: 'seller_upload_uses_promoted_shared_document_when_available',
      ok: privateListingSource.includes('promotedSharedDocument?.id || documentRow?.promoted_document_id || documentRow?.id'),
    },
    {
      key: 'seller_upload_invokes_linker_after_upload',
      ok: privateListingSource.includes('const documentRequestUpdate = await linkSellerPortalDocumentRequestUpload') &&
        privateListingSource.includes('documentRequestUpdate,'),
    },
    {
      key: 'client_portal_passes_request_id_to_buyer_and_seller_uploads',
      ok: clientPortalSource.includes('documentRequestId: options.documentRequestId || null') &&
        clientPortalSource.includes('request.uploadSpec?.requestId') &&
        clientPortalSource.includes('const documentRequestId = String(request.uploadSpec?.requestId || requestId ||') &&
        clientPortalSource.includes('handleUploadRequiredDocument(') &&
        clientPortalSource.includes('documentRequestId,'),
    },
    {
      key: 'upload_transition_closes_container_readiness',
      ok: uploadTransition.before.blocksReadiness === true &&
        uploadTransition.before.hasUploadedDocument === false &&
        uploadTransition.after.blocksReadiness === false &&
        uploadTransition.after.hasUploadedDocument === true &&
        uploadTransition.after.linkedDocumentId === 'phase9-linked-document',
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
  if (privateListingSource.includes('isPermissionDeniedError(update.error)')) {
    warnings.push({
      code: 'seller_portal_request_link_permission_guard',
      message: 'Seller portal request-linking treats missing schema or denied direct table access as non-blocking so the physical upload is not lost.',
    })
  }
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: 'document_request_upload_linking_v1',
    smokeSummary: smokeAudit.summary,
    uploadTransition,
    phase9Decisions: [
      {
        key: 'request_id_is_primary_upload_match',
        decision: 'Client portal uploads now carry the document request id so seller, buyer, agent, attorney, and bond-originator views can converge on the same container.',
      },
      {
        key: 'seller_upload_updates_document_requests',
        decision: 'Seller portal uploads link the uploaded document back to document_requests after the file/document row exists.',
      },
      {
        key: 'promoted_document_preferred',
        decision: 'When a seller upload is promoted into transaction documents, the shared document id is stored on the request before falling back to the private listing document id.',
      },
    ],
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'request_upload_linking_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase10: failed.length === 0,
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
