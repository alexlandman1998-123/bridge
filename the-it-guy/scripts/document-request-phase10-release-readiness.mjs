import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  buildDocumentRequestWorkspaceSmokeAudit,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'

const PHASE = 'document_request_phase10_release_readiness'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase10-release-readiness.json'
const ENVIRONMENT_EVIDENCE_CONTRACT = 'document_request_phase10_environment_evidence_v1'
const REQUIRED_ENVIRONMENT_CHECKS = Object.freeze([
  'professional_visibility_migration_applied',
  'document_requests_rls_verified',
  'buyer_request_upload_linked',
  'seller_request_upload_linked',
  'agent_upload_on_behalf_linked',
  'professional_request_hidden_from_clients',
])

const PHASE_REPORTS = Object.freeze([
  ['phase0_freeze_and_map', 'output/document-request-phase0-freeze-and-map.json', 'document_request_phase0_freeze_and_map'],
  ['phase1_single_canonical_policy', 'output/document-request-phase1-single-canonical-policy.json', 'document_request_phase1_single_canonical_policy'],
  ['phase2_containers', 'output/document-request-phase2-containers.json', 'document_request_phase2_containers'],
  ['phase3_buyer_cleanup', 'output/document-request-phase3-buyer-cleanup.json', 'document_request_phase3_buyer_cleanup'],
  ['phase4_bond_model', 'output/document-request-phase4-bond-model.json', 'document_request_phase4_bond_model'],
  ['phase5_seller_cleanup', 'output/document-request-phase5-seller-cleanup.json', 'document_request_phase5_seller_cleanup'],
  ['phase6_professional_propagation', 'output/document-request-phase6-professional-propagation.json', 'document_request_phase6_professional_propagation'],
  ['phase7_workspace_smoke', 'output/document-request-phase7-workspace-smoke.json', 'document_request_phase7_workspace_smoke'],
  ['phase8_client_portal_container_adoption', 'output/document-request-phase8-client-portal-container-adoption.json', 'document_request_phase8_client_portal_container_adoption'],
  ['phase9_upload_linking', 'output/document-request-phase9-upload-linking.json', 'document_request_phase9_upload_linking'],
])

const MANAGED_WARNING_CODES = Object.freeze(new Set([
  'active_row_has_pending_related_signoff',
  'professional_shared_client_owned',
  'legacy_buyer_profile_contains_professional_rows',
  'canonical_overlay_adds_buyer_policy_rows',
  'bond_parent_is_broad',
  'legacy_seller_generator_not_full_canonical_policy',
  'legacy_rows_roll_up_to_parent_containers',
  'runtime_requires_document_request_tables',
  'legacy_request_fallback_retained',
  'seller_portal_request_link_permission_guard',
]))

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    output: DEFAULT_OUTPUT_PATH,
    environmentEvidence: '',
    requireEnvironmentEvidence: false,
    strict: false,
    pretty: true,
  }
  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg.startsWith('--environment-evidence=')) options.environmentEvidence = arg.slice('--environment-evidence='.length)
    else if (arg === '--require-environment-evidence') options.requireEnvironmentEvidence = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--compact') options.pretty = false
  }
  return options
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath))
}

function evaluateEnvironmentEvidence(evidencePath = '') {
  if (!evidencePath) {
    return {
      provided: false,
      valid: false,
      path: '',
      contract: '',
      environment: '',
      projectRef: '',
      observedAt: '',
      checks: REQUIRED_ENVIRONMENT_CHECKS.map((key) => ({ key, ok: false })),
      failures: [{ code: 'environment_evidence_not_supplied', message: 'Target-environment evidence was not supplied.' }],
    }
  }

  try {
    const resolvedPath = path.isAbsolute(evidencePath) ? evidencePath : path.join(process.cwd(), evidencePath)
    const evidence = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
    const checkResults = REQUIRED_ENVIRONMENT_CHECKS.map((key) => ({
      key,
      ok: evidence?.checks?.[key] === true,
    }))
    const failures = []
    if (evidence?.contract !== ENVIRONMENT_EVIDENCE_CONTRACT) {
      failures.push({ code: 'environment_evidence_contract_mismatch', expected: ENVIRONMENT_EVIDENCE_CONTRACT, actual: evidence?.contract || '' })
    }
    if (!['staging', 'production'].includes(String(evidence?.environment || '').trim().toLowerCase())) {
      failures.push({ code: 'environment_evidence_environment_invalid', message: 'Environment must be staging or production.' })
    }
    if (!String(evidence?.projectRef || '').trim()) {
      failures.push({ code: 'environment_evidence_project_ref_missing' })
    }
    if (!evidence?.observedAt || Number.isNaN(Date.parse(evidence.observedAt))) {
      failures.push({ code: 'environment_evidence_observed_at_invalid' })
    }
    failures.push(...checkResults
      .filter((check) => !check.ok)
      .map((check) => ({ code: 'environment_check_failed', check: check.key })))
    return {
      provided: true,
      valid: failures.length === 0,
      path: evidencePath,
      contract: evidence?.contract || '',
      environment: evidence?.environment || '',
      projectRef: evidence?.projectRef || '',
      observedAt: evidence?.observedAt || '',
      checks: checkResults,
      failures,
    }
  } catch (error) {
    return {
      provided: true,
      valid: false,
      path: evidencePath,
      contract: '',
      environment: '',
      projectRef: '',
      observedAt: '',
      checks: REQUIRED_ENVIRONMENT_CHECKS.map((key) => ({ key, ok: false })),
      failures: [{ code: 'environment_evidence_unreadable', message: error.message }],
    }
  }
}

