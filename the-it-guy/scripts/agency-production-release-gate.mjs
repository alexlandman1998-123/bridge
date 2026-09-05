import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { APPROVED_RUNTIME_PROJECTS, runRuntimeReadiness } from './agency-runtime-readiness.test.mjs'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv) {
  const options = {
    allowProductionReadOnly: false,
    confirmProductionReadiness: false,
    failOnBlocked: false,
    releaseRef: '',
    sampleLimit: 1,
    skipNetwork: false,
  }

  for (const arg of argv) {
    if (arg === '--allow-production-read-only') options.allowProductionReadOnly = true
    else if (arg === '--confirm-production-readiness') options.confirmProductionReadiness = true
    else if (arg === '--fail-on-blocked') options.failOnBlocked = true
    else if (arg === '--skip-network') options.skipNetwork = true
    else if (arg.startsWith('--release-ref=')) options.releaseRef = normalizeText(arg.slice('--release-ref='.length))
    else if (arg.startsWith('--sample-limit=')) {
      const value = Number.parseInt(arg.slice('--sample-limit='.length), 10)
      if (!Number.isInteger(value) || value < 0 || value > 25) throw new Error('--sample-limit must be an integer from 0 to 25')
      options.sampleLimit = value
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function addFinding(report, status, title, detail = '') {
  report.findings.push({ status, title, detail })
  if (status === 'PASS') report.summary.passCount += 1
  if (status === 'BLOCKED') report.summary.blockedCount += 1
  if (status === 'CRITICAL') report.summary.criticalCount += 1
}

function finalize(report) {
  if (report.summary.criticalCount > 0) {
    report.summary.status = 'FAILED'
    report.summary.recommendation = 'NO-GO'
  } else if (report.summary.blockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until every production release gate is satisfied'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'Production read-only release gate passed; deployment approval remains a human decision'
  }
  return report
}

export async function runProductionReleaseGate(options = parseArgs(process.argv.slice(2))) {
  const report = {
    phase: '6',
    scope: 'agency-production-release-gate',
    generatedAt: new Date().toISOString(),
    mode: options.skipNetwork ? 'static-preflight' : 'production-read-only',
    mutatedData: false,
    target: { environment: 'production', projectRef: APPROVED_RUNTIME_PROJECTS.production },
    release: { requestedRef: options.releaseRef || null, headRef: null, workingTreeClean: null },
    acknowledgements: {
      allowProductionReadOnly: options.allowProductionReadOnly,
      confirmProductionReadiness: options.confirmProductionReadiness,
    },
    summary: { status: 'BLOCKED', recommendation: 'NO-GO', passCount: 0, blockedCount: 0, criticalCount: 0 },
    findings: [],
    runtimeSummary: null,
    runtimeFindings: [],
  }

  if (!options.allowProductionReadOnly || !options.confirmProductionReadiness) {
    addFinding(
      report,
      'BLOCKED',
      'Production release gate requires two explicit acknowledgements.',
      'Provide --allow-production-read-only and --confirm-production-readiness. No production request was made.',
    )
    return finalize(report)
  }
  addFinding(report, 'PASS', 'Production read-only scope was explicitly acknowledged.')

  const headRef = runGit(['rev-parse', 'HEAD'])
  const workingTree = runGit(['status', '--porcelain'])
  report.release.headRef = headRef || null
  report.release.workingTreeClean = workingTree === ''

  if (!options.releaseRef) {
    addFinding(report, 'BLOCKED', 'An immutable release reference is required.', 'Provide --release-ref=<current full commit SHA>.')
  } else if (!headRef || options.releaseRef !== headRef) {
    addFinding(report, 'BLOCKED', 'Release reference does not match the checked-out commit.', `Requested ${options.releaseRef}; current ${headRef || 'unavailable'}.`)
  } else {
    addFinding(report, 'PASS', 'Release reference matches the checked-out commit.', headRef)
  }

  if (workingTree) {
    addFinding(report, 'BLOCKED', 'Working tree is not clean.', 'Commit or separate outstanding changes before certifying a production release candidate.')
  } else {
    addFinding(report, 'PASS', 'Working tree is clean.')
  }

  if (report.summary.blockedCount > 0) return finalize(report)

  const runtime = await runRuntimeReadiness({
    environment: 'production',
    allowProductionReadOnly: true,
    failOnBlocked: true,
    sampleLimit: options.sampleLimit,
    skipNetwork: options.skipNetwork,
  })
  report.runtimeSummary = runtime.summary
  report.runtimeFindings = runtime.findings

  if (runtime.summary.status !== 'READY') {
    addFinding(report, runtime.summary.criticalCount > 0 ? 'CRITICAL' : 'BLOCKED', 'Production runtime readiness did not pass.', runtime.summary.recommendation)
  } else {
    addFinding(report, 'PASS', 'Production runtime readiness passed with read-only probes only.')
  }

  return finalize(report)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2))
  const report = await runProductionReleaseGate(options)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.summary.status !== 'READY' && (options.failOnBlocked || report.summary.status === 'FAILED')) process.exitCode = 1
}
