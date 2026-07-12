#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath

const phaseGateSteps = [
  {
    key: 'phase2_lead_onboarding',
    label: 'Phase 2 lead-to-onboarding contracts',
    scriptPath: 'scripts/seller-side-phase2-lead-onboarding-gate.mjs',
    coverage: 'Seller lead, seller onboarding, and seller portal route/data contracts.',
  },
  {
    key: 'phase3_listing_mandate',
    label: 'Phase 3 listing and mandate contracts',
    scriptPath: 'scripts/seller-side-phase3-listing-mandate-gate.mjs',
    coverage: 'Private listing conversion, mandate linkage, diagnostics, and canonical mandate projection.',
  },
  {
    key: 'phase4_transaction_spine',
    label: 'Phase 4 transaction spine contracts',
    scriptPath: 'scripts/seller-side-phase4-transaction-spine-gate.mjs',
    coverage: 'Accepted-offer conversion, transaction spine, document promotion, finance, and routing readiness.',
  },
  {
    key: 'phase5_transfer_registration',
    label: 'Phase 5 transfer and registration contracts',
    scriptPath: 'scripts/seller-side-phase5-transfer-registration-gate.mjs',
    coverage: 'Transfer/registration workflow gates, browser-entry blockers, public browser smoke, and workflow event RLS.',
  },
  {
    key: 'phase6_launch_hardening',
    label: 'Phase 6 launch hardening contracts',
    scriptPath: 'scripts/seller-side-phase6-launch-hardening-gate.mjs',
    coverage: 'Build warning hygiene, production build classifier, and transaction-spine RLS static probes.',
  },
]

const optionalStagingStep = {
  key: 'phase1_staging_readiness',
  label: 'Phase 1 staging fixture and environment readiness',
  scriptPath: 'scripts/seller-side-phase1-readiness.mjs',
  args: ['--skip-vercel-env'],
  supportsStaticOnly: false,
  coverage: 'Staging fixture, attorney membership, and launch environment readiness.',
}

