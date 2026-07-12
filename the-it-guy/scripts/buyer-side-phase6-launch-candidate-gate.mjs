#!/usr/bin/env node
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const NODE_BIN = process.execPath

const localCandidateSteps = [
  {
    key: 'phase0_scope_fixture_contract',
    label: 'Buyer Phase 0 scope and fixture contract',
    scriptPath: 'scripts/buyer-side-phase0-scope-fixtures-gate.mjs',
    coverage: 'Buyer journey scope, route surface, staging personas, staging record IDs, env placeholders, owners, and blockers are locked.',
  },
  {
    key: 'buyer_lead_registration_diagnostic',
    label: 'Buyer local lead-to-registration diagnostic',
    scriptPath: 'scripts/buyer-side-lead-registration-diagnostic-gate.mjs',
    coverage: 'Buyer lead, onboarding, offer, transaction, finance, documents, workflow, registration, and browser-entry contracts pass.',
  },
  {
    key: 'phase1_live_staging_transaction_contract',
    label: 'Buyer Phase 1 staging transaction contract',
    scriptPath: 'scripts/buyer-side-phase1-live-staging-transaction-gate.mjs',
    args: ['--skip-local-diagnostic'],
    coverage: 'Phase 1 live fixture, transaction spine, onboarding, portal, document request, and registration-readiness contracts are callable.',
  },
  {
    key: 'phase2_rls_access_contract',
    label: 'Buyer Phase 2 RLS access contract',
    scriptPath: 'scripts/buyer-side-phase2-rls-access-probes.mjs',
    args: ['--skip-prerequisites'],
    coverage: 'Buyer, agent, branch manager, attorney, bond, and unrelated-user RLS contracts are callable.',
  },
  {
    key: 'phase3_offer_token_browser_contract',
    label: 'Buyer Phase 3 public offer-token contract',
    scriptPath: 'scripts/buyer-side-phase3-offer-token-browser-smoke.mjs',
    args: ['--skip-prerequisites'],
    coverage: 'Direct offer, offer session, offer detail, duplicate, invalid, expired, and revised offer-token contracts are callable.',
  },
  {
    key: 'phase4_token_delivery_contract',
    label: 'Buyer Phase 4 token delivery contract',
    scriptPath: 'scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs',
    args: ['--skip-prerequisites'],
    coverage: 'Buyer onboarding, portal, offer-token delivery, invalid-token, reused-token, and delivery-audit contracts are callable.',
  },
  {
    key: 'phase5_document_privacy_contract',
    label: 'Buyer Phase 5 document privacy contract',
    scriptPath: 'scripts/buyer-side-phase5-document-privacy-verification.mjs',
    args: ['--skip-prerequisites'],
    coverage: 'Buyer FICA, finance, upload, review, download, access grants, storage-path privacy, and raw table denial contracts are callable.',
  },
]

const strictLiveEvidenceSteps = [
  {
    key: 'phase1_strict_live_transaction_evidence',
    label: 'Buyer Phase 1 strict live staging transaction evidence',
    scriptPath: 'scripts/buyer-side-phase1-live-staging-transaction-gate.mjs',
    args: ['--live', '--confirm-staging', '--require-live', '--skip-local-diagnostic'],
  },
  {
    key: 'phase2_strict_live_rls_evidence',
    label: 'Buyer Phase 2 strict live RLS evidence',
    scriptPath: 'scripts/buyer-side-phase2-rls-access-probes.mjs',
    args: ['--live', '--confirm-staging', '--require-live', '--skip-prerequisites'],
  },
  {
    key: 'phase3_strict_live_offer_token_evidence',
    label: 'Buyer Phase 3 strict live public-token browser evidence',
    scriptPath: 'scripts/buyer-side-phase3-offer-token-browser-smoke.mjs',
    args: ['--live', '--confirm-staging', '--require-browser', '--skip-prerequisites'],
  },
  {
    key: 'phase4_strict_live_delivery_evidence',
    label: 'Buyer Phase 4 strict live delivery evidence',
    scriptPath: 'scripts/buyer-side-phase4-token-delivery-invalid-handling.mjs',
    args: ['--live', '--confirm-staging', '--require-live', '--skip-prerequisites'],
  },
  {
    key: 'phase5_strict_live_document_privacy_evidence',
    label: 'Buyer Phase 5 strict live document privacy evidence',
    scriptPath: 'scripts/buyer-side-phase5-document-privacy-verification.mjs',
    args: ['--live', '--confirm-staging', '--require-live', '--skip-prerequisites'],
  },
]

