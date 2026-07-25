#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const PROMOTION_PATH = path.join('docs', 'supabase-push-phase-5-production-promotion.json')
const PRODUCTION_EVIDENCE_DIR = path.join('docs', 'production-evidence')
const CLOSEOUT_EVIDENCE_PATH = path.join('docs', 'supabase-phase-8-closeout-evidence.json')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-phase-6-production-evidence.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-phase-6-production-evidence-report.md')

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

function expectedSqlApplied(row) {
  if (row.productionRoute === 'production_apply_sql') return true
  if (row.productionRoute === 'production_no_sql_record_after_smoke') return false
  return null
}

function defaultEvidence(row) {
  return {
    version: row.version,
    stream: row.stream,
    file: row.file,
    productionRoute: row.productionRoute,
    targetProjectRef: PRODUCTION_PROJECT_REF,
    sqlApplied: expectedSqlApplied(row),
    targetStateVerified: false,
    productionTargetStateVerified: false,
    productionLedgerRecorded: false,
    catalogChecks: 'pending',
    behaviorChecks: 'pending',
    rollbackOrNoResidue: 'pending',
    reviewedBy: '',
    capturedAt: null,
    promotionReady: row.readyForProduction === true,
    promotionBlockers: row.blockers || [],
    notes: [
      row.productionRoute === 'production_apply_sql'
        ? 'Complete after production SQL apply, target-state verification, and production ledger recording.'
        : row.productionRoute === 'production_no_sql_record_after_smoke'
          ? 'Complete after production smoke verification and production ledger recording. No production SQL should be applied.'
          : 'Upstream row is blocked; keep this pending until the route is replaced by an executable production path.',
    ],
  }
}

function writeEvidenceFile(repoRoot, row) {
  const relativePath = row.productionEvidenceFile || path.join(PRODUCTION_EVIDENCE_DIR, `${row.version}-${row.stream}.json`)
  const absolutePath = path.join(repoRoot, relativePath)
  if (existsSync(absolutePath)) return { relativePath, evidence: readJson(absolutePath), created: false }
  const evidence = defaultEvidence(row)
  writeFileSync(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`)
  return { relativePath, evidence, created: true }
}

function validateEvidence(row, evidence) {
  const blockers = []
  const expectedSql = expectedSqlApplied(row)
  if (String(row.productionRoute || '').startsWith('blocked_')) {
    blockers.push(`upstream_${row.productionRoute.replace(/^blocked_/, '')}`)
  }
  if (row.readyForProduction !== true) {
    blockers.push('production_promotion_not_ready')
    for (const blocker of row.blockers || []) blockers.push(`phase5_${blocker}`)
  }
  if (!evidence) blockers.push('production_evidence_missing')
  else {
    if (evidence.version !== row.version) blockers.push('version_mismatch')
    if (evidence.targetProjectRef !== PRODUCTION_PROJECT_REF) blockers.push('target_project_ref_mismatch')
    if (evidence.sqlApplied !== expectedSql) blockers.push('sql_applied_mismatch')
    if (evidence.targetStateVerified !== true) blockers.push('target_state_not_verified')
    if (evidence.productionTargetStateVerified !== true) blockers.push('production_target_state_not_verified')
    if (evidence.productionLedgerRecorded !== true) blockers.push('production_ledger_not_recorded')
    if (evidence.catalogChecks !== 'pass') blockers.push('catalog_checks_pending')
    if (evidence.behaviorChecks !== 'pass') blockers.push('behavior_checks_pending')
    if (evidence.rollbackOrNoResidue !== 'pass') blockers.push('rollback_or_no_residue_pending')
    if (!String(evidence.reviewedBy || '').trim()) blockers.push('reviewer_pending')
    if (!String(evidence.capturedAt || '').trim()) blockers.push('captured_at_pending')
  }
  return { complete: blockers.length === 0, blockers: [...new Set(blockers)] }
}

function closeoutRow(row, evidence) {
  return {
    version: row.version,
    stream: row.stream,
    file: row.file,
    stagingLedgerRecorded: true,
    productionTargetStateVerified: evidence.productionTargetStateVerified,
    productionLedgerRecorded: evidence.productionLedgerRecorded,
    catalogChecks: evidence.catalogChecks,
    behaviorChecks: evidence.behaviorChecks,
    rollbackOrNoResidue: evidence.rollbackOrNoResidue,
    reviewedBy: evidence.reviewedBy,
    productionEvidenceFile: row.productionEvidenceFile,
  }
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

function buildMarkdown(result) {
  const countRows = (counts) => Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => [`\`${key}\``, String(count)])
  const evidenceRows = result.rows.map((row) => [
    `\`${row.version}\``,
    `\`${row.stream}\``,
    `\`${row.productionRoute}\``,
    row.complete ? 'Complete' : 'Pending',
    row.created ? 'Created' : 'Existing',
    `\`${row.productionEvidenceFile}\``,
    row.blockers.length ? row.blockers.map((blocker) => `\`${blocker}\``).join('<br>') : 'None',
  ])

  return `# Supabase Push Phase 6 Production Evidence Report

Generated: ${result.generatedAt}

## Scope

Phase 6 records production evidence into the closeout evidence file only after production evidence is complete. It does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Production evidence rows | ${result.rows.length} |
| Evidence files created | ${result.createdCount} |
| Evidence files existing | ${result.existingCount} |
| Complete production evidence rows | ${result.completeCount} |
| Pending production evidence rows | ${result.pendingCount} |
| Closeout evidence rows recorded | ${result.closeoutRowsRecorded} |
| Phase 5 production-ready rows | ${result.productionReadyCount} |

## Routes

${markdownTable(['Production Route', 'Rows'], countRows(result.routeCounts))}

## Evidence Files

${markdownTable(['Version', 'Stream', 'Production Route', 'Status', 'File State', 'Evidence File', 'Blockers'], evidenceRows)}

## Completion Rule

Production evidence is complete only when Phase 5 marked the row ready for production, target state is verified, production ledger is recorded, catalog/behavior/rollback checks pass, and a reviewer plus capture timestamp are recorded. Only complete rows are copied into \`${CLOSEOUT_EVIDENCE_PATH}\`.
`
}

