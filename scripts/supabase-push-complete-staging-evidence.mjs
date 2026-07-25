#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const ROUTING_PATH = path.join('docs', 'supabase-push-phase-3-action-routing.json')
const STAGING_EVIDENCE_DIR = path.join('docs', 'staging-evidence')
const COMPLETION_DIR = path.join('docs', 'staging-evidence-completion')
const JSON_REPORT_PATH = path.join('docs', 'supabase-push-staging-evidence-completion.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-staging-evidence-completion-report.md')
const PHASE1_RECEIPT_PATH = path.join('the-it-guy', 'config', 'legal-document-rollout-phase1-staging.json')
const PHASE1_LEGAL_MIGRATION_VERSIONS = new Set([
  '202607220002', '202607220003', '202607220004', '202607220005',
  '202607220006', '202607220007', '202607220008', '202607220009',
  '202607220010', '202607220011', '202607220012', '202607230004',
])
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

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

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function sha256Digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function receiptDigest(receipt) {
  const canonical = { ...(receipt && typeof receipt === 'object' ? receipt : {}) }
  delete canonical.manifestDigest
  return sha256Digest(JSON.stringify(stableValue(canonical)))
}

function stagingEnv() {
  const projectRef = String(process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
  const dbUrl = String(process.env.SUPABASE_STAGING_DB_URL || '').trim()
  const recovery = String(process.env.SUPABASE_STAGING_RECOVERY_CONFIRMED || '').trim()
  const blockers = []
  if (!projectRef) blockers.push('staging_project_ref_env_missing')
  else if (!/^[a-z0-9]{8,64}$/.test(projectRef)) blockers.push('staging_project_ref_invalid')
  if (!dbUrl) {
    blockers.push('staging_db_url_env_missing')
  } else if (projectRef) {
    try {
      const parsed = new URL(dbUrl)
      const expectedDirectHost = `db.${projectRef}.supabase.co`
      const host = parsed.hostname.toLowerCase()
      const isDirectHost = host === expectedDirectHost
      const isPoolerHost = host.endsWith('.pooler.supabase.com')
      const queryNames = [...parsed.searchParams.keys()]
      const sslModes = parsed.searchParams.getAll('sslmode')
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) blockers.push('staging_db_url_protocol_invalid')
      if (!isDirectHost && !isPoolerHost) blockers.push('staging_db_url_host_not_project_bound')
      if (isDirectHost && parsed.port && parsed.port !== '5432') blockers.push('staging_db_url_direct_port_invalid')
      if (isPoolerHost) {
        const usernameProjectRef = decodeURIComponent(parsed.username || '').split('.')[1]
        if (usernameProjectRef !== projectRef) blockers.push('staging_db_url_pooler_username_ref_mismatch')
        if (parsed.port && !['5432', '6543'].includes(parsed.port)) blockers.push('staging_db_url_pooler_port_invalid')
      }
      if (parsed.pathname !== '/postgres') blockers.push('staging_db_url_database_not_postgres')
      if (queryNames.length !== 1 || queryNames[0] !== 'sslmode' || sslModes.length !== 1) {
        blockers.push('staging_db_url_query_contract_invalid')
      } else if (!['require', 'verify-ca', 'verify-full'].includes(String(sslModes[0] || '').trim().toLowerCase())) {
        blockers.push('staging_db_url_sslmode_invalid')
      }
    } catch {
      blockers.push('staging_db_url_invalid')
    }
  }
  if (recovery !== 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP') blockers.push('staging_recovery_confirmation_missing')
  if (projectRef === PRODUCTION_PROJECT_REF) blockers.push('staging_project_ref_is_production')
  return {
    projectRef,
    dbUrlConfigured: Boolean(dbUrl),
    recoveryConfirmed: recovery === 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP',
    configured: blockers.length === 0,
    blockers,
  }
}

function phase1Receipt(repoRoot) {
  const absolutePath = path.join(repoRoot, PHASE1_RECEIPT_PATH)
  if (!existsSync(absolutePath)) return { available: false, blockers: ['phase1_receipt_missing'] }
  const receipt = readJson(absolutePath)
  const computedDigest = receiptDigest(receipt)
  const blockers = []
  if (receipt.manifestDigest !== computedDigest || !SHA256_DIGEST_PATTERN.test(String(receipt.manifestDigest || ''))) {
    blockers.push('phase1_receipt_digest_not_bound')
  }
  if (receipt.phase !== 'ROLL_OUT_1') blockers.push('phase1_receipt_phase_invalid')
  if (receipt.contract !== 'legal-document-staging-release-v2') blockers.push('phase1_receipt_contract_invalid')
  if (receipt.status !== 'pending_staging') blockers.push('phase1_receipt_status_invalid')
  if (!receipt.environment?.stagingProjectRef) blockers.push('phase1_receipt_staging_project_ref_missing')
  if (!receipt.environment?.productionProjectRef) blockers.push('phase1_receipt_production_project_ref_missing')
  if (!Array.isArray(receipt.artifacts?.migrations) || receipt.artifacts.migrations.length === 0) {
    blockers.push('phase1_receipt_migrations_missing')
  }
  return {
    available: true,
    path: PHASE1_RECEIPT_PATH,
    manifestDigest: receipt.manifestDigest || null,
    computedDigest,
    ready: blockers.length === 0,
    blockers,
  }
}

function expectedSqlApplied(row) {
  if (row.route === 'apply_original') return true
  if (row.route === 'repair_only') return false
  return null
}

function evidencePath(row) {
  return row.evidenceFile || path.join(STAGING_EVIDENCE_DIR, `${row.version}-${row.stream}.json`)
}

function completionPath(row) {
  return path.join(COMPLETION_DIR, `${row.version}-${row.stream}.md`)
}

function evidenceStatus(row, evidence, env, receipt) {
  const blockers = []
  const expectedSql = expectedSqlApplied(row)
  if (!evidence) blockers.push('staging_evidence_missing')
  else {
    if (evidence.version !== row.version) blockers.push('version_mismatch')
    if (evidence.targetProjectRef !== evidence.stagingProjectRef) blockers.push('staging_target_ref_mismatch')
    if (!String(evidence.stagingProjectRef || '').trim() || evidence.stagingProjectRef === 'TODO_STAGING_PROJECT_REF') blockers.push('staging_project_ref_pending')
    if (evidence.stagingProjectRef === PRODUCTION_PROJECT_REF) blockers.push('staging_project_ref_is_production')
    if (env.projectRef && evidence.stagingProjectRef !== env.projectRef) blockers.push('staging_project_ref_not_env_target')
    if (evidence.sqlApplied !== expectedSql) blockers.push('sql_applied_mismatch')
    if (evidence.stagingLedgerRecorded !== true) blockers.push('staging_ledger_not_recorded')
    if (evidence.catalogChecks !== 'pass') blockers.push('catalog_checks_pending')
    if (evidence.behaviorChecks !== 'pass') blockers.push('behavior_checks_pending')
    if (evidence.rollbackOrNoResidue !== 'pass') blockers.push('rollback_or_no_residue_pending')
    if (!String(evidence.reviewedBy || '').trim()) blockers.push('reviewer_pending')
    if (!String(evidence.approvedBy || '').trim()) blockers.push('approver_pending')
    if (!String(evidence.capturedAt || '').trim()) blockers.push('captured_at_pending')
    if (PHASE1_LEGAL_MIGRATION_VERSIONS.has(row.version)) {
      if (!receipt.ready) blockers.push('phase1_receipt_not_ready')
      if (evidence.phase1ReceiptManifestDigest !== receipt.manifestDigest) blockers.push('phase1_receipt_digest_missing')
      if (!SHA256_DIGEST_PATTERN.test(String(evidence.migrationSha256 || ''))) blockers.push('migration_sha256_pending')
      if (!SHA256_DIGEST_PATTERN.test(String(evidence.predecessorLedgerEvidenceDigest || ''))) blockers.push('predecessor_ledger_evidence_digest_pending')
      if (!SHA256_DIGEST_PATTERN.test(String(evidence.ledgerEvidenceDigest || ''))) blockers.push('ledger_evidence_digest_pending')
      if (evidence.predecessorLedgerEvidenceDigest && evidence.predecessorLedgerEvidenceDigest === evidence.ledgerEvidenceDigest) {
        blockers.push('ledger_evidence_digest_not_distinct')
      }
    }
  }
  return { complete: blockers.length === 0, blockers }
}

function phase1Args(row, receipt) {
  if (!PHASE1_LEGAL_MIGRATION_VERSIONS.has(row.version)) return ''
  if (!receipt.ready) return ' # blocked: Phase 1 receipt is not bound'
  return ` --phase1-receipt ${PHASE1_RECEIPT_PATH} --phase1-receipt-digest ${receipt.manifestDigest}`
}

function commands(row, receipt) {
  const args = phase1Args(row, receipt)
  const evidence = evidencePath(row)
  if (row.route === 'apply_original') {
    return [
      `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version ${row.version} --confirm APPLY_TO_STAGING_ONLY${args}`,
      `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version ${row.version} --evidence ${evidence} --confirm APPLY_TO_STAGING_ONLY${args}`,
    ]
  }
  return [
    `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version ${row.version} --evidence ${evidence} --confirm APPLY_TO_STAGING_ONLY${args}`,
  ]
}

function packetMarkdown(row) {
  return `# Staging Evidence Completion Packet

Version: \`${row.version}\`
Stream: \`${row.stream}\`
Route: \`${row.route}\`
File: \`${row.file}\`
Evidence: \`${row.evidenceFile}\`
Status: ${row.complete ? 'Complete' : 'Pending'}

## Commands

${row.commands.map((command) => `\`\`\`bash\n${command}\n\`\`\``).join('\n\n')}