const staticChecks = [
  {
    key: 'phase6_audit_doc',
    label: 'Buyer Phase 6 audit doc defines launch-candidate rollup and live evidence handling.',
    file: 'docs/audits/buyer-side-launch-hardening-phase6.md',
    patterns: [
      /# Buyer-Side Launch Hardening Phase 6/,
      /## Goal/,
      /## Commands/,
      /## Launch Candidate Coverage/,
      /## Strict Live Evidence/,
      /## Acceptance/,
      /## Current Result/,
      /Decision: PHASE 6 HARNESS IMPLEMENTED; STRICT LIVE EVIDENCE REQUIRED BEFORE FINAL SIGN-OFF/,
    ],
  },
  {
    key: 'phase_audit_docs_exist',
    label: 'Buyer launch hardening audit docs exist for Phase 0 through Phase 6 and the local diagnostic.',
    files: [
      'docs/audits/buyer-side-launch-hardening-phase0.md',
      'docs/audits/buyer-side-launch-hardening-phase1.md',
      'docs/audits/buyer-side-launch-hardening-phase2.md',
      'docs/audits/buyer-side-launch-hardening-phase3.md',
      'docs/audits/buyer-side-launch-hardening-phase4.md',
      'docs/audits/buyer-side-launch-hardening-phase5.md',
      'docs/audits/buyer-side-launch-hardening-phase6.md',
      'docs/audits/buyer-side-lead-registration-diagnostic.md',
    ],
  },
  {
    key: 'package_script',
    label: 'Package exposes the buyer Phase 6 launch-candidate command.',
    file: 'package.json',
    patterns: [
      /"verify:buyer-side-phase6-launch-candidate":\s*"node scripts\/buyer-side-phase6-launch-candidate-gate\.mjs"/,
      /"verify:buyer-side-phase5-document-privacy":\s*"node scripts\/buyer-side-phase5-document-privacy-verification\.mjs"/,
      /"verify:buyer-side-lead-registration-diagnostic":\s*"node scripts\/buyer-side-lead-registration-diagnostic-gate\.mjs"/,
    ],
  },
  {
    key: 'phase0_index_updated',
    label: 'Buyer Phase 0 scope lock lists Phase 6 aggregate local and strict-live commands.',
    file: 'docs/audits/buyer-side-launch-hardening-phase0.md',
    patterns: [
      /Phase 6 \| Buyer launch candidate gate/,
      /npm run verify:buyer-side-phase6-launch-candidate/,
      /node scripts\/buyer-side-phase6-launch-candidate-gate\.mjs --require-live-evidence/,
    ],
  },
  {
    key: 'phase8_index_updated',
    label: 'Phase 8 launch readiness links Buyer Phase 6 and its launch-candidate command.',
    file: 'docs/phase-8-launch-readiness.md',
    patterns: [
      /Buyer-side launch hardening Phase 6 launch-candidate gate: `docs\/audits\/buyer-side-launch-hardening-phase6\.md`/,
      /npm run verify:buyer-side-phase6-launch-candidate/,
      /node scripts\/buyer-side-phase6-launch-candidate-gate\.mjs --require-live-evidence/,
    ],
  },
  {
    key: 'phase6_script_rollup_locked',
    label: 'Phase 6 script rolls up the diagnostic plus Buyer Phases 1 through 5 and strict live evidence commands.',
    file: 'scripts/buyer-side-phase6-launch-candidate-gate.mjs',
    patterns: [
      /buyer-side-lead-registration-diagnostic-gate\.mjs/,
      /buyer-side-phase1-live-staging-transaction-gate\.mjs/,
      /buyer-side-phase2-rls-access-probes\.mjs/,
      /buyer-side-phase3-offer-token-browser-smoke\.mjs/,
      /buyer-side-phase4-token-delivery-invalid-handling\.mjs/,
      /buyer-side-phase5-document-privacy-verification\.mjs/,
      /--require-live-evidence/,
      /--confirm-staging/,
      /--skip-prerequisites/,
    ],
  },
  {
    key: 'phase5_handoff_result',
    label: 'Phase 5 document privacy handoff records local readiness and missing live fixture evidence.',
    file: 'docs/audits/buyer-side-launch-hardening-phase5.md',
    patterns: [
      /READY_LOCAL_CONTRACT/,
      /READY_STATIC_ONLY/,
      /strict live result: `BLOCKED`/,
      /BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH/,
      /LIVE DOCUMENT PRIVACY EVIDENCE REQUIRED/,
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
    requireLiveEvidence: false,
  }

  for (const arg of argv) {
    if (arg === '--static-only') options.staticOnly = true
    else if (arg === '--skip-phase-gates') options.skipPhaseGates = true
    else if (arg === '--require-live-evidence') options.requireLiveEvidence = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function createReport(options) {
  return {
    phase: '6',
    scope: 'buyer-side-launch-hardening',
    gate: 'launch-candidate-rollup',
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Buyer Phase 6 launch-candidate blockers are cleared',
      staticPassCount: 0,
      staticBlockedCount: 0,
      commandPassCount: 0,
      commandBlockedCount: 0,
      commandSkippedCount: 0,
      livePassCount: 0,
      liveBlockedCount: 0,
      livePendingCount: 0,
    },
    staticChecks: [],
    commands: [],
    liveEvidence: [],
    acceptance: [
      'Phase 0 scope and fixture contract is included in the aggregate launch-candidate command.',
      'Buyer local lead-to-registration diagnostic is included exactly once in the aggregate launch-candidate command.',
      'Buyer Phases 1 through 5 are included without recursively repeating prerequisite chains.',
      'Strict live evidence mode can run Phase 1 through Phase 5 live staging gates from one command.',
      'Local launch-candidate readiness is separated from final live staging sign-off evidence.',
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
      if (Array.isArray(check.files)) {
        for (const file of check.files) {
          if (!fs.existsSync(new URL(file, PROJECT_ROOT))) {
            result.status = 'BLOCKED'
            result.missingFiles.push(file)
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

function tailLines(value, count = 12) {
  return String(value || '').trim().split('\n').filter(Boolean).slice(-count).join('\n')
}

function parseChildReport(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function summarizeChildReport(childReport) {
  if (!childReport || typeof childReport !== 'object') return {}

  return {
    childStatus: childReport.summary?.status || null,
    childRecommendation: childReport.summary?.recommendation || null,
    childFindings: dedupeFindings(collectActionableFindings(childReport, [], [], 24)).slice(0, 12),
  }
}

function dedupeFindings(findings) {
  const seen = new Set()
  return findings.filter((finding) => {
    const signature = [
      finding.key,
      finding.status,
      finding.label,
      finding.detail,
      finding.missingFiles.join(','),
      finding.missingPatterns.join(','),
    ].join('|')
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

function collectActionableFindings(value, findings = [], path = [], limit = 12) {
  if (findings.length >= limit || !value || typeof value !== 'object') return findings

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectActionableFindings(item, findings, [...path, index], limit))
    return findings
  }

  const normalizedStatus = normalizeText(value.status).toUpperCase()
  const actionableStatuses = new Set(['BLOCKED', 'FAIL', 'FAILED', 'ERROR', 'CRITICAL', 'WARN', 'WARNING'])
  const hasActionableShape =
    value.key ||
    value.label ||
    value.detail ||
    value.error ||
    (Array.isArray(value.missingFiles) && value.missingFiles.length > 0) ||
    (Array.isArray(value.missingPatterns) && value.missingPatterns.length > 0)

  if (actionableStatuses.has(normalizedStatus) && hasActionableShape) {
    findings.push({
      path: path.join('.'),
      key: value.key || null,
      status: normalizedStatus,
      label: value.label || null,
      detail: value.detail || value.error || null,
      missingFiles: value.missingFiles || [],
      missingPatterns: value.missingPatterns || [],
    })
    if (findings.length >= limit) return findings
  }

  for (const [key, nested] of Object.entries(value)) {
    if (findings.length >= limit) break
    if (key === 'stdout' || key === 'stderr') continue
    collectActionableFindings(nested, findings, [...path, key], limit)
  }

  return findings
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

function commandText(scriptPath, args = []) {
  return `${NODE_BIN} ${[scriptPath, ...args].join(' ')}`
}

async function runLocalCandidateSteps(report, options) {
  if (options.staticOnly || options.skipPhaseGates) {
    for (const step of localCandidateSteps) {
      report.commands.push({
        key: step.key,
        label: step.label,
        command: commandText(step.scriptPath, step.args || []),
        coverage: step.coverage,
        status: 'SKIPPED',
      })
      report.summary.commandSkippedCount += 1
    }
    return
  }

  for (const step of localCandidateSteps) {
    const args = [step.scriptPath, ...(step.args || [])]
    const raw = await runCommand(NODE_BIN, args, {
      key: step.key,
      label: step.label,
      command: commandText(step.scriptPath, step.args || []),
      coverage: step.coverage,
    })
    const result = {
      ...raw,
      ...summarizeChildReport(parseChildReport(raw.stdout)),
      status: raw.exitCode === 0 && !raw.error ? 'PASS' : 'BLOCKED',
      stdout: tailLines(raw.stdout),
      stderr: tailLines(raw.stderr),
    }
    report.commands.push(result)
    if (result.status === 'PASS') report.summary.commandPassCount += 1
    else report.summary.commandBlockedCount += 1
  }
}

function addLiveEvidence(report, evidence) {
  report.liveEvidence.push(evidence)
  if (evidence.status === 'PASS') report.summary.livePassCount += 1
  if (evidence.status === 'BLOCKED') report.summary.liveBlockedCount += 1
  if (evidence.status === 'PENDING') report.summary.livePendingCount += 1
}

async function runStrictLiveEvidence(report, options) {
  if (!options.requireLiveEvidence) {
    for (const step of strictLiveEvidenceSteps) {
      addLiveEvidence(report, {
        key: step.key,
        label: step.label,
        command: commandText(step.scriptPath, step.args),
        status: 'PENDING',
        detail: 'Required before final staging sign-off; skipped in local launch-candidate mode.',
      })
    }
    return
  }

  for (const step of strictLiveEvidenceSteps) {
    const args = [step.scriptPath, ...step.args]
    const raw = await runCommand(NODE_BIN, args, {
      key: step.key,
      label: step.label,
      command: commandText(step.scriptPath, step.args),
    })
    addLiveEvidence(report, {
      ...raw,
      ...summarizeChildReport(parseChildReport(raw.stdout)),
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
    report.summary.liveBlockedCount > 0
  ) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Buyer Phase 6 launch-candidate blockers are cleared'
    return report
  }

  if (options.requireLiveEvidence) {
    report.summary.status = 'READY_LIVE_CANDIDATE'
    report.summary.recommendation = 'Buyer Phase 6 local launch candidate and strict live evidence passed'
    return report
  }

  if (options.staticOnly || report.summary.commandSkippedCount > 0) {
    report.summary.status = 'READY_STATIC_ONLY'
    report.summary.recommendation = 'Buyer Phase 6 static launch-candidate contracts passed; run without skip flags before local sign-off'
    return report
  }

  report.summary.status = 'READY_LOCAL_CANDIDATE'
  report.summary.recommendation = 'Buyer Phase 6 local launch candidate passed; strict live evidence remains pending before final sign-off'
  return report
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = createReport(options)

  runStaticChecks(report)
  await runLocalCandidateSteps(report, options)
  await runStrictLiveEvidence(report, options)
  finalizeReport(report, options)

  console.log(JSON.stringify(report, null, 2))

  if (!['READY_STATIC_ONLY', 'READY_LOCAL_CANDIDATE', 'READY_LIVE_CANDIDATE'].includes(report.summary.status)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
