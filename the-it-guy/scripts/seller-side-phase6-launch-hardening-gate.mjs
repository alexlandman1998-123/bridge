#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const commandSteps = [
  {
    key: 'build_chunk_hygiene',
    label: 'Build chunk hygiene contracts',
    script: 'test:build-chunk-hygiene',
    coverage: 'Manual chunks keep entangled API/workflow modules co-located and preserve reviewed bundle budgets.',
  },
  {
    key: 'phase6_rls_static_probes',
    label: 'Phase 6 RLS static probes',
    script: 'test:seller-side-phase6-rls-probes',
    coverage: 'Transaction, document, participant, roleplayer, bond application, and workflow event RLS policies inherit transaction-spine access.',
  },
]

const phase5RegressionStep = {
  key: 'phase5_transfer_registration_regression',
  label: 'Phase 5 transfer and registration regression',
  script: 'verify:seller-side-phase5-transfer-registration',
  coverage: 'Transfer, registration, workflow events, seller public smoke, and browser-entry blockers still pass after hardening changes.',
}

const buildWarningClassifiers = [
  {
    key: 'manual_chunk_cycle',
    severity: 'BLOCKED',
    pattern: /Circular chunk:/i,
    message: 'Production build emitted a circular manual chunk warning.',
  },
  {
    key: 'mixed_dynamic_static_import',
    severity: 'BLOCKED',
    pattern: /is dynamically imported by [\s\S]* but also statically imported by/i,
    message: 'Production build emitted a mixed dynamic/static import warning.',
  },
  {
    key: 'chunk_size_warning',
    severity: 'BLOCKED',
    pattern: /Some chunks are larger than/i,
    message: 'Production build exceeded the reviewed chunk-size warning budget.',
  },
]