function collectFailures(report = {}) {
  const failures = []
  if (Array.isArray(report.gate?.failed)) failures.push(...report.gate.failed)
  if (Array.isArray(report.gate?.errors)) failures.push(...report.gate.errors)
  if (Array.isArray(report.policy?.validation?.errors)) failures.push(...report.policy.validation.errors)
  if (Number(report.failedChecks || 0) > 0) failures.push({ code: 'failed_checks', count: Number(report.failedChecks || 0) })
  if (Number(report.errors || 0) > 0) failures.push({ code: 'errors', count: Number(report.errors || 0) })
  return failures
}

function collectWarnings(report = {}) {
  if (Array.isArray(report.gate?.warnings)) return report.gate.warnings
  if (Array.isArray(report.policy?.validation?.warnings)) return report.policy.validation.warnings
  if (Array.isArray(report.warnings)) return report.warnings
  return []
}

function summarizeReport([key, reportPath, expectedPhase]) {
  try {
    const report = readJson(reportPath)
    const failures = collectFailures(report)
    const warnings = collectWarnings(report)
    return {
      key,
      path: reportPath,
      expectedPhase,
      actualPhase: report.phase || '',
      present: true,
      phaseMatches: report.phase === expectedPhase,
      status: report.status || report.gate?.status || '',
      mutatedData: report.mutatedData === true,
      failures,
      warnings,
      warningCodes: warnings.map((warning) => warning.code || warning.severity || 'warning'),
      productionActivationReady: report.gate?.productionActivationReady === true,
      version: report.version || '',
    }
  } catch (error) {
    return {
      key,
      path: reportPath,
      expectedPhase,
      actualPhase: '',
      present: false,
      phaseMatches: false,
      status: 'missing_or_unreadable',
      mutatedData: false,
      failures: [{ code: 'report_missing_or_unreadable', message: error.message }],
      warnings: [],
      warningCodes: [],
      productionActivationReady: false,
      version: '',
    }
  }
}

function buildWarningInventory(phaseSummaries = []) {
  return phaseSummaries.flatMap((summary) => summary.warnings.map((warning) => ({
    phase: summary.key,
    code: warning.code || warning.severity || 'warning',
    message: warning.message || '',
    managed: MANAGED_WARNING_CODES.has(warning.code || warning.severity || 'warning'),
    count: warning.count || null,
    requirementKey: warning.requirementKey || null,
  })))
}

