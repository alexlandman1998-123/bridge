import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildDocumentRequestUploadOwnershipAudit,
} from '../src/core/documents/documentRequestUploadOwnershipModel.js'
import {
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'
import {
  normalizeRequiredDocumentContainer,
} from '../src/core/documents/documentRequestContainerModel.js'

const PHASE = 'document_request_phase11_upload_ownership'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase11-upload-ownership.json'

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
  const ownershipAudit = buildDocumentRequestUploadOwnershipAudit()
  const smokeAudit = buildDocumentRequestWorkspaceSmokeAudit()
  const ownershipSource = read('src/core/documents/documentRequestUploadOwnershipModel.js')
  const containerSource = read('src/core/documents/documentRequestContainerModel.js')
  const packageJson = JSON.parse(read('package.json'))

  const sellerComplianceKeys = [
    'electrical_compliance_certificate',
    'gas_compliance_certificate',
    'electric_fence_certificate',
    'water_installation_certificate',
    'beetle_certificate',
    'solar_compliance_documents',
    'approved_building_plans',
    'occupation_certificate',
    'vat_status_confirmation',
  ]
  const sellerComplianceOwnership = sellerComplianceKeys.map((key) =>
    ownershipAudit.ownership.find((item) => item.documentKey === key),
  )
  const professionalOnlyKeys = ['transfer_duty_information', 'transfer_documents', 'bond_cancellation_figures']
  const professionalOnlyOwnership = professionalOnlyKeys.map((key) =>
    ownershipAudit.ownership.find((item) => item.documentKey === key),
  )
  const bondAssistedKeys = ['bond_approval', 'grant_signed', 'income_affordability_documents']
  const bondAssistedOwnership = bondAssistedKeys.map((key) =>
    ownershipAudit.ownership.find((item) => item.documentKey === key),
  )
  const sampleBuyerContainer = normalizeRequiredDocumentContainer({
    transactionId: 'phase11',
    key: 'buyer_id_document',
    label: 'Buyer ID',
    requestedFrom: 'buyer',
    ownerRole: 'buyer',
    visibility: 'client_visible',
  })
  const sampleSellerContainer = normalizeRequiredDocumentContainer({
    transactionId: 'phase11',
    key: 'electrical_compliance_certificate',
    label: 'Electrical Compliance Certificate',
    requestedFrom: 'seller',
    ownerRole: 'seller',
    visibility: 'client_visible',
  })
  const sampleProfessionalContainer = normalizeRequiredDocumentContainer({
    transactionId: 'phase11',
    key: 'transfer_documents',
    label: 'Transfer Documents',
    requestedFrom: 'transfer_attorney',
    ownerRole: 'transfer_attorney',
    visibility: 'professional_shared',
  })

  const checks = [
    {
      key: 'ownership_model_exists',
      ok: ownershipSource.includes('DOCUMENT_REQUEST_UPLOAD_OWNERSHIP_MODEL_VERSION') &&
        ownershipSource.includes('resolveDocumentRequestUploadOwnership') &&
        ownershipSource.includes('buildDocumentRequestUploadOwnershipAudit'),
    },
    {
      key: 'all_canonical_requirements_have_upload_owner',
      ok: ownershipAudit.ok &&
        ownershipAudit.total > 0 &&
        ownershipAudit.ownership.every((item) => item.responsiblePartyRole && item.uploadableByRoles.length),
    },
    {
      key: 'client_owned_documents_allow_agent_upload_on_behalf',
      ok: ownershipAudit.ownership
        .filter((item) => ['buyer', 'seller'].includes(item.responsiblePartyRole))
        .every((item) => item.agentMayUploadOnBehalf && item.uploadableByRoles.includes('agent')),
    },
    {
      key: 'seller_compliance_documents_are_seller_owned_uploads',
      ok: sellerComplianceOwnership.every((item) =>
        item?.responsiblePartyRole === 'seller' &&
        item?.uploadableByRoles?.includes('seller') &&
        item?.uploadableByRoles?.includes('agent'),
      ),
    },
    {
      key: 'professional_documents_are_not_client_upload_debt',
      ok: professionalOnlyOwnership.every((item) =>
        item?.professionalOnly === true &&
        item?.clientUploadDebt === false &&
        !item?.uploadableByRoles?.includes('buyer') &&
        !item?.uploadableByRoles?.includes('seller'),
      ),
    },
    {
      key: 'bond_documents_allow_originator_assist_without_reassigning_buyer_ownership',
      ok: bondAssistedOwnership.every((item) =>
        item?.responsiblePartyRole === 'buyer' &&
        item?.bondOriginatorAssisted === true &&
        item?.uploadableByRoles?.includes('bond_originator'),
      ),
    },
    {
      key: 'container_model_carries_upload_ownership_metadata',
      ok: containerSource.includes('resolveDocumentRequestUploadOwnership') &&
        containerSource.includes('uploadOwnership') &&
        containerSource.includes('responsiblePartyRole') &&
        containerSource.includes('uploadableByRoles') &&
        containerSource.includes('uploadOnBehalfAllowed') &&
        sampleBuyerContainer.responsiblePartyRole === 'buyer' &&
        sampleBuyerContainer.uploadableByRoles.includes('agent') &&
        sampleSellerContainer.responsiblePartyRole === 'seller' &&
        sampleSellerContainer.uploadableByRoles.includes('agent') &&
        sampleProfessionalContainer.responsiblePartyRole === 'transfer_attorney' &&
        sampleProfessionalContainer.uploadOwnership.clientUploadDebt === false,
    },
    {
      key: 'workspace_smoke_still_has_no_container_drift',
      ok: smokeAudit.summary.failedSmokeCount === 0 &&
        smokeAudit.summary.unstableContainerIdCount === 0 &&
        smokeAudit.summary.deferredSellerUploadLeakCount === 0,
    },
    {
      key: 'phase11_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase11-upload-ownership'] ===
        'npm run verify:document-request-phase10-release-readiness && npm run test:document-request-phase11-upload-ownership && npm run report:document-request-phase11-upload-ownership',
    },
  ]

  const failed = checks.filter((check) => !check.ok)
  const warnings = [...ownershipAudit.warnings]
  if (ownershipAudit.warnings.length > 0) {
    warnings.push({
      code: 'visibility_cleanup_deferred_to_phase12',
      message: 'Phase 11 defines upload ownership only. Visibility cleanup for seller compliance/VAT rows is deferred to Phase 12.',
    })
  }
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: 'document_request_upload_ownership_v1',
    ownershipSummary: {
      total: ownershipAudit.total,
      byResponsibleParty: ownershipAudit.byResponsibleParty,
      byUploadMode: ownershipAudit.byUploadMode,
      clientUploadDebtCount: ownershipAudit.clientUploadDebtCount,
      professionalOnlyCount: ownershipAudit.professionalOnlyCount,
      agentOnBehalfCount: ownershipAudit.agentOnBehalfCount,
      sellerExternalUploadKeys: ownershipAudit.sellerExternalUploadKeys,
      bondOriginatorAssistedKeys: ownershipAudit.bondOriginatorAssistedKeys,
      professionalOnlyKeys: ownershipAudit.professionalOnlyKeys,
    },
    smokeSummary: smokeAudit.summary,
    gate: {
      status: failed.length
        ? 'blocked'
        : strictFailure
          ? 'blocked_warnings'
          : warnings.length
            ? 'upload_ownership_mapped_with_warnings'
            : 'upload_ownership_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase12: failed.length === 0,
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
    productionActivationReady: report.gate.productionActivationReady,
    ownershipSummary: report.ownershipSummary,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
