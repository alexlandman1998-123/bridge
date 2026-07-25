#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const ACTION_ROUTING_PATH = path.join('docs', 'supabase-push-phase-3-action-routing.json')
const RECOVERY_EVIDENCE_PATH = path.join('docs', 'supabase-production-recovery-evidence.json')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-phase-5-production-promotion.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-phase-5-production-promotion-report.md')
const RECOVERY_METHODS = new Set(['pitr', 'physical_backup', 'equivalent_managed_backup'])

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function validateRecoveryEvidence(evidence) {
  const blockers = []
  if (!evidence || typeof evidence !== 'object') blockers.push('production_recovery_evidence_missing')
  else {
    if (evidence.productionProjectRef !== PRODUCTION_PROJECT_REF) blockers.push('production_recovery_project_ref_mismatch')
    if (!RECOVERY_METHODS.has(evidence.recoveryMethod)) blockers.push('production_recovery_method_invalid')
    if (evidence.pitrEnabled !== true && !(Number(evidence.physicalBackupCount) > 0) && evidence.equivalentManagedBackupAccepted !== true) {
      blockers.push('production_recovery_mechanism_pending')
    }
    if (evidence.recoveryTested !== true) blockers.push('production_recovery_test_pending')
    if (!String(evidence.testedAt || '').trim()) blockers.push('production_recovery_tested_at_pending')
    if (!String(evidence.testedBy || '').trim()) blockers.push('production_recovery_tester_pending')
    if (!String(evidence.acceptedBy || '').trim()) blockers.push('production_recovery_approver_pending')
    if (!String(evidence.restoreTarget || '').trim()) blockers.push('production_recovery_restore_target_pending')
    if (!String(evidence.evidenceUrlOrTicket || '').trim()) blockers.push('production_recovery_reference_pending')
  }
  return { locked: blockers.length === 0, blockers }
}

function evidencePath(row) {
  return row.evidenceFile || path.join('docs', 'staging-evidence', `${row.version}-${row.stream}.json`)
}

function productionEvidencePath(row) {
  return path.join('docs', 'production-evidence', `${row.version}-${row.stream}.json`)
}

function validateStagingEvidence(row, evidence) {
  const blockers = []
  const stagingProjectRef = String(evidence?.stagingProjectRef || '').trim()
  if (!evidence) blockers.push('staging_evidence_missing')
  else {
    if (evidence.version !== row.version) blockers.push('version_mismatch')
    if (!stagingProjectRef || stagingProjectRef === 'TODO_STAGING_PROJECT_REF') blockers.push('staging_project_ref_pending')
    if (stagingProjectRef === PRODUCTION_PROJECT_REF) blockers.push('staging_project_ref_is_production')
    if (evidence.stagingLedgerRecorded !== true) blockers.push('staging_ledger_not_recorded')
    if (evidence.catalogChecks !== 'pass') blockers.push('catalog_checks_pending')
    if (evidence.behaviorChecks !== 'pass') blockers.push('behavior_checks_pending')
    if (evidence.rollbackOrNoResidue !== 'pass') blockers.push('rollback_or_no_residue_pending')
    if (!String(evidence.approvedBy || '').trim()) blockers.push('approver_pending')
  }
  return {
    complete: blockers.length === 0,
    blockers,
    stagingProjectRef,
  }
}

function productionRoute(row) {
  if (row.route === 'apply_original') return 'production_apply_sql'
  if (row.route === 'repair_only') return 'production_no_sql_record_after_smoke'
  if (row.route === 'corrective_required') return 'blocked_corrective_required'
  if (row.route === 'manual_review') return 'blocked_manual_review'
  return 'blocked_unknown_route'
}