function buildReport(options = {}) {
  const phaseSummaries = PHASE_REPORTS.map(summarizeReport)
  const activationEvidence = evaluateEnvironmentEvidence(options.environmentEvidence)
  const warningInventory = buildWarningInventory(phaseSummaries)
  const unmanagedWarnings = warningInventory.filter((warning) => !warning.managed)
  const hardBlockers = [
    ...phaseSummaries
      .filter((summary) => !summary.present)
      .map((summary) => ({ code: 'missing_phase_report', phase: summary.key, path: summary.path })),
    ...phaseSummaries
      .filter((summary) => summary.present && !summary.phaseMatches)
      .map((summary) => ({ code: 'phase_report_mismatch', phase: summary.key, expected: summary.expectedPhase, actual: summary.actualPhase })),
    ...phaseSummaries
      .filter((summary) => summary.mutatedData)
      .map((summary) => ({ code: 'unexpected_mutated_data', phase: summary.key, path: summary.path })),
    ...phaseSummaries.flatMap((summary) => summary.failures.map((failure) => ({
      code: failure.code || 'phase_failure',
      phase: summary.key,
      message: failure.message || '',
    }))),
    ...unmanagedWarnings.map((warning) => ({
      code: 'unmanaged_warning',
      phase: warning.phase,
      warningCode: warning.code,
      message: warning.message,
    })),
    ...(options.requireEnvironmentEvidence && !activationEvidence.valid
      ? activationEvidence.failures.map((failure) => ({
          ...failure,
          code: `required_${failure.code}`,
        }))
      : []),
  ]

  const smokeAudit = buildDocumentRequestWorkspaceSmokeAudit()
  const packageJson = JSON.parse(read('package.json'))
  const policySource = read('src/core/documents/documentRequestCanonicalPolicy.js')
  const containerSource = read('src/core/documents/documentRequestContainerModel.js')
  const clientPortalSource = read('src/pages/ClientPortal.jsx')
  const apiSource = read('src/lib/api.js')
  const privateListingSource = read('src/services/privateListingService.js')
  const buyerCleanupSource = read('src/services/documents/buyerDocumentCanonicalCleanupService.js')
  const sellerCleanupSource = read('src/services/documents/sellerDocumentCanonicalCleanupService.js')
  const bondModelSource = read('src/modules/bond/application/documents/bondApplicationCanonicalDocumentModel.js')
  const agentWorkspaceSource = read('src/pages/UnitDetail.jsx')
  const professionalVisibilityMigrationSource = read('../supabase/migrations/20260827163336_document_request_professional_visibility_phase6.sql')
  const documentRequestSelectPolicySource = read('../supabase/migrations/202605250020_bond_rls_scoped_policy_rollout_phase5b.sql')
  const documentRequestWritePolicySource = read('../supabase/migrations/202605250022_bond_finance_write_policy_rollout_phase5d.sql')

  const checks = [
    {
      key: 'all_phase_reports_present_and_matched',
      ok: phaseSummaries.every((summary) => summary.present && summary.phaseMatches),
    },
    {
      key: 'all_phase_reports_read_only',
      ok: phaseSummaries.every((summary) => !summary.mutatedData),
    },
    {
      key: 'no_hard_phase_failures',
      ok: phaseSummaries.every((summary) => summary.failures.length === 0),
    },
    {
      key: 'warnings_are_managed_and_explicit',
      ok: unmanagedWarnings.length === 0,
    },
    {
      key: 'canonical_policy_and_cleanup_models_exist',
      ok: policySource.includes('buildCanonicalDocumentRequestPolicyReport') &&
        buyerCleanupSource.includes('buildBuyerDocumentCanonicalCleanupAudit') &&
        sellerCleanupSource.includes('buildSellerDocumentCanonicalCleanupAudit') &&
        bondModelSource.includes('BOND_APPLICATION_CANONICAL_DOCUMENT_MODEL_VERSION'),
    },
    {
      key: 'container_model_covers_all_workspaces',
      ok: containerSource.includes('buildDocumentRequestContainerModel') &&
        smokeAudit.summary.coveredAudienceCount === 8 &&
        smokeAudit.summary.missingAudienceSmokeCount === 0 &&
        smokeAudit.summary.buyerContainerCount > 0 &&
        smokeAudit.summary.sellerContainerCount > 0 &&
        smokeAudit.summary.agentContainerCount > 0 &&
        smokeAudit.summary.attorneyContainerCount > 0 &&
        smokeAudit.summary.bondOriginatorContainerCount > 0 &&
        smokeAudit.summary.transferAttorneyContainerCount > 0 &&
        smokeAudit.summary.cancellationAttorneyContainerCount > 0 &&
        smokeAudit.summary.internalContainerCount > 0,
    },
    {
      key: 'workspace_smoke_has_no_failures_or_deferred_leaks',
      ok: smokeAudit.summary.failedSmokeCount === 0 &&
        smokeAudit.summary.unstableContainerIdCount === 0 &&
        smokeAudit.summary.deferredSellerUploadLeakCount === 0,
    },
    {
      key: 'client_portal_uses_container_request_ids',
      ok: clientPortalSource.includes('additionalDocumentRequestCardsForWorkspace') &&
        clientPortalSource.includes('request.uploadSpec?.requestId') &&
        clientPortalSource.includes('documentRequestId: options.documentRequestId || null'),
    },
    {
      key: 'buyer_and_seller_uploads_link_request_rows',
      ok: apiSource.includes('updateDocumentRequestFromUploadIfPossible') &&
        apiSource.includes('requested_document_id: documentId') &&
        privateListingSource.includes('linkSellerPortalDocumentRequestUpload') &&
        privateListingSource.includes('requested_document_id: normalizedDocumentId'),
    },
    {
      key: 'agent_upload_on_behalf_links_exact_request',
      ok: agentWorkspaceSource.includes('Upload on behalf') &&
        agentWorkspaceSource.includes("source: documentRequestId ? 'professional_request_upload_on_behalf' : 'internal'") &&
        apiSource.includes('uploadedByParty: normalizeNullableText(uploadedByParty)') &&
        apiSource.includes("fallbackRequestQuery.eq('id', documentRequestId)"),
    },
    {
      key: 'professional_visibility_migration_contract_is_present',
      ok: professionalVisibilityMigrationSource.includes('requested_document_id uuid') &&
        professionalVisibilityMigrationSource.includes('document_requests_requested_from_check') &&
        professionalVisibilityMigrationSource.includes('document_requests_visibility_scope_check') &&
        professionalVisibilityMigrationSource.includes('document_requests_visibility_scope_idx') &&
        professionalVisibilityMigrationSource.includes('document_requests_requested_from_idx'),
    },
    {
      key: 'document_request_rls_contract_is_present',
      ok: documentRequestSelectPolicySource.includes('document_requests_select_phase5b_scoped') &&
        documentRequestWritePolicySource.includes('document_requests_insert_phase5d_bond_finance') &&
        documentRequestWritePolicySource.includes('document_requests_update_phase5d_bond_finance'),
    },
    {
      key: 'latest_phase_contract_versions_are_loaded',
      ok: phaseSummaries.find((summary) => summary.key === 'phase7_workspace_smoke')?.version === 'document_request_workspace_smoke_v2' &&
        phaseSummaries.find((summary) => summary.key === 'phase8_client_portal_container_adoption')?.version === 'document_request_client_portal_container_adoption_v2' &&
        phaseSummaries.find((summary) => summary.key === 'phase9_upload_linking')?.version === 'document_request_upload_linking_v2',
    },
    {
      key: 'phase10_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase10-release-readiness'] ===
        'npm run verify:document-request-phase9-upload-linking && npm run test:document-request-phase10-release-readiness && npm run report:document-request-phase10-release-readiness',
    },
  ]

  const failed = checks.filter((check) => !check.ok)
  const strictFailure = options.strict && warningInventory.length > 0
  const pendingActivationItems = warningInventory.map((warning) => ({
    phase: warning.phase,
    code: warning.code,
    message: warning.message,
    count: warning.count,
    requirementKey: warning.requirementKey,
  }))
  if (!activationEvidence.valid) {
    pendingActivationItems.push({
      phase: 'phase10_release_readiness',
      code: 'target_environment_evidence_required',
      message: 'Provide verified staging or production evidence for migration, RLS, upload linking, upload-on-behalf, and client visibility boundaries.',
      count: activationEvidence.failures.length,
      requirementKey: null,
    })
  }

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: 'document_request_release_readiness_v2',
    phaseSummaries,
    warningSummary: {
      total: warningInventory.length,
      managed: warningInventory.filter((warning) => warning.managed).length,
      unmanaged: unmanagedWarnings.length,
      byCode: warningInventory.reduce((accumulator, warning) => {
        accumulator[warning.code] = (accumulator[warning.code] || 0) + 1
        return accumulator
      }, {}),
    },
    pendingActivationItems,
    activationEvidence,
    smokeSummary: smokeAudit.summary,
    releaseRecommendation: hardBlockers.length || failed.length
      ? 'blocked'
      : !activationEvidence.valid
        ? 'implementation_ready_environment_validation_required'
        : warningInventory.length
          ? 'environment_verified_managed_warnings_remain'
        : 'ready_for_production_activation',
    gate: {
      status: hardBlockers.length || failed.length
        ? 'blocked'
        : strictFailure
          ? 'blocked_warnings'
          : !activationEvidence.valid
            ? 'implementation_ready_environment_validation_required'
            : warningInventory.length
              ? 'release_readiness_mapped_with_warnings'
            : 'release_readiness_mapped',
      ok: hardBlockers.length === 0 && failed.length === 0 && !strictFailure,
      mayProceedToPhase11: hardBlockers.length === 0 && failed.length === 0,
      internalPilotReady: hardBlockers.length === 0 && failed.length === 0 && activationEvidence.valid,
      productionActivationReady: hardBlockers.length === 0 && failed.length === 0 && activationEvidence.valid && warningInventory.length === 0,
      checks,
      failed,
      hardBlockers,
      warnings: warningInventory,
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
    hardBlockers: report.gate.hardBlockers.length,
    warnings: report.gate.warnings.length,
    productionActivationReady: report.gate.productionActivationReady,
    releaseRecommendation: report.releaseRecommendation,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
