#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const commandSteps = [
  {
    key: 'canonical_workflow_gates',
    label: 'Canonical workflow gates',
    script: 'test:canonical-workflow-gates',
    coverage: 'Canonical document gates map stage readiness and hard blocks consistently.',
  },
  {
    key: 'transaction_workflow_model',
    label: 'Transaction workflow model',
    script: 'test:transaction-workflow-model',
    coverage: 'Transaction workflow instances, steps, rollups, and evidence rows are seeded and synced.',
  },
  {
    key: 'workflow_rollup_rules',
    label: 'Workflow rollup rules',
    script: 'test:workflow-rollup-rules',
    coverage: 'Parent-stage rollup rules resolve finance, transfer, registration, blockers, and completion.',
  },
  {
    key: 'workflow_actions',
    label: 'Workflow actions',
    script: 'test:workflow-actions',
    coverage: 'Workflow actions gate transfer and registration, block incomplete registration, attach evidence, and audit action events.',
  },
  {
    key: 'workflow_evidence_mapper',
    label: 'Workflow evidence mapper',
    script: 'test:workflow-evidence-mapper',
    coverage: 'Workflow evidence maps documents/events into canonical workflow steps and emits evidence events.',
  },
  {
    key: 'transaction_workflow_rollup',
    label: 'Transaction workflow rollup',
    script: 'test:transaction-workflow-rollup',
    coverage: 'Transaction rollups advance through finance, transfer, registration, and complete closeout states.',
  },
  {
    key: 'transaction_stage_compatibility',
    label: 'Transaction stage compatibility',
    script: 'test:transaction-stage-compatibility',
    coverage: 'Canonical workflow updates remain compatible with legacy stage consumers without unsafe writes.',
  },
  {
    key: 'legacy_stage_mapper',
    label: 'Legacy stage compatibility mapper',
    script: 'test:legacy-stage-compatibility-mapper',
    coverage: 'Legacy registration and complete stage requests map into canonical workflow actions.',
  },
  {
    key: 'legacy_stage_api',
    label: 'Legacy stage API compatibility',
    script: 'test:legacy-stage-api-compatibility',
    coverage: 'Legacy API stage movements route through canonical workflow action handling.',
  },
  {
    key: 'browser_entry_blockers',
    label: 'Browser entry blockers',
    script: 'test:browser-entry-blockers',
    coverage: 'Seller/browser entry blockers, token fixture RPCs, and safe seller portal casts remain guarded.',
  },
  {
    key: 'seller_portal_alignment',
    label: 'Seller portal alignment',
    script: 'test:seller-portal-alignment',
    coverage: 'Seller portal links use the password-gated seller workspace loader before generic client portal loading.',
  },
  {
    key: 'seller_public_browser_smoke',
    label: 'Seller public browser smoke',
    script: 'test:seller-side-phase5-browser-smoke',
    coverage: 'Public seller onboarding, seller portal, demo link, and auth entry routes render without browser entry blockers.',
  },
]

