#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const TARGETED_LINT_FILES = [
  'scripts/agent-bond-attorney-launch-gate.mjs',
  'scripts/agent-bond-attorney-launch-gate.test.mjs',
  'scripts/transaction-propagation-smoke.mjs',
  'src/lib/api.js',
  'src/lib/settingsApi.js',
  'src/services/partnerRoutingResolverService.js',
  'src/services/bondPartnerProfileService.js',
  'src/services/partnerNetworkService.js',
]

const LOCAL_STEPS = [
  {
    key: 'targeted_lint',
    label: 'Targeted launch-path lint',
    command: NPX_BIN,
    args: ['eslint', ...TARGETED_LINT_FILES],
  },
  {
    key: 'partner_routing_resolver_tests',
    label: 'Partner routing resolver tests',
    command: process.execPath,
    args: ['src/services/__tests__/partnerRoutingResolverService.test.js'],
  },
  {
    key: 'universal_partner_routing_tests',
    label: 'Universal partner routing tests',
    command: process.execPath,
    args: ['src/services/__tests__/universalPartnerRoutingService.test.js'],
  },
]

function getAcceptance(report) {
  return report?.acceptance || {}
}

function getPartnerRouting(report) {
  return report?.partnerRouting || {}
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasText(value) {
  return String(value || '').trim().length > 0
}

export const LAUNCH_BLOCKER_GATES = [
  {
    key: 'core_smoke_passed',
    label: 'Core smoke flow passed',
    evaluate: (report) => report?.pass === true,
    detail: (report) => `runId=${report?.runId || 'unknown'}`,
  },
  {
    key: 'roleplayer_propagation',
    label: 'Roleplayer propagation and idempotency stayed clean',
    evaluate: (report) => {
      const acceptance = getAcceptance(report)
      return (
        acceptance.cashNoBondApplication === true &&
        acceptance.bondHasBondApplication === true &&
        acceptance.hybridHasBondApplication === true &&
        acceptance.allRecordsShareTransactionId === true &&
        acceptance.noDuplicateDownstreamRecords === true
      )
    },
    detail: (report) => `created=${Array.isArray(report?.created) ? report.created.length : 0}`,
  },
  {
    key: 'rls_visibility',
    label: 'Assigned parties can see their records and unrelated parties are blocked',
    evaluate: (report) => {
      const acceptance = getAcceptance(report)
      return (
        acceptance.unrelatedRoleplayerBlocked === true &&
        acceptance.unrelatedRoleplayerTransactionBlocked === true &&
        acceptance.assignedBondOriginatorCanSeeApplication === true
      )
    },
    detail: (report) => `rlsChecked=${getAcceptance(report).rlsChecked === true}`,
  },
  {
    key: 'security_audit_events',
    label: 'Security audit events persisted',
    evaluate: (report) =>
      getAcceptance(report).securityAuditEventsPersisted === true &&
      report?.audit?.pass === true &&
      numberValue(report?.audit?.rowsFound) > 0,
    detail: (report) => `rowsFound=${numberValue(report?.audit?.rowsFound)}`,
  },
  {
    key: 'workflow_readiness_schema',
    label: 'Checklist readiness schema is compatible',
    evaluate: (report) =>
      getAcceptance(report).workflowReadinessSchemaReady === true &&
      report?.workflowSchema?.pass === true &&
      Array.isArray(report?.workflowSchema?.missing) &&
      report.workflowSchema.missing.length === 0,
    detail: (report) => `missing=${(report?.workflowSchema?.missing || []).join(',') || 'none'}`,
  },
  {
    key: 'partner_routing_no_fallback',
    label: 'Bond originator routing resolved without manual fallback',
    evaluate: (report) => {
      const routing = getPartnerRouting(report)
      const expectedRoutedDeals = numberValue(routing.expectedRoutedDeals)
      const routedEvents = Array.isArray(routing.bondOriginatorEvents) ? routing.bondOriginatorEvents.length : 0
      return (
        getAcceptance(report).partnerRoutingResolvedWithoutFallback === true &&
        routing.pass === true &&
        expectedRoutedDeals >= 2 &&
        routedEvents >= expectedRoutedDeals &&
        numberValue(routing.fallbackCount) === 0 &&
        numberValue(routing.missingRuleCount) === 0 &&
        numberValue(routing.wrongTargetCount) === 0
      )
    },
    detail: (report) => {
      const routing = getPartnerRouting(report)
      return `expected=${numberValue(routing.expectedRoutedDeals)} fallback=${numberValue(routing.fallbackCount)} missingRule=${numberValue(routing.missingRuleCount)} wrongTarget=${numberValue(routing.wrongTargetCount)}`
    },
  },
  {
    key: 'partner_routing_fixture',
    label: 'Staging partner relationship and routing rule fixture exist',
    evaluate: (report) =>
      hasText(report?.partnerRoutingFixture?.relationshipId) &&
      hasText(report?.partnerRoutingFixture?.routingRuleId),
    detail: (report) =>
      `relationship=${report?.partnerRoutingFixture?.relationshipId || 'missing'} rule=${report?.partnerRoutingFixture?.routingRuleId || 'missing'}`,
  },
]

export function evaluateSmokeReport(report) {
  const checks = LAUNCH_BLOCKER_GATES.map((gate) => ({
    key: gate.key,
    label: gate.label,
    pass: gate.evaluate(report) === true,
    detail: gate.detail ? gate.detail(report) : '',
  }))
  const failures = checks.filter((check) => !check.pass)
  const routing = getPartnerRouting(report)
  return {
    pass: failures.length === 0,
    runId: report?.runId || null,
    checks,
    failures,
    summary: {
      createdTransactions: Array.isArray(report?.created) ? report.created.length : 0,
      auditRowsFound: numberValue(report?.audit?.rowsFound),
      expectedRoutedDeals: numberValue(routing.expectedRoutedDeals),
      bondOriginatorRoutingEvents: Array.isArray(routing.bondOriginatorEvents) ? routing.bondOriginatorEvents.length : 0,
      fallbackCount: numberValue(routing.fallbackCount),
    },
  }
}

export function parseSmokeReport(output = '') {
  const text = String(output || '').trim()
  const starts = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{' && (index === 0 || text[index - 1] === '\n')) starts.push(index)
  }
  for (const start of starts.reverse()) {
    const candidate = text.slice(start).trim()
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // Keep scanning; child processes can print non-JSON logs before the final report.
    }
  }
  throw new Error('Could not parse the transaction propagation smoke JSON report.')
}

