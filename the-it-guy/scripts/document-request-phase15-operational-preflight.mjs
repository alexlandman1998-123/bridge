import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const PHASE = 'document_request_phase15_operational_preflight'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase15-operational-preflight.json'
const ROLLOUT_SCRIPT_PATH = 'scripts/document-request-canonical-phase15-operational-rollout.mjs'
const PORTAL_VERIFICATION_SCRIPT_PATH = 'scripts/document-request-canonical-phase14-portal-verification.mjs'

const PHASE_REPORTS = Object.freeze([
  ['phase10_release_readiness', 'output/document-request-phase10-release-readiness.json', 'document_request_phase10_release_readiness'],
  ['phase11_upload_ownership', 'output/document-request-phase11-upload-ownership.json', 'document_request_phase11_upload_ownership'],
  ['phase12_seller_compliance_cleanup', 'output/document-request-phase12-seller-compliance-cleanup.json', 'document_request_phase12_seller_compliance_cleanup'],
  ['phase13_parent_child_containers', 'output/document-request-phase13-parent-child-containers.json', 'document_request_phase13_parent_child_upload_containers'],
  ['phase14_cross_workspace_parity', 'output/document-request-phase14-cross-workspace-parity.json', 'document_request_phase14_cross_workspace_parity'],
])

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

function safeReport([key, reportPath, expectedPhase]) {
  try {
    const report = readJson(reportPath)
    const warnings = report.gate?.warnings || report.warningSummary?.total || report.warnings || []
    const warningCount = Array.isArray(warnings) ? warnings.length : Number(warnings || 0)
    return {
      key,
      path: reportPath,
      expectedPhase,
      actualPhase: report.phase || '',
      present: true,
      phaseMatches: report.phase === expectedPhase,
      status: report.gate?.status || report.status || '',
      gateOk: report.gate?.ok === true,
      mutatedData: report.mutatedData === true,
      failedCount: Number(report.gate?.failed?.length || report.gate?.hardBlockers?.length || report.failedChecks || 0),
      warningCount,
      productionActivationReady: report.gate?.productionActivationReady === true,
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
      gateOk: false,
      mutatedData: false,
      failedCount: 1,
      warningCount: 0,
      productionActivationReady: false,
      error: error.message,
    }
  }
}

function sourceHasAny(source = '', tokens = []) {
  return tokens.some((token) => source.includes(token))
}