## Required Evidence

- Real staging project ref in \`targetProjectRef\` and \`stagingProjectRef\`
- \`sqlApplied: ${row.expectedSqlApplied}\`
- \`stagingLedgerRecorded: true\`
- \`catalogChecks: "pass"\`
- \`behaviorChecks: "pass"\`
- \`rollbackOrNoResidue: "pass"\`
- \`reviewedBy\`, \`approvedBy\`, and \`capturedAt\`
${row.phase1ReceiptRequired ? '- Phase 1 receipt digest, migration hash, predecessor ledger digest, and final ledger digest' : ''}

## Blockers

${row.blockers.length ? row.blockers.map((blocker) => `- \`${blocker}\``).join('\n') : '- None'}
`
}

function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function countBy(rows, getter) {
  const counts = new Map()
  for (const row of rows) {
    const values = getter(row)
    for (const value of Array.isArray(values) ? values : [values]) {
      if (!value) continue
      counts.set(value, (counts.get(value) || 0) + 1)
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function buildMarkdown(result) {
  const blockerRows = Object.entries(result.blockerCounts).map(([blocker, count]) => [`\`${blocker}\``, String(count)])
  const routeRows = Object.entries(result.routeCounts).map(([route, count]) => [`\`${route}\``, String(count)])
  return `# Supabase Push Staging Evidence Completion Report

Generated: ${result.generatedAt}

## Scope

This gate validates completion readiness for the current runner-eligible staging rows. It does not apply SQL, record staging ledgers, relink Supabase, or invent evidence.

## Summary

${markdownTable(['Field', 'Value'], [
    ['Runner-eligible rows', String(result.rows.length)],
    ['Complete staging evidence rows', String(result.completeCount)],
    ['Pending staging evidence rows', String(result.pendingCount)],
    ['Staging environment configured', result.stagingEnv.configured ? 'Yes' : 'No'],
    ['Phase 1 receipt ready', result.phase1Receipt.ready ? 'Yes' : 'No'],
  ])}

## Route Summary

${markdownTable(['Route', 'Rows'], routeRows)}

## Blocker Counts

${blockerRows.length ? markdownTable(['Blocker', 'Rows'], blockerRows) : 'No blockers.'}

## Work Queue

${markdownTable(
    ['Version', 'Stream', 'Route', 'Status', 'Evidence', 'Blockers'],
    result.rows.map((row) => [
      `\`${row.version}\``,
      `\`${row.stream}\``,
      `\`${row.route}\``,
      row.complete ? 'Complete' : 'Pending',
      `\`${row.evidenceFile}\``,
      row.blockers.length ? row.blockers.map((blocker) => `\`${blocker}\``).join('<br>') : 'None',
    ]),
  )}