const staticChecks = [
  {
    key: 'api_chunk_colocation_budget',
    label: 'API, settings, workspace resolution, and attorney workflow fallbacks share the reviewed API chunk budget.',
    file: 'vite.config.js',
    patterns: [
      /APP_API_COLOCATED_FILES[\s\S]*\/src\/lib\/api\.js[\s\S]*\/src\/lib\/settingsApi\.js[\s\S]*\/src\/services\/workspaceResolutionService\.js/,
      /ATTORNEY_WORKFLOW_FACT_FILES[\s\S]*\/src\/lib\/buyerOnboardingFlow\.js[\s\S]*\/src\/core\/legal\/legalRuleRegistry\.js/,
      /ATTORNEY_WORKFLOW_FACT_FILES\.some\(\(filePath\) => normalizedId\.endsWith\(filePath\)\)[\s\S]*return 'app-api'/,
      /chunkSizeWarningLimit:\s*2200/,
    ],
    forbiddenPatterns: [
      /return\s*'app-attorney-workflow'/,
      /return\s*'app-settings-api'/,
      /return\s*'app-workspace-resolution'/,
    ],
  },
  {
    key: 'telemetry_import_hygiene',
    label: 'UX diagnostics uses one telemetry import path without a Vite mixed-import warning.',
    file: 'src/services/observability/uxDiagnostics.js',
    patterns: [
      /import\s*\{\s*trackTelemetryEvent\s*\}\s*from\s*['"]\.\/telemetry\.js['"]/,
      /trackTelemetryEvent\(\{[\s\S]*eventName:\s*'ux_friction_reported'/,
    ],
    forbiddenPatterns: [
      /await\s+import\(['"]\.\/telemetry\.js['"]\)/,
    ],
  },
  {
    key: 'phase6_rls_probe_contract',
    label: 'Phase 6 RLS probe can run static checks and guarded staging live probes.',
    file: 'scripts/seller-side-phase6-rls-probes.mjs',
    patterns: [
      /STAGING_PROJECT_REF\s*=\s*'isdowlnollckzvltkasn'/,
      /SELLER_SIDE_RLS_ACTOR_EMAIL/,
      /SELLER_SIDE_RLS_UNRELATED_EMAIL/,
      /--confirm-staging/,
      /liveProbeTables\s*=\s*\[[\s\S]*transaction_participants[\s\S]*transaction_role_players[\s\S]*transaction_workflow_events[\s\S]*transaction_bond_applications[\s\S]*document_requests/,
      /options\.live && report\.summary\.liveBlockedCount > 0/,
    ],
  },
  {
    key: 'phase6_package_scripts',
    label: 'Package exposes Phase 6 RLS and launch-hardening commands.',
    file: 'package.json',
    patterns: [
      /"test:seller-side-phase6-rls-probes":\s*"node scripts\/seller-side-phase6-rls-probes\.mjs"/,
      /"verify:seller-side-phase6-launch-hardening":\s*"node scripts\/seller-side-phase6-launch-hardening-gate\.mjs"/,
    ],
  },
]

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipTests: false,
    skipBuild: false,
    includePhase5Regression: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-tests') options.skipTests = true
    else if (arg === '--skip-build') options.skipBuild = true
    else if (arg === '--include-phase5-regression') options.includePhase5Regression = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '6',
    scope: 'seller-side-transaction-launch',
    gate: 'launch-hardening-build-rls',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 6 launch-hardening blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
      buildPassCount: 0,
      buildBlockedCount: 0,
      buildWarningCount: 0,
      skippedBuildCount: 0,
    },
    staticChecks: [],
    commands: [],
    build: null,
    acceptance: [
      'Production build emits no circular manual chunk warnings.',
      'Production build emits no mixed dynamic/static import warnings.',
      'Production build emits no chunk-size warnings under the reviewed launch budget.',
      'Transaction-spine RLS static contracts are gated for seller-side transaction records.',
      'A guarded staging live RLS probe is available for production cutover evidence.',
    ],
  }
}

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function runStaticChecks(report) {
  for (const check of staticChecks) {
    const result = {
      key: check.key,
      label: check.label,
      file: check.file,
      status: 'PASS',
      missingPatterns: [],
      forbiddenPatterns: [],
    }

    try {
      const source = readProjectFile(check.file)
      for (const pattern of check.patterns || []) {
        if (!pattern.test(source)) {
          result.status = 'BLOCKED'
          result.missingPatterns.push(String(pattern))
        }
      }
      for (const pattern of check.forbiddenPatterns || []) {
        if (pattern.test(source)) {
          result.status = 'BLOCKED'
          result.forbiddenPatterns.push(String(pattern))
        }
      }
    } catch (error) {
      result.status = 'BLOCKED'
      result.error = error?.message || String(error)
    }

    report.staticChecks.push(result)
    if (result.status === 'PASS') report.summary.staticPassCount += 1
    else report.summary.staticBlockedCount += 1
  }
}

function tailLines(value, count = 12) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function runNpmCommand(args, metadata) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(NPM_BIN, args, {
      cwd: PROJECT_ROOT_PATH,
      env: process.env,
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
    child.on('close', (code) => {
      resolve({
        ...metadata,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      })
    })
    child.on('error', (error) => {
      resolve({
        ...metadata,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
        stdout,
        stderr,
      })
    })
  })
}

async function runCommandChecks(report, options) {
  const steps = options.includePhase5Regression ? [...commandSteps, phase5RegressionStep] : commandSteps
  if (options.staticOnly || options.skipTests) {
    for (const step of steps) {
      report.commands.push({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: 'SKIPPED',
      })
      report.summary.skippedCommandCount += 1
    }
    return
  }

  for (const step of steps) {
    const raw = await runNpmCommand(['run', step.script], {
      key: step.key,
      label: step.label,
      script: step.script,
      command: `npm run ${step.script}`,
      coverage: step.coverage,
    })
    const result = {
      ...raw,
      status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
      stdout: tailLines(raw.stdout),
      stderr: tailLines(raw.stderr),
    }
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

async function runBuildCheck(report, options) {
  if (options.staticOnly || options.skipBuild) {
    report.build = {
      command: 'npm run build',
      status: 'SKIPPED',
    }
    report.summary.skippedBuildCount += 1
    return
  }

  const raw = await runNpmCommand(['run', 'build'], {
    key: 'production_build',
    label: 'Production build warning classifier',
    command: 'npm run build',
  })
  const output = `${raw.stdout || ''}\n${raw.stderr || ''}`
  const warningMatches = buildWarningClassifiers
    .filter((classifier) => classifier.pattern.test(output))
    .map(({ key, severity, message }) => ({ key, severity, message }))

  const status = raw.exitCode === 0 && !raw.error && warningMatches.length === 0 ? 'PASS' : 'BLOCKED'
  report.build = {
    key: raw.key,
    label: raw.label,
    command: raw.command,
    status,
    exitCode: raw.exitCode,
    durationMs: raw.durationMs,
    warningMatches,
    stdout: tailLines(raw.stdout, 20),
    stderr: tailLines(raw.stderr, 20),
    error: raw.error,
  }

  if (warningMatches.length) report.summary.buildWarningCount += warningMatches.length
  if (status === 'PASS') report.summary.buildPassCount += 1
  else report.summary.buildBlockedCount += 1
}

function finalizeReport(report) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.buildBlockedCount > 0 ||
    report.summary.buildWarningCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Phase 6 launch-hardening blockers are cleared'
    return report
  }

  if (report.summary.skippedCommandCount > 0 || report.summary.skippedBuildCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 6 hardening contracts passed; run without skip flags before launch sign-off'
    return report
  }

  report.summary.status = 'READY'
  report.summary.recommendation = 'Phase 6 build warning hygiene and RLS static launch-hardening contracts passed'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  runStaticChecks(report)
  await runCommandChecks(report, options)
  await runBuildCheck(report, options)
  finalizeReport(report)

  console.log(JSON.stringify(report, null, 2))

  if (report.summary.status !== 'READY' && report.summary.status !== 'READY_STATIC_ONLY') {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