function main() {
  const repoRoot = findRepoRoot(process.cwd())
  const promotion = readJson(path.join(repoRoot, PROMOTION_PATH))
  if (!Array.isArray(promotion.rows)) throw new Error('Phase 5 production promotion rows are missing.')
  mkdirSync(path.join(repoRoot, PRODUCTION_EVIDENCE_DIR), { recursive: true })

  const rows = promotion.rows.map((row) => {
    const written = writeEvidenceFile(repoRoot, row)
    const validation = validateEvidence(row, written.evidence)
    return {
      version: row.version,
      stream: row.stream,
      file: row.file,
      productionRoute: row.productionRoute,
      readyForProduction: row.readyForProduction === true,
      productionEvidenceFile: written.relativePath,
      created: written.created,
      complete: validation.complete,
      blockers: validation.blockers,
      evidence: written.evidence,
    }
  })
  const completedRows = rows.filter((row) => row.complete)
  const closeoutEvidence = {
    productionProjectRef: PRODUCTION_PROJECT_REF,
    rows: completedRows.map((row) => closeoutRow(row, row.evidence)),
  }
  writeFileSync(path.join(repoRoot, CLOSEOUT_EVIDENCE_PATH), `${JSON.stringify(closeoutEvidence, null, 2)}\n`)

  const result = {
    generatedAt: new Date().toISOString(),
    productionProjectRef: PRODUCTION_PROJECT_REF,
    sourcePromotion: PROMOTION_PATH,
    productionEvidenceDir: PRODUCTION_EVIDENCE_DIR,
    rows: rows.map(({ evidence, ...row }) => row),
    routeCounts: countBy(rows, 'productionRoute'),
    productionReadyCount: rows.filter((row) => row.readyForProduction).length,
    createdCount: rows.filter((row) => row.created).length,
    existingCount: rows.filter((row) => !row.created).length,
    completeCount: completedRows.length,
    pendingCount: rows.length - completedRows.length,
    closeoutRowsRecorded: closeoutEvidence.rows.length,
  }

  writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
  console.log(`Wrote ${JSON_REPORT_PATH}`)
  console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
  console.log(`Updated ${CLOSEOUT_EVIDENCE_PATH}`)
}

try {
  main()
} catch (error) {
  console.error(`Supabase push phase 6 production evidence failed: ${error.message}`)
  process.exitCode = 1
}
