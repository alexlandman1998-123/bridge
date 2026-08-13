import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const PHASE = 'document_request_phase17_legacy_cleanup_guard'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase17-legacy-cleanup-guard.json'
const LEGACY_CLEANUP_SCRIPT_PATH = 'scripts/document-request-canonical-phase17-legacy-key-cleanup.mjs'
const PORTAL_VERIFICATION_SCRIPT_PATH = 'scripts/document-request-canonical-phase14-portal-verification.mjs'
const PHASE16_HANDOFF_REPORT_PATH = 'output/document-request-phase16-automation-handoff.json'

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

function readJson(relativePath) {
  return JSON.parse(read(relativePath))
}

function buildReport(options = {}) {
  const packageJson = JSON.parse(read('package.json'))
  const phase16 = readJson(PHASE16_HANDOFF_REPORT_PATH)
  const cleanupSource = read(LEGACY_CLEANUP_SCRIPT_PATH)
  const portalVerifierSource = read(PORTAL_VERIFICATION_SCRIPT_PATH)
  const scriptSource = read('scripts/document-request-phase17-legacy-cleanup-guard.mjs')
  const docs = read('docs/document-request-phase17-legacy-cleanup-guard.md')
  const forbiddenLocalDataTokens = [
    'create' + 'Client',
    '.fro' + 'm(',
    '.inse' + 'rt(',
    '.upd' + 'ate(',
    '.upse' + 'rt(',
    '.del' + 'ete(',
  ]
  const excludedScopeTokens = [
    'document' + 'Generator',
    'generate' + 'Document',
    'legal' + 'Document',
  ]
  const deleteToken = '.del' + 'ete('
  const requestWritePattern = /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/

  const phase16Readiness = {
    status: phase16.gate?.status || '',
    ok: phase16.gate?.ok === true,
    productionActivationReady: phase16.gate?.productionActivationReady === true,
    failedCount: Number(phase16.gate?.failed?.length || 0),
    warningCount: Number(phase16.gate?.warnings?.length || 0),
    automationHandoffReady: phase16.readiness?.automationHandoffReady === true,
    cronCompatibleDryRunReady: phase16.readiness?.cronCompatibleDryRunReady === true,
    liveAutomationExecuted: phase16.readiness?.liveAutomationExecuted === true,
    commitExecuted: phase16.readiness?.commitExecuted === true,
  }

  const cleanupControls = {
    scriptPath: LEGACY_CLEANUP_SCRIPT_PATH,
    phaseMarkerPresent: cleanupSource.includes('document_request_phase17_legacy_key_cleanup'),
    defaultsDryRun: cleanupSource.includes('options.commit !== true'),
    supportsDryRunFlag: cleanupSource.includes('--dry-run'),
    supportsCommitFlag: cleanupSource.includes('--commit'),
    requiresConfirmLegacyCleanup: cleanupSource.includes('--confirm-legacy-cleanup') &&
      cleanupSource.includes('Legacy key cleanup writes require --confirm-legacy-cleanup.'),
    rolloutPrecheckWired: cleanupSource.includes('document-request-canonical-phase15-operational-rollout.mjs') &&
      cleanupSource.includes('runPhase15Precheck'),
    automationPostcheckWired: cleanupSource.includes('document-request-canonical-phase16-automation.mjs') &&
      cleanupSource.includes('runPhase16Postcheck') &&
      cleanupSource.includes('postcheckAutomation'),
    cleanupSizeCapped: cleanupSource.includes('MAX_LEGACY_CLEANUP_TRANSACTIONS = 25'),
    preservedStatusesGuarded: cleanupSource.includes('PRESERVED_REQUIRED_DOCUMENT_STATUSES') &&
      cleanupSource.includes('hasPreservedState') &&
      cleanupSource.includes('preserved_upload_or_review_state'),
    activeRowsOnly: cleanupSource.includes('isActivePortalAffectingRow') &&
      cleanupSource.includes('!active') &&
      cleanupSource.includes('already_inactive'),
    disableHideOnlyStrategy: cleanupSource.includes('is_required: false') &&
      cleanupSource.includes('enabled: false') &&
      cleanupSource.includes("status: 'not_required'") &&
      cleanupSource.includes("visibility_scope: 'internal'"),
    preservesRowsInsteadOfDeleting: cleanupSource.includes('deletesRows: false') &&
      !cleanupSource.includes(deleteToken),
    noDocumentRequestWrites: !requestWritePattern.test(cleanupSource),
    mutatedDataOnlyOnConfirmedCommit: cleanupSource.includes('mutatedData: options.commit === true') &&
      cleanupSource.includes('commitResults.some'),
  }

  const portalVerifierControls = {
    scriptPath: PORTAL_VERIFICATION_SCRIPT_PATH,
    hasActiveRequiredRowFilter: portalVerifierSource.includes('function isActiveRequiredRow') &&
      portalVerifierSource.includes('.filter(isActiveRequiredRow)'),
    inactiveRowsDoNotCountAsNonCanonical: portalVerifierSource.includes("status !== 'not_required'") &&
      portalVerifierSource.includes("!['internal', 'internal_only'].includes(visibility)"),
  }

  const checks = [
    {
      key: 'phase16_handoff_is_clean',
      ok: phase16Readiness.ok &&
        phase16Readiness.productionActivationReady &&
        phase16Readiness.failedCount === 0 &&
        phase16Readiness.warningCount === 0 &&
        phase16Readiness.automationHandoffReady &&
        phase16Readiness.cronCompatibleDryRunReady &&
        !phase16Readiness.liveAutomationExecuted &&
        !phase16Readiness.commitExecuted,
    },
    {
      key: 'legacy_cleanup_is_dry_run_first_and_commit_gated',
      ok: cleanupControls.phaseMarkerPresent &&
        cleanupControls.defaultsDryRun &&
        cleanupControls.supportsDryRunFlag &&
        cleanupControls.supportsCommitFlag &&
        cleanupControls.requiresConfirmLegacyCleanup,
    },
    {
      key: 'legacy_cleanup_has_precheck_and_postcheck',
      ok: cleanupControls.rolloutPrecheckWired && cleanupControls.automationPostcheckWired,
    },
    {
      key: 'legacy_cleanup_scope_is_capped_and_active_only',
      ok: cleanupControls.cleanupSizeCapped && cleanupControls.activeRowsOnly,
    },
    {
      key: 'legacy_cleanup_preserves_upload_and_review_state',
      ok: cleanupControls.preservedStatusesGuarded,
    },
    {
      key: 'legacy_cleanup_disables_and_hides_without_deleting',
      ok: cleanupControls.disableHideOnlyStrategy && cleanupControls.preservesRowsInsteadOfDeleting,
    },
    {
      key: 'legacy_cleanup_does_not_write_document_requests',
      ok: cleanupControls.noDocumentRequestWrites,
    },
    {
      key: 'portal_verifier_excludes_inactive_cleanup_rows',
      ok: portalVerifierControls.hasActiveRequiredRowFilter &&
        portalVerifierControls.inactiveRowsDoNotCountAsNonCanonical,
    },
    {
      key: 'phase17_guard_is_read_only_local_qa',
      ok: scriptSource.includes('mutatedData: false') &&
        forbiddenLocalDataTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'document_generator_remains_out_of_scope',
      ok: docs.toLowerCase().includes('document generator') &&
        excludedScopeTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'phase17_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase17-legacy-cleanup-guard'] ===
        'npm run verify:document-request-phase16-automation-handoff && npm run test:document-request-phase17-legacy-cleanup-guard && npm run report:document-request-phase17-legacy-cleanup-guard',
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
    version: 'document_request_legacy_cleanup_guard_v1',
    phase16Readiness,
    cleanupControls,
    portalVerifierControls,
    readiness: {
      legacyCleanupGuardReady: failed.length === 0 && !strictFailure,
      controlledCleanupDryRunReady: failed.length === 0,
      liveCleanupExecuted: false,
      commitExecuted: false,
      requiresConfirmLegacyCleanupForWrites: true,
      preservesUploadedOrReviewedRows: cleanupControls.preservedStatusesGuarded,
      deletesRows: false,
      writesDocumentRequests: false,
    },
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'legacy_cleanup_guard_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase18: failed.length === 0,
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
    controlledCleanupDryRunReady: report.readiness.controlledCleanupDryRunReady,
    liveCleanupExecuted: report.readiness.liveCleanupExecuted,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