function parseArgs(argv) {
  return {
    skipLocal: argv.includes('--skip-local'),
    skipStaging: argv.includes('--skip-staging') || argv.includes('--local-only'),
  }
}

function runCommand({ key, label, command, args = [], allowFailure = false }) {
  return new Promise((resolve, reject) => {
    console.log(`\n[${key}] ${label}`)
    console.log(`$ ${[command, ...args].join(' ')}`)
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', reject)
    child.on('close', (exitCode) => {
      const result = { key, label, command, args, exitCode, stdout, stderr }
      if (exitCode === 0 || allowFailure) {
        resolve(result)
        return
      }
      const error = new Error(`${label} failed with exit code ${exitCode}`)
      error.result = result
      reject(error)
    })
  })
}

function printEvaluation(evaluation) {
  console.log('\n[launch_gate] Agent -> Bond Originator -> Attorney checks')
  for (const check of evaluation.checks) {
    const marker = check.pass ? 'PASS' : 'FAIL'
    console.log(`${marker} ${check.key}: ${check.label}${check.detail ? ` (${check.detail})` : ''}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const stepResults = []

  if (!options.skipLocal) {
    for (const step of LOCAL_STEPS) {
      const result = await runCommand(step)
      stepResults.push({ key: step.key, pass: result.exitCode === 0 })
    }
  }

  if (options.skipStaging) {
    console.log('\n[staging_smoke] skipped by --skip-staging/--local-only')
    console.log(JSON.stringify({ pass: true, localSteps: stepResults, stagingSmoke: 'skipped' }, null, 2))
    return
  }

  const smokeResult = await runCommand({
    key: 'staging_smoke',
    label: 'Full staging transaction propagation smoke',
    command: process.execPath,
    args: ['scripts/transaction-propagation-smoke.mjs'],
    allowFailure: true,
  })
  const smokeReport = parseSmokeReport(smokeResult.stdout || smokeResult.stderr)
  const evaluation = evaluateSmokeReport(smokeReport)
  printEvaluation(evaluation)

  const pass = smokeResult.exitCode === 0 && evaluation.pass
  console.log(JSON.stringify({
    pass,
    localSteps: stepResults,
    smokeExitCode: smokeResult.exitCode,
    ...evaluation,
  }, null, 2))

  if (!pass) process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(JSON.stringify({
      pass: false,
      error: error.message,
      stack: error.stack,
    }, null, 2))
    process.exitCode = 1
  })
}