const staticChecks = [
  {
    key: 'phase_audit_docs_exist',
    label: 'Seller-side launch audit docs exist for Phase 0 through Phase 7.',
    files: [
      'docs/audits/seller-side-transaction-launch-scope-phase0.md',
      'docs/audits/seller-side-transaction-launch-phase1.md',
      'docs/audits/seller-side-transaction-launch-phase2.md',
      'docs/audits/seller-side-transaction-launch-phase3.md',
      'docs/audits/seller-side-transaction-launch-phase4.md',
      'docs/audits/seller-side-transaction-launch-phase5.md',
      'docs/audits/seller-side-transaction-launch-phase6.md',
      'docs/audits/seller-side-transaction-launch-phase7.md',
    ],
  },
  {
    key: 'phase7_package_script',
    label: 'Package exposes the Phase 7 release-candidate gate.',
    file: 'package.json',
    patterns: [
      /"verify:seller-side-phase7-release-candidate":\s*"node scripts\/seller-side-phase7-release-candidate-gate\.mjs"/,
      /"verify:seller-side-phase6-launch-hardening":\s*"node scripts\/seller-side-phase6-launch-hardening-gate\.mjs"/,
      /"verify:seller-side-phase5-transfer-registration":\s*"node scripts\/seller-side-phase5-transfer-registration-gate\.mjs"/,
    ],
  },
  {
    key: 'master_checklist_phase7',
    label: 'Master seller launch checklist records Phase 7 and strict cutover evidence.',
    file: 'docs/audits/seller-side-transaction-launch-scope-phase0.md',
    patterns: [
      /### Phase 7 Release Candidate And Cutover Evidence/,
      /npm run verify:seller-side-phase7-release-candidate/,
      /--require-cutover-evidence/,
      /SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID/,
      /SELLER_SIDE_RLS_TRANSACTION_ID/,
      /B0-8[\s\S]*Cutover evidence required/,
    ],
  },
  {
    key: 'launch_readiness_phase7',
    label: 'Phase 8 launch readiness document points at the Phase 7 gate and audit.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Phase 7 release-candidate\/cutover evidence contracts: `docs\/audits\/seller-side-transaction-launch-phase7\.md`/,
      /npm run verify:seller-side-phase7-release-candidate/,
      /Phase 7 strict cutover evidence/,
    ],
  },
  {
    key: 'cutover_scripts_have_strict_modes',
    label: 'Browser smoke and RLS probes expose the strict cutover modes Phase 7 requires.',
    file: 'scripts/seller-side-phase5-browser-smoke.mjs',
    patterns: [
      /SELLER_SIDE_BROWSER_SMOKE_BASE_URL/,
      /SELLER_SIDE_BROWSER_SMOKE_AUTH_STATE/,
      /SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID/,
      /--authenticated-only/,
    ],
  },
  {
    key: 'rls_probe_strict_mode',
    label: 'Phase 6 RLS probe requires confirmed staging for live cutover checks.',
    file: 'scripts/seller-side-phase6-rls-probes.mjs',
    patterns: [
      /--confirm-staging/,
      /--require-live/,
      /STAGING_PROJECT_REF\s*=\s*'isdowlnollckzvltkasn'/,
      /options\.live && report\.summary\.liveBlockedCount > 0/,
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipPhaseGates: false,
    fullLocal: false,
    includeStagingReadiness: false,
    requireCutoverEvidence: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-phase-gates') options.skipPhaseGates = true
    else if (arg === '--full-local') options.fullLocal = true
    else if (arg === '--include-staging-readiness') options.includeStagingReadiness = true
    else if (arg === '--require-cutover-evidence') {
      options.requireCutoverEvidence = true
      options.fullLocal = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function createReport(options) {
  return {
    phase: '7',
    scope: 'seller-side-transaction-launch',
    gate: 'release-candidate-cutover-evidence',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 7 release-candidate blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
      cutoverPassCount: 0,
      cutoverBlockedCount: 0,
      cutoverPendingCount: 0,
    },
    staticChecks: [],
    commands: [],
    cutoverEvidence: [],
    acceptance: [
      'Phase 2 through Phase 6 gates are callable from one release-candidate command.',
      'Phase 1 staging readiness can be included without changing the local default.',
      'Authenticated transaction browser smoke is required in strict cutover mode.',
      'Live staging RLS cross-workspace probes are required in strict cutover mode.',
      'The launch checklist distinguishes local release-candidate readiness from production cutover evidence.',
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
      file: check.file || null,
      status: 'PASS',
      missingFiles: [],
      missingPatterns: [],
    }

    try {
      if (check.files?.length) {
        for (const relativePath of check.files) {
          if (!fs.existsSync(new URL(relativePath, PROJECT_ROOT))) {
            result.status = 'BLOCKED'
            result.missingFiles.push(relativePath)
          }
        }
      } else {
        const source = readProjectFile(check.file)
        for (const pattern of check.patterns || []) {
          if (!pattern.test(source)) {
            result.status = 'BLOCKED'
            result.missingPatterns.push(String(pattern))
          }
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

function tailLines(value, count = 14) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function runCommand(executable, args, metadata) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(executable, args, {
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

function buildPhaseSteps(options) {
  const steps = []
  if (options.includeStagingReadiness) steps.push(optionalStagingStep)
  steps.push(...phaseGateSteps)
  return steps
}

async function runPhaseGateChecks(report, options) {
  const steps = buildPhaseSteps(options)
  if (options.staticOnly || options.skipPhaseGates) {
    for (const step of steps) {
      report.commands.push({
        key: step.key,
        label: step.label,
        command: `${NODE_BIN} ${step.scriptPath}`,
        coverage: step.coverage,
        status: 'SKIPPED',
      })
      report.summary.skippedCommandCount += 1
    }
    return
  }

  for (const step of steps) {
    const args = [
      step.scriptPath,
      ...(step.args || []),
      ...(options.fullLocal || step.supportsStaticOnly === false ? [] : ['--static-only']),
    ]
    const raw = await runCommand(NODE_BIN, args, {
      key: step.key,
      label: step.label,
      command: `${NODE_BIN} ${args.join(' ')}`,
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

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const localEnv = parseEnvFile(`${PROJECT_ROOT_PATH}/.env`)
  const stagingEnv = parseEnvFile(`${PROJECT_ROOT_PATH}/.env.staging.local`)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_ANON_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_ANON_KEY
  if (!merged.SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  return merged
}

function addCutoverEvidence(report, finding) {
  report.cutoverEvidence.push(finding)
  if (finding.status === 'PASS') report.summary.cutoverPassCount += 1
  if (finding.status === 'BLOCKED') report.summary.cutoverBlockedCount += 1
  if (finding.status === 'PENDING') report.summary.cutoverPendingCount += 1
}

function missingEnvKeys(env, keys) {
  return keys.filter((key) => !normalizeText(env[key]))
}

function resolveBrowserSmokeConfig(env) {
  return {
    baseUrl: normalizeText(env.SELLER_SIDE_BROWSER_SMOKE_BASE_URL),
    authStatePath: normalizeText(env.SELLER_SIDE_BROWSER_SMOKE_AUTH_STATE || 'playwright/.auth/staging-internal.json'),
    transactionId: normalizeText(env.SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID),
  }
}

function resolveRlsConfig(env) {
  return {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    anonKey: normalizeText(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY),
    actorEmail: normalizeText(env.SELLER_SIDE_RLS_ACTOR_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.SELLER_SIDE_RLS_ACTOR_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
    unrelatedEmail: normalizeText(env.SELLER_SIDE_RLS_UNRELATED_EMAIL || env.AGENCY_RUNTIME_UNRELATED_EMAIL),
    unrelatedPassword: normalizeText(env.SELLER_SIDE_RLS_UNRELATED_PASSWORD || env.AGENCY_RUNTIME_UNRELATED_PASSWORD),
    transactionId: normalizeText(env.SELLER_SIDE_RLS_TRANSACTION_ID),
  }
}

async function runCutoverEvidence(report, options) {
  const env = loadEnv()
  const browserConfig = resolveBrowserSmokeConfig(env)
  const browserMissing = []
  if (!browserConfig.baseUrl) browserMissing.push('SELLER_SIDE_BROWSER_SMOKE_BASE_URL')
  if (!browserConfig.transactionId) browserMissing.push('SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID')
  if (!browserConfig.authStatePath) browserMissing.push('SELLER_SIDE_BROWSER_SMOKE_AUTH_STATE')
  if (browserConfig.authStatePath && !fs.existsSync(new URL(browserConfig.authStatePath, PROJECT_ROOT))) {
    browserMissing.push(`auth state file not found: ${browserConfig.authStatePath}`)
  }

  if (!options.requireCutoverEvidence) {
    addCutoverEvidence(report, {
      key: 'authenticated_transaction_browser_smoke',
      label: 'Authenticated transaction browser smoke',
      status: 'PENDING',
      command: 'node scripts/seller-side-phase5-browser-smoke.mjs --authenticated-only',
      detail: 'Required before production cutover; skipped in local release-candidate mode.',
      missingConfiguration: browserMissing,
    })
  } else if (browserMissing.length) {
    addCutoverEvidence(report, {
      key: 'authenticated_transaction_browser_smoke',
      label: 'Authenticated transaction browser smoke',
      status: 'BLOCKED',
      command: 'node scripts/seller-side-phase5-browser-smoke.mjs --authenticated-only',
      missingConfiguration: browserMissing,
    })
  } else {
    const raw = await runCommand(NODE_BIN, ['scripts/seller-side-phase5-browser-smoke.mjs', '--authenticated-only'], {
      key: 'authenticated_transaction_browser_smoke',
      label: 'Authenticated transaction browser smoke',
      command: 'node scripts/seller-side-phase5-browser-smoke.mjs --authenticated-only',
    })
    addCutoverEvidence(report, {
      ...raw,
      status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
      stdout: tailLines(raw.stdout),
      stderr: tailLines(raw.stderr),
    })
  }

  const rlsConfig = resolveRlsConfig(env)
  const rlsMissing = [
    ...missingEnvKeys({
      SUPABASE_URL: rlsConfig.supabaseUrl,
      SUPABASE_ANON_KEY: rlsConfig.anonKey,
      SELLER_SIDE_RLS_ACTOR_EMAIL: rlsConfig.actorEmail,
      SELLER_SIDE_RLS_ACTOR_PASSWORD: rlsConfig.actorPassword,
      SELLER_SIDE_RLS_UNRELATED_EMAIL: rlsConfig.unrelatedEmail,
      SELLER_SIDE_RLS_UNRELATED_PASSWORD: rlsConfig.unrelatedPassword,
      SELLER_SIDE_RLS_TRANSACTION_ID: rlsConfig.transactionId,
    }, [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SELLER_SIDE_RLS_ACTOR_EMAIL',
      'SELLER_SIDE_RLS_ACTOR_PASSWORD',
      'SELLER_SIDE_RLS_UNRELATED_EMAIL',
      'SELLER_SIDE_RLS_UNRELATED_PASSWORD',
      'SELLER_SIDE_RLS_TRANSACTION_ID',
    ]),
  ]

  if (!options.requireCutoverEvidence) {
    addCutoverEvidence(report, {
      key: 'live_staging_rls_cross_workspace_probe',
      label: 'Live staging RLS cross-workspace probe',
      status: 'PENDING',
      command: 'node scripts/seller-side-phase6-rls-probes.mjs --live --confirm-staging --require-live',
      detail: 'Required before production cutover; skipped in local release-candidate mode.',
      missingConfiguration: rlsMissing,
    })
  } else if (rlsMissing.length) {
    addCutoverEvidence(report, {
      key: 'live_staging_rls_cross_workspace_probe',
      label: 'Live staging RLS cross-workspace probe',
      status: 'BLOCKED',
      command: 'node scripts/seller-side-phase6-rls-probes.mjs --live --confirm-staging --require-live',
      missingConfiguration: rlsMissing,
    })
  } else {
    const raw = await runCommand(NODE_BIN, ['scripts/seller-side-phase6-rls-probes.mjs', '--live', '--confirm-staging', '--require-live'], {
      key: 'live_staging_rls_cross_workspace_probe',
      label: 'Live staging RLS cross-workspace probe',
      command: 'node scripts/seller-side-phase6-rls-probes.mjs --live --confirm-staging --require-live',
    })
    addCutoverEvidence(report, {
      ...raw,
      status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
      stdout: tailLines(raw.stdout),
      stderr: tailLines(raw.stderr),
    })
  }
}

function finalizeReport(report, options) {
  if (
    report.summary.staticBlockedCount > 0 ||
    report.summary.commandBlockedCount > 0 ||
    report.summary.cutoverBlockedCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Phase 7 release-candidate blockers are cleared'
    return report
  }

  if (options.requireCutoverEvidence) {
    report.summary.status = 'READY_CUTOVER'
    report.summary.recommendation = 'Seller-side release candidate and strict cutover evidence passed'
    return report
  }

  if (options.staticOnly || report.summary.skippedCommandCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Phase 7 static release-candidate contracts passed; run without skip flags before local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_RC'
  report.summary.recommendation = 'Local seller-side release candidate passed; strict cutover evidence remains pending'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  runStaticChecks(report)
  await runPhaseGateChecks(report, options)
  await runCutoverEvidence(report, options)
  finalizeReport(report, options)

  console.log(JSON.stringify(report, null, 2))

  if (!['READY_STATIC_ONLY', 'READY_LOCAL_RC', 'READY_CUTOVER'].includes(report.summary.status)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: error.stack,
  }, null, 2))
  process.exitCode = 1
})
