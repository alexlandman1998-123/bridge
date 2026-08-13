import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS,
  buildCanonicalDocumentRequestPolicyReport,
} from '../src/core/documents/documentRequestCanonicalPolicy.js'
import {
  DOCUMENT_REQUEST_CANONICAL_MATRIX,
} from '../src/core/documents/documentRequestCanonicalMatrix.js'
import {
  SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS,
  buildDocumentRequestUploadOwnershipAudit,
} from '../src/core/documents/documentRequestUploadOwnershipModel.js'
import {
  normalizeRequiredDocumentContainer,
} from '../src/core/documents/documentRequestContainerModel.js'
import {
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'

const PHASE = 'document_request_phase12_seller_compliance_cleanup'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase12-seller-compliance-cleanup.json'

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

function requirementByKey(key = '') {
  return DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.find((requirement) => requirement.key === key) || null
}

function buildComplianceRows() {
  const ownershipAudit = buildDocumentRequestUploadOwnershipAudit()
  return SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS.map((key) => {
    const requirement = requirementByKey(key)
    const ownership = ownershipAudit.ownership.find((item) => item.documentKey === key)
    const container = normalizeRequiredDocumentContainer({
      transactionId: 'phase12',
      key,
      label: requirement?.label || key,
      ownerRole: requirement?.ownerRole,
      requestedFrom: requirement?.requestedFrom,
      visibility: requirement?.visibility,
    })
    return {
      key,
      requirement: requirement
        ? {
            ownerRole: requirement.ownerRole,
            requestedFrom: requirement.requestedFrom,
            visibility: requirement.visibility,
            level: requirement.level,
            blocker: requirement.blocker,
          }
        : null,
      ownership: ownership
        ? {
            responsiblePartyRole: ownership.responsiblePartyRole,
            uploadableByRoles: ownership.uploadableByRoles,
            agentMayUploadOnBehalf: ownership.agentMayUploadOnBehalf,
            clientUploadDebt: ownership.clientUploadDebt,
            clientVisibleUploadDebt: ownership.clientVisibleUploadDebt,
          }
        : null,
      container: {
        requestedFrom: container.requestedFrom,
        visibility: container.visibility,
        responsiblePartyRole: container.responsiblePartyRole,
        uploadableByRoles: container.uploadableByRoles,
        uploadOnBehalfAllowed: container.uploadOnBehalfAllowed,
        visibleTo: container.visibleTo,
      },
    }
  })
}

function buildReport(options = {}) {
  const policy = buildCanonicalDocumentRequestPolicyReport()
  const ownershipAudit = buildDocumentRequestUploadOwnershipAudit()
  const smokeAudit = buildDocumentRequestWorkspaceSmokeAudit()
  const complianceRows = buildComplianceRows()
  const policyWarnings = policy.validation?.warnings || []
  const packageJson = JSON.parse(read('package.json'))
  const checklistSource = read('config/document-request-phase1-legal-checklist.json')
  const attorneyRequirementSource = read('src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js')
  const policySource = read('src/core/documents/documentRequestCanonicalPolicy.js')
  const ownershipSource = read('src/core/documents/documentRequestUploadOwnershipModel.js')

  const complianceWarningLeaks = policyWarnings.filter((warning) =>
    warning.code === 'active_row_has_pending_related_signoff' &&
    SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS.includes(warning.requirementKey),
  )
  const professionalSharedLeaks = policyWarnings.filter((warning) =>
    warning.code === 'professional_shared_client_owned' &&
    SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS.includes(warning.requirementKey),
  )
  const deferredKeyLeaks = CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS.filter((key) =>
    DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.some((requirement) => requirement.key === key),
  )

  const checks = [
    {
      key: 'seller_external_upload_keys_are_declared',
      ok: SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS.length === 9 &&
        ownershipSource.includes('SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS') &&
        policySource.includes('UPLOAD_ONLY_ACCEPTED_SIGNOFF_KEYS'),
    },
    {
      key: 'seller_compliance_rows_are_seller_client_visible_uploads',
      ok: complianceRows.every((row) =>
        row.requirement?.ownerRole === 'seller' &&
        row.requirement?.requestedFrom === 'seller' &&
        row.requirement?.visibility === 'client_visible' &&
        row.ownership?.responsiblePartyRole === 'seller' &&
        row.ownership?.uploadableByRoles?.includes('seller') &&
        row.ownership?.uploadableByRoles?.includes('agent') &&
        row.ownership?.agentMayUploadOnBehalf === true &&
        row.container.visibleTo.includes('seller') &&
        row.container.visibleTo.includes('agent'),
      ),
    },
    {
      key: 'vat_status_confirmation_is_no_longer_professional_shared_client_owned',
      ok: requirementByKey('vat_status_confirmation')?.visibility === 'client_visible' &&
        checklistSource.includes('"key": "vat_status_confirmation"') &&
        checklistSource.includes('"visibility": "client_visible"') &&
        !professionalSharedLeaks.some((warning) => warning.requirementKey === 'vat_status_confirmation'),
    },
    {
      key: 'attorney_vat_requests_target_seller_client_visible_upload',
      ok: attorneyRequirementSource.includes("id: 'vat_status_confirmation'") &&
        !/id:\s*'vat_status_confirmation'[\s\S]{0,260}visibilityDefault:\s*'professional_shared'/.test(attorneyRequirementSource) &&
        /id:\s*'vat_status_confirmation'[\s\S]{0,260}visibilityDefault:\s*'client_visible'/.test(attorneyRequirementSource),
    },
    {
      key: 'seller_compliance_uploads_do_not_emit_pending_signoff_warnings',
      ok: complianceWarningLeaks.length === 0,
    },
    {
      key: 'ownership_audit_has_no_warnings_or_failures',
      ok: ownershipAudit.ok && ownershipAudit.failures.length === 0 && ownershipAudit.warnings.length === 0,
    },
    {
      key: 'deferred_acquisition_and_improvement_records_are_still_absent',
      ok: deferredKeyLeaks.length === 0 &&
        CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS.includes('property_acquisition_record') &&
        CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS.includes('capital_improvement_records'),
    },
    {
      key: 'workspace_smoke_still_has_no_container_drift',
      ok: smokeAudit.summary.failedSmokeCount === 0 &&
        smokeAudit.summary.unstableContainerIdCount === 0 &&
        smokeAudit.summary.deferredSellerUploadLeakCount === 0,
    },
    {
      key: 'phase12_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase12-seller-compliance-cleanup'] ===
        'npm run verify:document-request-phase11-upload-ownership && npm run test:document-request-phase12-seller-compliance-cleanup && npm run report:document-request-phase12-seller-compliance-cleanup',
    },
  ]

  const failed = checks.filter((check) => !check.ok)
  const warnings = []
  const strictFailure = options.strict && warnings.length > 0

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: 'document_request_seller_compliance_cleanup_v1',
    complianceRows,
    policyWarningSummary: {
      total: policyWarnings.length,
      sellerCompliancePendingSignoffLeaks: complianceWarningLeaks.length,
      sellerProfessionalSharedLeaks: professionalSharedLeaks.length,
      remainingWarningCodes: policyWarnings.reduce((acc, warning) => {
        acc[warning.code] = (acc[warning.code] || 0) + 1
        return acc
      }, {}),
    },
    ownershipSummary: {
      total: ownershipAudit.total,
      failures: ownershipAudit.failures.length,
      warnings: ownershipAudit.warnings.length,
      sellerExternalUploadKeys: ownershipAudit.sellerExternalUploadKeys,
    },
    deferredKeyLeaks,
    smokeSummary: smokeAudit.summary,
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'seller_compliance_cleanup_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase13: failed.length === 0,
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
    policyWarningSummary: report.policyWarningSummary,
    deferredKeyLeaks: report.deferredKeyLeaks,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