## Environment Blockers

${result.stagingEnv.blockers.length ? result.stagingEnv.blockers.map((blocker) => `- \`${blocker}\``).join('\n') : '- None'}

## Phase 1 Receipt Blockers

${result.phase1Receipt.blockers.length ? result.phase1Receipt.blockers.map((blocker) => `- \`${blocker}\``).join('\n') : '- None'}
`
}

function buildResult(repoRoot) {
  const routing = readJson(path.join(repoRoot, ROUTING_PATH))
  const env = stagingEnv()
  const receipt = phase1Receipt(repoRoot)
  mkdirSync(path.join(repoRoot, COMPLETION_DIR), { recursive: true })
  const rows = routing.rows.filter((row) => !row.blocked).map((row) => {
    const relativeEvidencePath = evidencePath(row)
    const absoluteEvidencePath = path.join(repoRoot, relativeEvidencePath)
    const evidence = existsSync(absoluteEvidencePath) ? readJson(absoluteEvidencePath) : null
    const status = evidenceStatus(row, evidence, env, receipt)
    const blockers = [...new Set([...env.blockers, ...status.blockers])]
    const item = {
      version: row.version,
      stream: row.stream,
      route: row.route,
      action: row.action,
      file: row.file,
      evidenceFile: relativeEvidencePath,
      completionFile: completionPath(row),
      expectedSqlApplied: expectedSqlApplied(row),
      phase1ReceiptRequired: PHASE1_LEGAL_MIGRATION_VERSIONS.has(row.version),
      complete: blockers.length === 0,
      blockers,
      commands: commands(row, receipt),
    }
    writeFileSync(path.join(repoRoot, item.completionFile), packetMarkdown(item))
    return item
  })
  return {
    generatedAt: new Date().toISOString(),
    sourceRouting: ROUTING_PATH,
    stagingEnv: env,
    phase1Receipt: receipt,
    rows,
    routeCounts: countBy(rows, (row) => row.route),
    blockerCounts: countBy(rows, (row) => row.blockers),
    completeCount: rows.filter((row) => row.complete).length,
    pendingCount: rows.filter((row) => !row.complete).length,
  }
}

try {
  const repoRoot = findRepoRoot(process.cwd())
  const result = buildResult(repoRoot)
  writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
  console.log(`STAGING_EVIDENCE_COMPLETION_${result.completeCount === result.rows.length ? 'READY' : 'BLOCKED'}: ${result.completeCount}/${result.rows.length} complete.`)
} catch (error) {
  console.error(`Supabase staging evidence completion failed: ${error.message}`)
  process.exitCode = 1
}