function productionCommands(row, ready) {
  if (!ready) return []
  const stagingEvidence = evidencePath(row)
  if (row.route === 'apply_original') {
    return [
      `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version ${row.version} --staging-evidence ${stagingEvidence} --confirm APPLY_TO_PRODUCTION`,
      `node scripts/supabase-phase7-production-execution.mjs --record-applied --version ${row.version} --staging-evidence ${stagingEvidence} --production-evidence ${productionEvidencePath(row)} --confirm APPLY_TO_PRODUCTION`,
    ]
  }
  if (row.route === 'repair_only') {
    return [
      `node scripts/supabase-phase7-production-execution.mjs --record-applied --version ${row.version} --staging-evidence ${stagingEvidence} --production-evidence ${productionEvidencePath(row)} --confirm APPLY_TO_PRODUCTION`,
    ]
  }
  return []
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || 'unknown'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function buildReport(result) {
  const countRows = (counts) => Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => [`\`${key}\``, String(count)])
  const workRows = result.rows.map((row) => [
    `\`${row.version}\``,
    `\`${row.stream}\``,
    `\`${row.productionRoute}\``,
    row.readyForProduction ? 'Yes' : 'No',
    `\`${row.stagingEvidenceFile}\``,
    row.blockers.length ? row.blockers.map((blocker) => `\`${blocker}\``).join('<br>') : 'None',
  ])
  const commandRows = result.rows
    .filter((row) => row.commands.length)
    .map((row) => [
      `\`${row.version}\``,
      row.commands.map((command) => `\`${command.replaceAll('|', '\\|')}\``).join('<br>'),
    ])

  return `# Supabase Push Phase 5 Production Promotion Report

Generated: ${result.generatedAt}

## Scope

Phase 5 promotes runner-eligible rows to production only after reviewed staging evidence exists. This command is a planning gate: it does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows considered | ${result.rows.length} |
| Ready for production | ${result.readyCount} |
| Blocked | ${result.blockedCount} |
| Production env configured | ${result.productionEnvConfigured ? 'Yes' : 'No'} |
| Production recovery locked | ${result.recoveryLock.locked ? 'Yes' : 'No'} |

## Routes

${markdownTable(['Production Route', 'Rows'], countRows(result.routeCounts))}

## Work Queue

${markdownTable(['Version', 'Stream', 'Production Route', 'Ready', 'Staging Evidence', 'Blockers'], workRows)}

## Commands

${commandRows.length ? markdownTable(['Version', 'Command'], commandRows) : 'No production commands are enabled yet because no rows have complete staging evidence.'}

## Required Environment Before Promotion

\`\`\`bash
export SUPABASE_PRODUCTION_PROJECT_REF='${PRODUCTION_PROJECT_REF}'
export SUPABASE_PRODUCTION_DB_URL='<production-direct-db-url>'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
\`\`\`

Run \`npm run supabase:push:lock-recovery\` and complete \`${RECOVERY_EVIDENCE_PATH}\` before production promotion. Do not run broad \`supabase db push\`. Use \`scripts/supabase-phase7-production-execution.mjs\` one version at a time.
`
}

function main() {
  const repoRoot = findRepoRoot(process.cwd())
  const routing = readJson(path.join(repoRoot, ACTION_ROUTING_PATH))
  if (!Array.isArray(routing.rows)) throw new Error('Phase 3 action routing rows are missing.')
  const recoveryEvidencePath = path.join(repoRoot, RECOVERY_EVIDENCE_PATH)
  const recoveryLock = validateRecoveryEvidence(existsSync(recoveryEvidencePath) ? readJson(recoveryEvidencePath) : null)

  const rows = routing.rows.map((row) => {
    const stagingEvidenceFile = evidencePath(row)
    const absoluteEvidencePath = path.join(repoRoot, stagingEvidenceFile)
    const evidence = existsSync(absoluteEvidencePath) ? readJson(absoluteEvidencePath) : null
    const validation = row.blocked
      ? { complete: false, blockers: [`upstream_${row.route}`], stagingProjectRef: '' }
      : validateStagingEvidence(row, evidence)
    const productionRouteName = productionRoute(row)
    const readyForProduction = validation.complete && !row.blocked && recoveryLock.locked
    const blockers = [
      ...validation.blockers,
      ...(recoveryLock.locked || row.blocked ? [] : ['production_recovery_not_locked']),
    ]
    return {
      version: row.version,
      stream: row.stream,
      file: row.file,
      action: row.action,
      route: row.route,
      productionRoute: productionRouteName,
      stagingEvidenceFile,
      productionEvidenceFile: productionEvidencePath(row),
      readyForProduction,
      blockers,
      commands: productionCommands(row, readyForProduction),
    }
  })

  const result = {
    generatedAt: new Date().toISOString(),
    productionProjectRef: PRODUCTION_PROJECT_REF,
    productionEnvConfigured: Boolean(
      process.env.SUPABASE_PRODUCTION_PROJECT_REF === PRODUCTION_PROJECT_REF
      && String(process.env.SUPABASE_PRODUCTION_DB_URL || '').trim()
      && process.env.SUPABASE_PRODUCTION_RECOVERY_CONFIRMED === 'I_HAVE_TESTED_PRODUCTION_RECOVERY',
    ),
    recoveryLock: {
      evidencePath: RECOVERY_EVIDENCE_PATH,
      locked: recoveryLock.locked,
      blockers: recoveryLock.blockers,
    },
    rows,
    routeCounts: countBy(rows, 'productionRoute'),
    readyCount: rows.filter((row) => row.readyForProduction).length,
    blockedCount: rows.filter((row) => !row.readyForProduction).length,
  }

  writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildReport(result))
  console.log(`Wrote ${JSON_REPORT_PATH}`)
  console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
}

try {
  main()
} catch (error) {
  console.error(`Supabase push phase 5 production promotion failed: ${error.message}`)
  process.exitCode = 1
}
