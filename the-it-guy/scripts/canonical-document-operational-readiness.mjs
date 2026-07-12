import { spawn } from 'node:child_process'

const REQUIRED_ZERO_PARITY_CHECKS = [
  'unmappedLegacyKeyCount',
  'duplicateActiveCanonicalRequirementCount',
  'statusConflictCount',
  'invalidRoleIssueCount',
  'impossibleWorkflowBlockerCount',
]

const EXPECTED_PARITY_RECOMMENDATION = 'proceed_to_browser_level_staging_verification_after_manual_review_of_backfill_report'

function hasArg(name) {
  return process.argv.includes(name)
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function isTruthy(value = '') {
  return ['1', 'true', 'yes', 'on'].includes(normalizeText(value).toLowerCase())
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function extractJsonObject(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not parse verifier JSON output.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

function createReport() {
  return {
    ok: false,
    phase: '7',
    scope: 'canonical-document-operational-readiness',
    generatedAt: new Date().toISOString(),
    mode: 'real_staging_operational_gate',
    mutatedData: false,
    status: 'RUNNING',
    blockedStage: null,
    gates: {
      parity: null,
      actorReadiness: null,
      browserSmoke: null,
    },
    nextCommand: null,
  }
}

function createChildError(scriptPath, code, stdout, stderr) {
  const output = `${stdout || ''}\n${stderr || ''}`.trim()
  const error = new Error(`${scriptPath} exited ${code}${output ? `\n${output}` : ''}`)
  error.code = code
  error.stdout = stdout
  error.stderr = stderr
  return error
}

async function runNodeScript(scriptPath, args = [], env = process.env, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0 && !options.allowFailure) {
        reject(createChildError(scriptPath, code, stdout, stderr))
        return
      }
      resolve({ code, stdout, stderr })
    })
  })
}

function summarizeParityGate(report = {}) {
  const criticalChecks = report.criticalChecks || {}
  const blockingReasons = []

  for (const key of REQUIRED_ZERO_PARITY_CHECKS) {
    const value = criticalChecks[key] || 0
    if (value !== 0) {
      blockingReasons.push({
        code: key,
        detail: `Expected ${key}=0 before browser-level verification; received ${value}.`,
      })
    }
  }

  if (report.recommendation !== EXPECTED_PARITY_RECOMMENDATION) {
    blockingReasons.push({
      code: 'parity_recommendation_not_ready',
      detail: `Expected recommendation ${EXPECTED_PARITY_RECOMMENDATION}; received ${report.recommendation || 'none'}.`,
    })
  }

  return {
    ok: blockingReasons.length === 0,
    recommendation: report.recommendation || null,
    paritySummary: report.paritySummary || null,
    criticalChecks,
    blockingReasons,
  }
}

function summarizeActorGate(report = {}) {
  const readiness = report.readiness || {}
  const blockingReasons = readiness.blockingReasons || []
  const warnings = readiness.warnings || []

  return {
    ok: Boolean(report.ok),
    status: readiness.status || 'UNKNOWN',
    selectedMembershipId: readiness.selectedMembershipId || null,
    selectedWorkspaceId: readiness.selectedWorkspaceId || null,
    blockingReasons,
    warningCount: warnings.length,
    nextCommand: report.nextCommand || null,
  }
}

function summarizeBrowserSmoke(childResult = {}) {
  const output = `${childResult.stdout || ''}\n${childResult.stderr || ''}`.trim()
  let parsed = null
  try {
    parsed = extractJsonObject(output)
  } catch {
    parsed = null
  }

  return {
    ok: childResult.code === 0 && Boolean(parsed?.ok),
    exitCode: childResult.code,
    mode: parsed?.mode || null,
    appUrl: parsed?.appUrl || null,
    legalTemplatesRoute: parsed?.browser?.legalTemplates?.route || null,
    transactionDocumentsRoute: parsed?.browser?.transactionDocuments?.route || null,
    telemetry: parsed?.browser?.telemetry || null,
    error: parsed?.error || (childResult.code === 0 ? null : output.slice(0, 1200)),
  }
}

function blockReport(report, stage, blockingReasons, nextCommand = null) {
  report.ok = false
  report.status = 'BLOCKED'
  report.blockedStage = stage
  report.nextCommand = nextCommand || 'Resolve the blocking reasons, then rerun npm run verify:canonical-documents:operational.'

  if (stage === 'parity' && report.gates.parity) {
    report.gates.parity.blockingReasons = blockingReasons
  }
  if (stage === 'actor_readiness' && report.gates.actorReadiness) {
    report.gates.actorReadiness.blockingReasons = blockingReasons
  }
  if (stage === 'browser_smoke' && report.gates.browserSmoke) {
    report.gates.browserSmoke.blockingReasons = blockingReasons
  }

  console.log(safeJson(report))
  process.exitCode = 1
}

async function main() {
  const report = createReport()
  const env = process.env

  try {
    const parityResult = await runNodeScript('scripts/canonical-document-real-staging-dry-run.mjs', [], env)
    report.gates.parity = summarizeParityGate(extractJsonObject(parityResult.stdout))
    if (!report.gates.parity.ok) {
      blockReport(report, 'parity', report.gates.parity.blockingReasons)
      return
    }

    const actorResult = await runNodeScript('scripts/canonical-document-browser-actor-readiness.mjs', [], env)
    report.gates.actorReadiness = summarizeActorGate(extractJsonObject(actorResult.stdout))
    if (!report.gates.actorReadiness.ok) {
      blockReport(
        report,
        'actor_readiness',
        report.gates.actorReadiness.blockingReasons,
        report.gates.actorReadiness.nextCommand,
      )
      return
    }

    if (hasArg('--skip-browser-smoke') || isTruthy(env.CANONICAL_OPERATIONAL_SKIP_BROWSER_SMOKE)) {
      report.ok = true
      report.status = 'READY_FOR_BROWSER_SMOKE'
      report.gates.browserSmoke = { skipped: true, ok: true }
      report.nextCommand = 'npm run verify:canonical-documents:browser-staging -- --skip-parity --skip-actor-readiness'
      console.log(safeJson(report))
      return
    }

    const browserResult = await runNodeScript(
      'scripts/canonical-document-browser-staging-smoke.mjs',
      ['--skip-parity', '--skip-actor-readiness'],
      env,
      { allowFailure: true },
    )
    report.gates.browserSmoke = summarizeBrowserSmoke(browserResult)
    if (!report.gates.browserSmoke.ok) {
      blockReport(report, 'browser_smoke', [{
        code: 'browser_smoke_failed',
        detail: report.gates.browserSmoke.error || 'Browser smoke exited without an operational success report.',
      }])
      return
    }

    report.ok = true
    report.status = 'OPERATIONAL'
    report.nextCommand = 'Canonical document generator is ready for controlled staging sign-off.'
    console.log(safeJson(report))
  } catch (error) {
    report.ok = false
    report.status = 'ERROR'
    report.blockedStage = report.blockedStage || 'operational_gate'
    report.nextCommand = 'Review the error, then rerun npm run verify:canonical-documents:operational.'
    report.error = error?.message || String(error)
    console.error(safeJson(report))
    process.exitCode = 1
  }
}

main()