const staticChecks = [
  {
    key: 'registration_action_blockers',
    label: 'Registration completion requires date, title deed, and confirmation evidence.',
    file: 'server/services/workflowActionService.js',
    patterns: [
      /function validateRegistrationPayload/,
      /REGISTRATION_DATE_REQUIRED/,
      /TITLE_DEED_NUMBER_REQUIRED/,
      /REGISTRATION_CONFIRMATION_REQUIRED/,
      /lifecycle_state: 'registered'/,
      /registration_confirmation_document_id:/,
      /registered_at:/,
      /last_meaningful_activity_at: nowIso/,
    ],
  },
  {
    key: 'registration_evidence_and_events',
    label: 'Registration actions attach evidence and emit structured workflow events.',
    file: 'server/services/workflowActionService.js',
    patterns: [
      /descriptor\?\.actionKey === 'MARK_REGISTERED'/,
      /workflowKey: 'registration'/,
      /stepKey: 'registration_confirmed'/,
      /evidenceType: 'document'/,
      /eventType: 'workflow_action_completed'/,
      /eventType: 'workflow_action_blocked'/,
    ],
  },
  {
    key: 'registration_workflow_definition',
    label: 'Registration workflow includes lodged, confirmed, final accounts, and matter closed steps.',
    file: 'server/workflows/transactionWorkflowDefinitions.js',
    patterns: [
      /registration: \{[\s\S]*parentStage: 'REGISTRATION'/,
      /key: 'all_required_matters_lodged'/,
      /key: 'registration_confirmed'/,
      /key: 'final_accounts_complete'/,
      /key: 'matter_closed'/,
      /keys\.push\('registration'\)/,
    ],
  },
  {
    key: 'registration_rollup_blockers',
    label: 'Registration rollup blocks until required matters are lodged and registration evidence is present.',
    file: 'server/services/transactionWorkflowRollup.js',
    patterns: [
      /function buildAttorneyRegistrationWorkflow/,
      /ALL_REQUIRED_MATTERS_NOT_LODGED/,
      /REGISTRATION_CONFIRMATION_REQUIRED/,
      /requiredEvidence: \['REGISTRATION_LETTER'\]/,
      /readyForHandoff: registrationConfirmed/,
    ],
  },
  {
    key: 'workflow_event_rls',
    label: 'Workflow event audit rows are scoped by transaction RLS.',
    file: '../supabase/migrations/202606020020_transaction_workflow_events_phase5.sql',
    patterns: [
      /create table if not exists public\.transaction_workflow_events/,
      /transaction_workflow_events_transaction_idx/,
      /enable row level security/,
      /bridge_can_access_transaction_spine\(transaction_id\)/,
      /for select[\s\S]*using \(public\.bridge_can_access_transaction_spine\(transaction_id\)\)/,
      /for insert[\s\S]*with check \(public\.bridge_can_access_transaction_spine\(transaction_id\)\)/,
    ],
  },
  {
    key: 'seller_visible_registration_updates',
    label: 'Seller portal has client-facing transfer, registration, and closeout update copy.',
    file: 'src/services/clientPortalWorkspaceService.js',
    patterns: [
      /lodgement_submitted: 'Your transfer has been lodged\.'/,
      /registration_confirmed: 'Registration has been completed\.'/,
      /matter_closed: 'The transfer matter has been closed\.'/,
      /cancellation_registered: 'Bond cancellation has registered\.'/,
      /bond_registration_confirmed: 'Your bond registration has been completed\.'/,
      /client_visible/,
    ],
  },
  {
    key: 'seller_browser_smoke_script',
    label: 'Seller public and authenticated browser smoke routes are reusable.',
    file: 'scripts/seller-side-phase5-browser-smoke.mjs',
    patterns: [
      /PUBLIC_ROUTES = \[/,
      /\/demo\/onboarding-links/,
      /\/seller\/onboarding\/demo-seller-onboarding/,
      /\/client\/demo-seller-portal\/selling/,
      /resolveAuthenticatedRoutes/,
      /storageState: options\.authStatePath/,
      /\/transactions\/\$\{id\}\/transfer\/transfer/,
    ],
  },
  {
    key: 'phase5_package_contracts',
    label: 'Package exposes the Phase 5 transfer, registration, and browser-smoke scripts used by this gate.',
    file: 'package.json',
    patterns: [
      ...commandSteps.map((step) => new RegExp(`"${step.script}":\\s*"[^"]+"`)),
      /"verify:seller-side-phase5-transfer-registration": "node scripts\/seller-side-phase5-transfer-registration-gate\.mjs"/,
    ],
  },
]

function parseArgs(argv) {
  const options = {
    staticOnly: false,
    skipTests: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-tests') options.skipTests = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '5',
    scope: 'seller-side-transaction-launch',
    gate: 'transfer-registration-security-browser-contracts',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 5 blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      skippedCommandCount: 0,
    },
    staticChecks: [],
    commands: [],
    acceptance: [
      'Transfer workflow gates expose required next actions and blockers before registration.',
      'Registration cannot complete without registration date, title deed, and confirmation evidence.',
      'Registration and closeout state are auditable through workflow events and evidence rows.',
      'Workflow event audit rows are protected by transaction-scoped RLS.',
      'Public seller onboarding, seller portal, demo links, and auth routes have reusable browser smoke coverage.',
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
    }

    try {
      const source = readProjectFile(check.file)
      for (const pattern of check.patterns || [check.pattern]) {
        if (!pattern.test(source)) {
          result.status = 'BLOCKED'
          result.missingPatterns.push(String(pattern))
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

function runNpmScript(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(NPM_BIN, ['run', step.script], {
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
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: code === 0 ? 'PASS' : 'BLOCKED',
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim().split('\n').slice(-8).join('\n'),
        stderr: stderr.trim().split('\n').slice(-8).join('\n'),
      })
    })
    child.on('error', (error) => {
      resolve({
        key: step.key,
        label: step.label,
        script: step.script,
        command: `npm run ${step.script}`,
        coverage: step.coverage,
        status: 'BLOCKED',
        exitCode: null,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      })
    })
  })
}

async function runCommandChecks(report, options) {
  if (options.staticOnly || options.skipTests) {
    for (const step of commandSteps) {
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

  for (const step of commandSteps) {
    const result = await runNpmScript(step)
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function finalizeReport(report) {
  if (report.summary.staticBlockedCount > 0 || report.summary.commandBlockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Phase 5 blockers are cleared'
    return report
  }

  if (report.summary.skippedCommandCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Static Phase 5 contract passed; run without --static-only before launch sign-off'
    return report
  }

  report.summary.status = 'READY'
  report.summary.recommendation = 'Phase 5 transfer, registration, security, and browser-smoke contracts passed'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)
  runStaticChecks(report)
  await runCommandChecks(report, options)
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