function buildReport(options = {}) {
  const packageJson = JSON.parse(read('package.json'))
  const phaseSummaries = PHASE_REPORTS.map(safeReport)
  const rolloutSource = read(ROLLOUT_SCRIPT_PATH)
  const portalVerificationSource = read(PORTAL_VERIFICATION_SCRIPT_PATH)
  const scriptSource = read('scripts/document-request-phase15-operational-preflight.mjs')
  const docs = read('docs/document-request-phase15-operational-preflight.md')
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

  const postPhase10Summaries = phaseSummaries.filter((summary) => summary.key !== 'phase10_release_readiness')
  const phase10Summary = phaseSummaries.find((summary) => summary.key === 'phase10_release_readiness')
  const rolloutWritesDocumentRequests = /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/.test(rolloutSource)
  const tokenLeakPattern = /token:\s*row\.seller_workspace_token|sellerWorkspaceToken:\s*row\.seller_workspace_token/

  const rolloutControls = {
    scriptPath: ROLLOUT_SCRIPT_PATH,
    portalVerificationScriptPath: PORTAL_VERIFICATION_SCRIPT_PATH,
    defaultsDryRun: rolloutSource.includes('options.dryRun = options.commit !== true'),
    explicitCommitFlag: rolloutSource.includes('--commit'),
    confirmationFlag: rolloutSource.includes('--confirm-operational-rollout'),
    syncUsesDryRunUntilCommit: rolloutSource.includes('dryRun: !options.commit'),
    rolloutSizeCapped: rolloutSource.includes('MAX_OPERATIONAL_ROLLOUT_TRANSACTIONS = 25'),
    preservesUploadedRows: rolloutSource.includes('preservedSnapshot') && rolloutSource.includes('preservedRowsChanged'),
    documentRequestsDeltaAudited: rolloutSource.includes('documentRequestsDelta') && rolloutSource.includes('documentRequestsChanged'),
    activePortalAccessAudited: rolloutSource.includes('hasActivePortalAccess'),
    runsPortalPostcheck: rolloutSource.includes(PORTAL_VERIFICATION_SCRIPT_PATH),
    noDocumentRequestWrites: !rolloutWritesDocumentRequests,
    noRawPortalTokenLeak: !tokenLeakPattern.test(rolloutSource) && !tokenLeakPattern.test(portalVerificationSource),
  }

  const checks = [
    {
      key: 'phase_reports_present_and_matched',
      ok: phaseSummaries.every((summary) => summary.present && summary.phaseMatches),
    },
    {
      key: 'post_phase10_gates_are_clean',
      ok: postPhase10Summaries.every((summary) =>
        summary.gateOk &&
        summary.failedCount === 0 &&
        summary.warningCount === 0 &&
        summary.productionActivationReady === true,
      ),
    },
    {
      key: 'phase10_only_has_managed_warnings',
      ok: phase10Summary?.gateOk === true &&
        phase10Summary?.status === 'release_readiness_mapped_with_warnings' &&
        phase10Summary?.failedCount === 0,
    },
    {
      key: 'rollout_defaults_to_dry_run',
      ok: rolloutControls.defaultsDryRun && rolloutControls.syncUsesDryRunUntilCommit,
    },
    {
      key: 'rollout_commit_is_explicitly_confirmed',
      ok: rolloutControls.explicitCommitFlag && rolloutControls.confirmationFlag,
    },
    {
      key: 'rollout_size_and_portal_access_are_guarded',
      ok: rolloutControls.rolloutSizeCapped && rolloutControls.activePortalAccessAudited,
    },
    {
      key: 'rollout_preserves_existing_upload_and_review_state',
      ok: rolloutControls.preservesUploadedRows && rolloutControls.documentRequestsDeltaAudited,
    },
    {
      key: 'rollout_does_not_write_client_request_rows',
      ok: rolloutControls.noDocumentRequestWrites,
    },
    {
      key: 'portal_postcheck_is_required_and_sanitized',
      ok: rolloutControls.runsPortalPostcheck && rolloutControls.noRawPortalTokenLeak,
    },
    {
      key: 'phase15_preflight_is_read_only_local_qa',
      ok: scriptSource.includes('mutatedData: false') &&
        forbiddenLocalDataTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'document_generator_remains_out_of_scope',
      ok: docs.toLowerCase().includes('document generator') &&
        excludedScopeTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'phase15_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase15-operational-preflight'] ===
        'npm run verify:document-request-phase14-cross-workspace-parity && npm run test:document-request-phase15-operational-preflight && npm run report:document-request-phase15-operational-preflight',
    },
  ]

  const failed = checks.filter((check) => !check.ok)
  const warnings = []
  const strictFailure = options.strict && warnings.length > 0
  const localPreflightReady = failed.length === 0 && !strictFailure

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    strict: options.strict === true,
    version: 'document_request_operational_preflight_v1',
    phaseSummaries,
    rolloutControls,
    readiness: {
      localPreflightReady,
      controlledDryRunReady: localPreflightReady,
      liveRolloutExecuted: false,
      commitExecuted: false,
      requiresExplicitTransactionScopeForLiveRun: true,
      requiresConfirmOperationalRolloutForWrites: true,
      documentRequestsWriteDebt: false,
    },
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'operational_preflight_mapped',
      ok: localPreflightReady,
      mayProceedToPhase16: failed.length === 0,
      productionActivationReady: localPreflightReady,
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
    controlledDryRunReady: report.readiness.controlledDryRunReady,
    liveRolloutExecuted: report.readiness.liveRolloutExecuted,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
