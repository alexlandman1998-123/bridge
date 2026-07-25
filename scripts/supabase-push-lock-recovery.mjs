#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const EVIDENCE_PATH = path.join('docs', 'supabase-production-recovery-evidence.json')
const JSON_REPORT_PATH = path.join('docs', 'supabase-production-recovery-lock.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-production-recovery-lock-report.md')
const TEST_PACKET_PATH = path.join('docs', 'supabase-production-recovery-test-packet.md')
const RECOVERY_METHODS = new Set(['pitr', 'physical_backup', 'equivalent_managed_backup'])

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const options = { verifyLive: true, json: false }
  for (const arg of argv) {
    if (arg === '--local-only' || arg === '--plan') options.verifyLive = false
    else if (arg === '--verify-live') options.verifyLive = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function defaultEvidence() {
  return {
    productionProjectRef: PRODUCTION_PROJECT_REF,
    recoveryMethod: 'physical_backup',
    pitrEnabled: false,
    physicalBackupCount: 0,
    equivalentManagedBackupAccepted: false,
    recoveryTested: false,
    testedAt: null,
    testedBy: '',
    acceptedBy: '',
    restoreTarget: '',
    evidenceUrlOrTicket: '',
    notes: [
      'Keep this pending until PITR is enabled or an equivalent backup restore has been tested and accepted.',
      'Do not commit credentials, database URLs, backup secrets, or exported production data in this file.',
    ],
  }
}

function ensureEvidence(repoRoot) {
  const absolutePath = path.join(repoRoot, EVIDENCE_PATH)
  if (existsSync(absolutePath)) return { created: false, evidence: readJson(absolutePath) }
  const evidence = defaultEvidence()
  writeFileSync(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`)
  return { created: true, evidence }
}

function parseJsonLoose(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try { return JSON.parse(trimmed) } catch {
    const offset = Math.min(...[trimmed.indexOf('{'), trimmed.indexOf('[')].filter((index) => index >= 0))
    if (!Number.isFinite(offset)) return null
    try { return JSON.parse(trimmed.slice(offset)) } catch { return null }
  }
}

function runSupabase(repoRoot, args) {
  const result = spawnSync('npx', ['--yes', 'supabase@latest', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  }
}

function liveRecoveryState(repoRoot) {
  const result = runSupabase(repoRoot, ['backups', 'list', '--project-ref', PRODUCTION_PROJECT_REF, '--output-format', 'json'])
  if (!result.ok) return { checked: true, ok: false, error: (result.stderr || result.error).trim() }
  const status = parseJsonLoose(result.stdout)
  if (!status) return { checked: true, ok: false, error: 'The production backup response was not valid JSON.' }
  const backups = Array.isArray(status.backups) ? status.backups : (Array.isArray(status) ? status : [])
  return {
    checked: true,
    ok: true,
    pitrEnabled: status.pitr_enabled === true,
    physicalBackupCount: backups.length,
    recoverable: status.pitr_enabled === true || backups.length > 0,
  }
}

function validateRecoveryEvidence(evidence, live) {
  const blockers = []
  if (!evidence || typeof evidence !== 'object') blockers.push('recovery_evidence_missing')
  else {
    if (evidence.productionProjectRef !== PRODUCTION_PROJECT_REF) blockers.push('production_project_ref_mismatch')
    if (!RECOVERY_METHODS.has(evidence.recoveryMethod)) blockers.push('recovery_method_invalid')
    if (evidence.pitrEnabled !== true && !(Number(evidence.physicalBackupCount) > 0) && evidence.equivalentManagedBackupAccepted !== true) {
      blockers.push('recoverable_backup_not_recorded')
    }
    if (evidence.recoveryTested !== true) blockers.push('recovery_test_not_recorded')
    if (!String(evidence.testedAt || '').trim()) blockers.push('tested_at_pending')
    if (!String(evidence.testedBy || '').trim()) blockers.push('tested_by_pending')
    if (!String(evidence.acceptedBy || '').trim()) blockers.push('accepted_by_pending')
    if (!String(evidence.restoreTarget || '').trim()) blockers.push('restore_target_pending')
    if (!String(evidence.evidenceUrlOrTicket || '').trim()) blockers.push('evidence_reference_pending')
    if (live?.ok) {
      if (evidence.pitrEnabled === true && live.pitrEnabled !== true) blockers.push('pitr_claim_not_live')
      if (Number(evidence.physicalBackupCount) > live.physicalBackupCount) blockers.push('physical_backup_count_exceeds_live')
      if (!live.recoverable && evidence.equivalentManagedBackupAccepted !== true) blockers.push('live_recovery_not_available')
    }
  }
  return { locked: blockers.length === 0, blockers }
}

function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function buildMarkdown(result) {
  return `# Supabase Production Recovery Lock Report

Generated: ${result.generatedAt}
Production project: \`${result.productionProjectRef}\`

## Decision

**Status: ${result.status}**

Production promotion remains blocked until this report says \`RECOVERY_LOCKED\`. This report does not enable PITR, restore data, apply SQL, repair ledgers, or modify production.

## Summary

${markdownTable(['Field', 'Value'], [
    ['Evidence file', `\`${EVIDENCE_PATH}\``],
    ['Evidence file state', result.evidenceCreated ? 'Created' : 'Existing'],
    ['Recovery method', `\`${result.evidence.recoveryMethod || 'missing'}\``],
    ['Recorded PITR enabled', result.evidence.pitrEnabled === true ? 'Yes' : 'No'],
    ['Recorded physical backups', String(result.evidence.physicalBackupCount ?? 0)],
    ['Recovery tested', result.evidence.recoveryTested === true ? 'Yes' : 'No'],
    ['Live check performed', result.live.checked ? 'Yes' : 'No'],
    ['Live PITR enabled', result.live.ok ? (result.live.pitrEnabled ? 'Yes' : 'No') : 'Not available'],
    ['Live physical backups', result.live.ok ? String(result.live.physicalBackupCount) : 'Not available'],
    ['Recovery locked', result.locked ? 'Yes' : 'No'],
  ])}

