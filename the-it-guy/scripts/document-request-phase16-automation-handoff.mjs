import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const PHASE = 'document_request_phase16_automation_handoff'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase16-automation-handoff.json'
const AUTOMATION_SCRIPT_PATH = 'scripts/document-request-canonical-phase16-automation.mjs'
const CRON_ENDPOINT_PATH = 'api/cron/document-request-canonical-automation.js'
const PHASE15_PREFLIGHT_REPORT_PATH = 'output/document-request-phase15-operational-preflight.json'

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
  const vercel = readJson('vercel.json')
  const phase15 = readJson(PHASE15_PREFLIGHT_REPORT_PATH)
  const automationSource = read(AUTOMATION_SCRIPT_PATH)
  const cronSource = read(CRON_ENDPOINT_PATH)
  const scriptSource = read('scripts/document-request-phase16-automation-handoff.mjs')
  const docs = read('docs/document-request-phase16-automation-handoff.md')
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
  const requestWritePattern = /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/
  const tokenLeakPattern = /token:\s*row\.seller_workspace_token|sellerWorkspaceToken:\s*row\.seller_workspace_token|portal_token|access_token/i
  const scheduledJobs = Array.isArray(vercel.crons) ? vercel.crons : []
  const documentRequestCronJobs = scheduledJobs.filter((job) => job.path === '/api/cron/document-request-canonical-automation')

  const phase15Readiness = {
    status: phase15.gate?.status || '',
    ok: phase15.gate?.ok === true,
    productionActivationReady: phase15.gate?.productionActivationReady === true,
    failedCount: Number(phase15.gate?.failed?.length || 0),
    warningCount: Number(phase15.gate?.warnings?.length || 0),
    controlledDryRunReady: phase15.readiness?.controlledDryRunReady === true,
    liveRolloutExecuted: phase15.readiness?.liveRolloutExecuted === true,
    commitExecuted: phase15.readiness?.commitExecuted === true,
  }

  const automationControls = {
    scriptPath: AUTOMATION_SCRIPT_PATH,
    phaseMarkerPresent: automationSource.includes('document_request_phase16_automation'),
    reusesPhase15Rollout: automationSource.includes('document-request-canonical-phase15-operational-rollout.mjs'),
    defaultsDryRun: automationSource.includes('const dryRun = options.commit !== true'),
    supportsDryRunFlag: automationSource.includes('--dry-run'),
    supportsCommitFlag: automationSource.includes('--commit'),
    requiresConfirmAutomation: automationSource.includes('--confirm-automation') &&
      automationSource.includes('Automated document request writes require --confirm-automation.'),
    runsPreflightBeforeCommit: automationSource.includes('preflightRollout = await runPhase15') &&
      automationSource.includes('if (!readiness.commitEligible)') &&
      automationSource.includes('commitRollout = await runPhase15'),
    blocksLegacyKeysByDefault: automationSource.includes('legacy_non_canonical_keys_present') &&
      automationSource.includes('--allow-legacy-keys'),
    recordsSchedulingMode: automationSource.includes('--scheduling-enabled') &&
      automationSource.includes('schedulingEnabled: options.schedulingEnabled === true'),
    distinctBlockedCommitExit: automationSource.includes('process.exitCode = 2'),
    doesNotWriteDocumentRequestsDirectly: !requestWritePattern.test(automationSource),
    reportSanitizesRolloutOutputs: automationSource.includes('rollout: activeRollout') &&
      automationSource.includes('portalVerification: activeRollout.portalVerification'),
  }

  const cronControls = {
    endpointPath: CRON_ENDPOINT_PATH,
    route: '/api/cron/document-request-canonical-automation',
    scriptInvoked: cronSource.includes(AUTOMATION_SCRIPT_PATH),
    requiresCronSecret: cronSource.includes('CRON_SECRET') &&
      cronSource.includes('authorization !== `Bearer ${cronSecret}`'),
    defaultsToDryRun: cronSource.includes('DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT') &&
      cronSource.includes("if (commitEnabled) args.push('--commit', '--confirm-automation')"),
    legacyOverrideExplicit: cronSource.includes('DOCUMENT_REQUEST_CANONICAL_AUTOMATION_ALLOW_LEGACY_KEYS') &&
      cronSource.includes("if (allowLegacyKeys) args.push('--allow-legacy-keys')"),
    transactionScopeConfigurable: cronSource.includes('DOCUMENT_REQUEST_CANONICAL_AUTOMATION_TRANSACTION_IDS') &&
      cronSource.includes('PHASE18_PILOT_TRANSACTION_IDS'),
    limitCapped: cronSource.includes('const MAX_LIMIT = 25') &&
      cronSource.includes('Math.min('),
    responseSanitized: cronSource.includes('function sanitizeReport') &&
      cronSource.includes('rolloutSummary') &&
      cronSource.includes('preflightSummary'),
    noRawPortalTokenLeak: !tokenLeakPattern.test(cronSource),
  }

  const schedulingControls = {
    cronJobCount: documentRequestCronJobs.length,
    scheduled: documentRequestCronJobs.length === 1,
    schedule: documentRequestCronJobs[0]?.schedule || '',
    expectedSchedule: '30 1 * * *',
    scheduleMatches: documentRequestCronJobs[0]?.schedule === '30 1 * * *',
  }

  const checks = [
    {
      key: 'phase15_preflight_is_clean',
      ok: phase15Readiness.ok &&
        phase15Readiness.productionActivationReady &&
        phase15Readiness.failedCount === 0 &&
        phase15Readiness.warningCount === 0 &&
        phase15Readiness.controlledDryRunReady &&
        !phase15Readiness.liveRolloutExecuted &&
        !phase15Readiness.commitExecuted,
    },
    {
      key: 'automation_runner_is_dry_run_first_and_commit_gated',
      ok: automationControls.phaseMarkerPresent &&
        automationControls.reusesPhase15Rollout &&
        automationControls.defaultsDryRun &&
        automationControls.supportsDryRunFlag &&
        automationControls.supportsCommitFlag &&
        automationControls.requiresConfirmAutomation,
    },
    {
      key: 'automation_commit_runs_preflight_and_blocks_legacy_keys',
      ok: automationControls.runsPreflightBeforeCommit &&
        automationControls.blocksLegacyKeysByDefault &&
        automationControls.distinctBlockedCommitExit,
    },
    {
      key: 'automation_runner_does_not_write_client_request_rows_directly',
      ok: automationControls.doesNotWriteDocumentRequestsDirectly,
    },
    {
      key: 'cron_endpoint_is_authorized_and_dry_run_by_default',
      ok: cronControls.scriptInvoked &&
        cronControls.requiresCronSecret &&
        cronControls.defaultsToDryRun,
    },
    {
      key: 'cron_endpoint_has_explicit_scope_and_sanitized_response',
      ok: cronControls.legacyOverrideExplicit &&
        cronControls.transactionScopeConfigurable &&
        cronControls.limitCapped &&
        cronControls.responseSanitized &&
        cronControls.noRawPortalTokenLeak,
    },
    {
      key: 'scheduled_job_is_registered_once',
      ok: schedulingControls.scheduled && schedulingControls.scheduleMatches,
    },
    {
      key: 'phase16_handoff_is_read_only_local_qa',
      ok: scriptSource.includes('mutatedData: false') &&
        forbiddenLocalDataTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'document_generator_remains_out_of_scope',
      ok: docs.toLowerCase().includes('document generator') &&
        excludedScopeTokens.every((token) => !scriptSource.includes(token)),
    },
    {
      key: 'phase16_verify_chain_is_registered',
      ok: packageJson.scripts?.['verify:document-request-phase16-automation-handoff'] ===
        'npm run verify:document-request-phase15-operational-preflight && npm run test:document-request-phase16-automation-handoff && npm run report:document-request-phase16-automation-handoff',
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
    version: 'document_request_automation_handoff_v1',
    phase15Readiness,
    automationControls,
    cronControls,
    schedulingControls,
    readiness: {
      automationHandoffReady: failed.length === 0 && !strictFailure,
      cronCompatibleDryRunReady: failed.length === 0,
      liveAutomationExecuted: false,
      commitExecuted: false,
      requiresCronSecret: true,
      requiresCommitEnvFlagForWrites: true,
      requiresLegacyKeyOverrideForLegacyRows: true,
    },
    gate: {
      status: failed.length ? 'blocked' : strictFailure ? 'blocked_warnings' : 'automation_handoff_mapped',
      ok: failed.length === 0 && !strictFailure,
      mayProceedToPhase17: failed.length === 0,
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
    cronCompatibleDryRunReady: report.readiness.cronCompatibleDryRunReady,
    liveAutomationExecuted: report.readiness.liveAutomationExecuted,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