## Blockers

${result.blockers.length ? result.blockers.map((blocker) => `- \`${blocker}\``).join('\n') : '- None'}

## Evidence Rule

The lock requires a matching production project, a recorded recoverable mechanism, a completed restore/recovery test, a named tester, a named approver, a restore target, and a durable evidence reference. The evidence file must not contain secrets or exported production data.

## Recovery Test Packet

Complete \`${TEST_PACKET_PATH}\`, perform the restore test outside this repository, then update \`${EVIDENCE_PATH}\` with the non-secret test reference. This lock gate will remain blocked until that evidence is recorded.
`
}

function buildTestPacket(result) {
  const evidence = result.evidence || {}
  const restoreTarget = String(evidence.restoreTarget || '<temporary-restore-project-or-managed-restore-target>')
  const evidenceReference = String(evidence.evidenceUrlOrTicket || '<ticket-or-durable-evidence-url>')

  return `# Supabase Production Recovery Test Packet

Generated: ${result.generatedAt}
Production project: \`${PRODUCTION_PROJECT_REF}\`
Current lock status: \`${result.status}\`

## Purpose

Use this packet to complete the production recovery lock without storing secrets or exported production data in git. The restore test must prove that production can be recovered from the recorded mechanism before any production migration promotion runs.

## Current Recovery State

${markdownTable(['Field', 'Value'], [
    ['Recorded method', `\`${evidence.recoveryMethod || 'missing'}\``],
    ['Recorded PITR enabled', evidence.pitrEnabled === true ? 'Yes' : 'No'],
    ['Recorded physical backups', String(evidence.physicalBackupCount ?? 0)],
    ['Live check performed', result.live.checked ? 'Yes' : 'No'],
    ['Live PITR enabled', result.live.ok ? (result.live.pitrEnabled ? 'Yes' : 'No') : 'Not available'],
    ['Live physical backups', result.live.ok ? String(result.live.physicalBackupCount) : 'Not available'],
  ])}

## Required Restore Test

1. Restore production from a physical backup or equivalent managed backup into a temporary non-production target.
2. Confirm the restored database starts and can answer read-only smoke queries.
3. Confirm the restore target is isolated from production traffic.
4. Record the restore target name/ref, tester, approver, timestamp, and ticket/reference.
5. Do not copy database URLs, passwords, backup secrets, or exported production rows into this repository.

## Evidence To Record

After the restore test has genuinely passed, update \`${EVIDENCE_PATH}\` like this:

\`\`\`json
{
  "productionProjectRef": "${PRODUCTION_PROJECT_REF}",
  "recoveryMethod": "${evidence.recoveryMethod || 'physical_backup'}",
  "pitrEnabled": ${evidence.pitrEnabled === true},
  "physicalBackupCount": ${Number(evidence.physicalBackupCount) > 0 ? Number(evidence.physicalBackupCount) : Math.max(Number(result.live.physicalBackupCount) || 0, 1)},
  "equivalentManagedBackupAccepted": ${evidence.equivalentManagedBackupAccepted === true},
  "recoveryTested": true,
  "testedAt": "<ISO-8601 timestamp>",
  "testedBy": "<person or team>",
  "acceptedBy": "<release owner>",
  "restoreTarget": "${restoreTarget}",
  "evidenceUrlOrTicket": "${evidenceReference}",
  "notes": [
    "Restore test completed against an isolated non-production target. No secrets or exported production data are stored here."
  ]
}
\`\`\`

## Current Blockers

${result.blockers.length ? result.blockers.map((blocker) => `- \`${blocker}\``).join('\n') : '- None'}

## Final Check

Run:

\`\`\`bash
npm run supabase:push:lock-recovery
\`\`\`

The lock is complete only when the report says \`RECOVERY_LOCKED\`.
`
}

function buildResult(repoRoot, options) {
  const { created, evidence } = ensureEvidence(repoRoot)
  const live = options.verifyLive ? liveRecoveryState(repoRoot) : { checked: false, ok: false }
  const validation = validateRecoveryEvidence(evidence, live)
  return {
    generatedAt: new Date().toISOString(),
    status: validation.locked ? 'RECOVERY_LOCKED' : 'RECOVERY_LOCK_BLOCKED',
    locked: validation.locked,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    evidencePath: EVIDENCE_PATH,
    evidenceCreated: created,
    evidence,
    live,
    blockers: validation.blockers,
  }
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-push-lock-recovery.mjs [--verify-live] [--json]')
  console.log('  node scripts/supabase-push-lock-recovery.mjs --local-only [--json]')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) usage()
  else {
    const repoRoot = findRepoRoot(process.cwd())
    const result = buildResult(repoRoot, options)
    writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
    writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
    writeFileSync(path.join(repoRoot, TEST_PACKET_PATH), buildTestPacket(result))
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`${result.status}: recovery ${result.locked ? 'locked' : 'blocked'}.`)
  }
} catch (error) {
  console.error(`Supabase production recovery lock failed: ${error.message}`)
  process.exitCode = 1
}
