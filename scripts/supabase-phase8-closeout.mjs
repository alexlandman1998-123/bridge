#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const MANIFEST_PATH = path.join('docs', 'supabase-phase-5-application-manifest.json')
const PROMOTION_PATH = path.join('docs', 'supabase-push-phase-5-production-promotion.json')
const EVIDENCE_PATH = path.join('docs', 'supabase-phase-8-closeout-evidence.json')
const RECOVERY_EVIDENCE_PATH = path.join('docs', 'supabase-production-recovery-evidence.json')
const LEDGER_DRIFT_RESOLUTION_PATH = path.join('docs', 'supabase-ledger-drift-resolution.json')
const CLEARANCE_DIR = path.join('docs', 'non-runnable-clearance')
const REPORT_PATH = path.join('docs', 'supabase-phase-8-closeout-report.md')
const RECOVERY_METHODS = new Set(['pitr', 'physical_backup', 'equivalent_managed_backup'])
const REVIEWED_SPLIT_BASELINE = new Set([
  '202606010001', '202606030007', '202606030008', '202606030009', '202606030010',
  '202606030011', '202606040001', '202606040002', '202606040004', '202606040005',
  '202606050001', '202606080002', '202606090010', '202606110004', '202606110005',
  '202606110006', '202606110007',
])

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const options = { verifyLive: false, write: false, json: false }
  for (const arg of argv) {
    if (arg === '--plan' || arg === '--local') options.verifyLive = false
    else if (arg === '--verify-live') options.verifyLive = true
    else if (arg === '--write') options.write = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function parseJsonLoose(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try { return JSON.parse(trimmed) } catch {
    const offsets = [trimmed.indexOf('['), trimmed.indexOf('{')].filter((offset) => offset >= 0).sort((a, b) => a - b)
    if (!offsets.length) return null
    try { return JSON.parse(trimmed.slice(offsets[0])) } catch { return null }
  }
}

function collectArrays(value, predicate, matches = []) {
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === 'object' && predicate(item))) matches.push(value)
    for (const item of value) collectArrays(item, predicate, matches)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectArrays(item, predicate, matches)
  }
  return matches
}

function field(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  }
  const keys = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]))
  for (const name of names) {
    const key = keys.get(name.toLowerCase())
    if (key) return row[key]
  }
  return undefined
}

function version(value) {
  return String(value || '').match(/\b\d{12,14}\b/)?.[0] || ''
}

function parseMigrationRows(stdout) {
  const parsed = parseJsonLoose(stdout)
  const rows = collectArrays(parsed, (item) => {
    return ['local', 'remote', 'local_version', 'remote_version', 'version'].some((key) => {
      return Object.prototype.hasOwnProperty.call(item, key)
    })
  }).sort((a, b) => b.length - a.length)[0] || []
  return rows.map((row) => ({
    local: version(field(row, ['local', 'local_version', 'localVersion', 'LOCAL'])),
    remote: version(field(row, ['remote', 'remote_version', 'remoteVersion', 'REMOTE'])),
  })).filter((row) => row.local || row.remote)
}

function ledgerBuckets(rows, reviewedSplitVersions = REVIEWED_SPLIT_BASELINE) {
  const matched = []
  const localOnly = []
  const remoteOnly = []
  const divergent = []
  for (const row of rows) {
    if (row.local && row.remote && row.local === row.remote) matched.push(row)
    else if (row.local && row.remote) divergent.push(row)
    else if (row.local) localOnly.push(row)
    else if (row.remote) remoteOnly.push(row)
  }
  const localVersions = new Set(localOnly.map((row) => row.local))
  const remoteVersions = new Set(remoteOnly.map((row) => row.remote))
  const splitVersions = [...localVersions].filter((item) => remoteVersions.has(item)).sort()
  const splitSet = new Set(splitVersions)
  return {
    matched,
    divergent,
    splitVersions,
    unreviewedSplitVersions: splitVersions.filter((item) => !reviewedSplitVersions.has(item)),
    pureLocalOnly: localOnly.filter((row) => !splitSet.has(row.local)),
    pureRemoteOnly: remoteOnly.filter((row) => !splitSet.has(row.remote)),
  }
}

function closeoutLedgerBuckets(rows, reviewedSplitVersions, supersededOriginalVersions = []) {
  const buckets = ledgerBuckets(rows, reviewedSplitVersions)
  const superseded = new Set(supersededOriginalVersions)
  return {
    ...buckets,
    supersededPureLocalOnly: buckets.pureLocalOnly.filter((row) => superseded.has(row.local)),
    pureLocalOnly: buckets.pureLocalOnly.filter((row) => !superseded.has(row.local)),
  }
}

function localMigrations(repoRoot) {
  return readdirSync(path.join(repoRoot, 'supabase', 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, version: file.split('_')[0] }))
}

function approvedCorrectiveClearances(repoRoot) {
  const absoluteDir = path.join(repoRoot, CLEARANCE_DIR)
  if (!existsSync(absoluteDir)) return []
  return readdirSync(absoluteDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        const clearance = JSON.parse(readFileSync(path.join(absoluteDir, file), 'utf8'))
        const approved = String(clearance.approvedBy || '').trim() && String(clearance.approvedAt || '').trim()
        const blockers = Array.isArray(clearance.blockers) ? clearance.blockers : []
        if (clearance.clearanceDecision !== 'apply_corrective_after_dependency_check' || !approved || blockers.length > 0) return null
        const correctiveMigrationFile = String(clearance.correctiveMigrationFile || '').trim()
        const correctiveVersion = String(clearance.correctiveVersion || path.basename(correctiveMigrationFile).match(/^(\d{12,})_/)?.[1] || '').trim()
        const originalVersion = String(clearance.version || '').trim()
        if (!originalVersion || !correctiveVersion) return null
        return {
          originalVersion,
          correctiveVersion,
          clearanceFile: path.join(CLEARANCE_DIR, file),
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function executableCloseoutScope(repoRoot, manifest) {
  const absolutePromotionPath = path.join(repoRoot, PROMOTION_PATH)
  if (!existsSync(absolutePromotionPath)) {
    return {
      source: MANIFEST_PATH,
      rows: manifest.rows,
      supersededOriginalVersions: [],
      correctiveMappings: [],
    }
  }
  const promotion = JSON.parse(readFileSync(absolutePromotionPath, 'utf8'))
  const rows = Array.isArray(promotion.rows) ? promotion.rows : []
  const correctiveMappings = approvedCorrectiveClearances(repoRoot)
    .filter((item) => rows.some((row) => row.version === item.correctiveVersion))
  return {
    source: PROMOTION_PATH,
    rows,
    supersededOriginalVersions: correctiveMappings.map((item) => item.originalVersion),
    correctiveMappings,
  }
}

function duplicateVersions(migrations) {
  const grouped = new Map()
  for (const migration of migrations) grouped.set(migration.version, [...(grouped.get(migration.version) || []), migration.file])
  return [...grouped.entries()].filter(([, files]) => files.length > 1).map(([itemVersion, files]) => ({ version: itemVersion, files }))
}

function validateEvidence(manifest, evidence) {
  const rows = Array.isArray(evidence.rows) ? evidence.rows : []
  const counts = new Map()
  for (const row of rows) {
    const itemVersion = String(row.version || '')
    counts.set(itemVersion, (counts.get(itemVersion) || 0) + 1)
  }
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([itemVersion]) => itemVersion)
  const byVersion = new Map(rows.map((row) => [String(row.version || ''), row]))
  const complete = []
  const incomplete = []
  for (const manifestRow of manifest.rows) {
    const row = byVersion.get(manifestRow.version)
    const valid = row
      && row.stagingLedgerRecorded === true
      && row.productionTargetStateVerified === true
      && row.productionLedgerRecorded === true
      && row.catalogChecks === 'pass'
      && row.behaviorChecks === 'pass'
      && row.rollbackOrNoResidue === 'pass'
      && String(row.reviewedBy || '').trim()
    ;(valid ? complete : incomplete).push(manifestRow.version)
  }
  const unknown = rows.map((row) => String(row.version || '')).filter((item) => !manifest.rows.some((row) => row.version === item))
  return { complete, incomplete, unknown, duplicates }
}

function validateRecoveryEvidence(repoRoot) {
  const absolutePath = path.join(repoRoot, RECOVERY_EVIDENCE_PATH)
  const blockers = []
  if (!existsSync(absolutePath)) {
    return { locked: false, blockers: ['production_recovery_evidence_missing'], evidence: null }
  }
  const evidence = JSON.parse(readFileSync(absolutePath, 'utf8'))
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
  return { locked: blockers.length === 0, blockers, evidence }
}

function ledgerDriftResolution(repoRoot) {
  const absolutePath = path.join(repoRoot, LEDGER_DRIFT_RESOLUTION_PATH)
  if (!existsSync(absolutePath)) {
    return {
      path: LEDGER_DRIFT_RESOLUTION_PATH,
      loaded: false,
      status: 'LEDGER_DRIFT_RESOLUTION_MISSING',
      reviewedSplitVersions: [...REVIEWED_SPLIT_BASELINE].sort(),
      blockers: ['ledger_drift_resolution_missing'],
    }
  }
  const resolution = JSON.parse(readFileSync(absolutePath, 'utf8'))
  const reviewedSplitVersions = Array.isArray(resolution.reviewedSplitVersions)
    ? resolution.reviewedSplitVersions.map(String)
    : []
  return {
    path: LEDGER_DRIFT_RESOLUTION_PATH,
    loaded: true,
    status: resolution.status || 'UNKNOWN',
    reviewedSplitVersions,
    blockers: Array.isArray(resolution.blockers) ? resolution.blockers : [],
    counts: resolution.counts || null,
  }
}

function runSupabase(repoRoot, args) {
  const result = spawnSync('npx', ['--yes', 'supabase@latest', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  return { ok: result.status === 0 && !result.error, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error?.message || '' }
}

function liveState(repoRoot, driftResolution, closeoutScope) {
  const linkedRefPath = path.join(repoRoot, 'supabase', '.temp', 'project-ref')
  const linkedRef = existsSync(linkedRefPath) ? readFileSync(linkedRefPath, 'utf8').trim() : ''
  if (linkedRef !== PRODUCTION_PROJECT_REF) {
    throw new Error(`The linked Supabase project must equal ${PRODUCTION_PROJECT_REF}; found ${linkedRef || 'none'}.`)
  }
  const migrationList = runSupabase(repoRoot, ['migration', 'list', '--linked', '--output-format', 'json'])
  if (!migrationList.ok) throw new Error(`Could not read the linked migration ledger: ${migrationList.stderr || migrationList.error}`)
  const rows = parseMigrationRows(migrationList.stdout)
  if (!rows.length) throw new Error('The linked migration ledger returned no parseable rows.')

  const backups = runSupabase(repoRoot, ['backups', 'list', '--project-ref', PRODUCTION_PROJECT_REF, '--output-format', 'json'])
  if (!backups.ok) throw new Error(`Could not read production backup status: ${backups.stderr || backups.error}`)
  const backupStatus = parseJsonLoose(backups.stdout)
  if (!backupStatus) throw new Error('The production backup response was not valid JSON.')
  const physicalBackups = Array.isArray(backupStatus.backups) ? backupStatus.backups : []
  return {
    ledger: closeoutLedgerBuckets(rows, new Set(driftResolution.reviewedSplitVersions), closeoutScope.supersededOriginalVersions),
    recovery: {
      pitrEnabled: backupStatus.pitr_enabled === true,
      physicalBackupCount: physicalBackups.length,
      recoverable: backupStatus.pitr_enabled === true || physicalBackups.length > 0,
    },
  }
}

function buildResult(repoRoot, options) {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, MANIFEST_PATH), 'utf8'))
  const evidence = JSON.parse(readFileSync(path.join(repoRoot, EVIDENCE_PATH), 'utf8'))
  const closeoutScope = executableCloseoutScope(repoRoot, manifest)
  const recoveryEvidence = validateRecoveryEvidence(repoRoot)
  const driftResolution = ledgerDriftResolution(repoRoot)
  if (manifest.linkedProjectRef !== PRODUCTION_PROJECT_REF || evidence.productionProjectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error('Manifest or closeout evidence has an unexpected production identity.')
  }
  const effectiveManifest = { ...manifest, rows: closeoutScope.rows }
  const migrations = localMigrations(repoRoot)
  const duplicates = duplicateVersions(migrations)
  const filenames = new Set(migrations.map((migration) => migration.file))
  const missingManifestFiles = effectiveManifest.rows.filter((row) => !filenames.has(row.file)).map((row) => row.file)
  const evidenceState = validateEvidence(effectiveManifest, evidence)
  const completeEvidenceSet = new Set(evidenceState.complete)
  const manifestEvidenceRows = effectiveManifest.rows.map((row) => ({
    version: row.version,
    stream: row.stream,
    file: row.file,
    action: row.action,
    objectStatus: row.objectStatus,
    evidenceStatus: completeEvidenceSet.has(row.version) ? 'complete' : 'incomplete',
  }))
  const streamSummaries = [...manifestEvidenceRows.reduce((summaries, row) => {
    const summary = summaries.get(row.stream) || {
      stream: row.stream,
      rows: 0,
      complete: 0,
      incomplete: 0,
      actions: new Set(),
    }
    summary.rows += 1
    summary[row.evidenceStatus] += 1
    summary.actions.add(row.action)
    summaries.set(row.stream, summary)
    return summaries
  }, new Map()).values()].map((summary) => ({
    ...summary,
    actions: [...summary.actions].sort(),
  }))
  const live = options.verifyLive ? liveState(repoRoot, driftResolution, closeoutScope) : null

  const localReady = duplicates.length === 0
    && missingManifestFiles.length === 0
    && evidenceState.incomplete.length === 0
    && evidenceState.unknown.length === 0
    && evidenceState.duplicates.length === 0
  const liveReady = live
    && live.ledger.pureLocalOnly.length === 0
    && live.ledger.pureRemoteOnly.length === 0
    && live.ledger.divergent.length === 0
    && live.ledger.unreviewedSplitVersions.length === 0
    && live.recovery.recoverable
  const ready = Boolean(localReady && liveReady && recoveryEvidence.locked)
  return {
    generatedAt: new Date().toISOString(),
    status: ready ? 'READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT' : (options.verifyLive ? 'CLOSEOUT_BLOCKED' : 'LOCAL_CLOSEOUT_NOT_READY'),
    readyForFreezeRetirement: ready,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    localMigrationCount: migrations.length,
    rawManifestRowCount: manifest.rows.length,
    manifestRowCount: effectiveManifest.rows.length,
    closeoutScope: {
      source: closeoutScope.source,
      supersededOriginalVersions: closeoutScope.supersededOriginalVersions,
      correctiveMappings: closeoutScope.correctiveMappings,
    },
    duplicateVersions: duplicates,
    missingManifestFiles,
    evidence: evidenceState,
    recoveryEvidence: {
      path: RECOVERY_EVIDENCE_PATH,
      locked: recoveryEvidence.locked,
      blockers: recoveryEvidence.blockers,
      method: recoveryEvidence.evidence?.recoveryMethod || null,
      testedAt: recoveryEvidence.evidence?.testedAt || null,
      testedBy: recoveryEvidence.evidence?.testedBy || null,
      acceptedBy: recoveryEvidence.evidence?.acceptedBy || null,
    },
    ledgerDriftResolution: driftResolution,
    manifestEvidenceRows,
    streamSummaries,
    live,
  }
}

function markdownTable(headers, rows) {
  if (!rows.length) return 'No rows.'
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function report(result) {
  const live = result.live
  const list = (items) => items.length ? items.map((item) => `- \`${typeof item === 'string' ? item : item.version}\``).join('\n') : '- None'
  const streamMatrix = markdownTable(
    ['Stream', 'Rows', 'Complete Evidence', 'Incomplete Evidence', 'Actions'],
    result.streamSummaries.map((summary) => [
      `\`${summary.stream}\``,
      String(summary.rows),
      String(summary.complete),
      String(summary.incomplete),
      summary.actions.map((action) => `\`${action}\``).join('<br>'),
    ]),
  )
  const workQueue = markdownTable(
    ['Version', 'Stream', 'Evidence', 'Action', 'Object Status', 'File'],
    result.manifestEvidenceRows
      .filter((row) => row.evidenceStatus !== 'complete')
      .map((row) => [
        `\`${row.version}\``,
        `\`${row.stream}\``,
        `\`${row.evidenceStatus}\``,
        `\`${row.action}\``,
        `\`${row.objectStatus || 'n/a'}\``,
        `\`${row.file}\``,
      ]),
  )
  return `# Supabase Phase 8 Closeout Report

Generated: ${result.generatedAt}
Production project: \`${result.productionProjectRef}\`

## Decision

**Status: ${result.status}**

The Phase 0 broad-push freeze remains active unless this report says \`READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT\`. Even a ready report authorizes a reviewed guard-removal change; it does not remove the guard automatically.

## Gate Summary

| Check | Result |
| --- | --- |
| Local migration files | ${result.localMigrationCount} |
| Phase 5 manifest rows | ${result.manifestRowCount} |
| Duplicate versions | ${result.duplicateVersions.length} |
| Missing manifest files | ${result.missingManifestFiles.length} |
| Complete production evidence rows | ${result.evidence.complete.length} |
| Incomplete production evidence rows | ${result.evidence.incomplete.length} |
| Production recovery evidence locked | ${result.recoveryEvidence.locked ? 'Yes' : 'No'} |
| Production recovery evidence blockers | ${result.recoveryEvidence.blockers.length} |
| Unknown evidence rows | ${result.evidence.unknown.length} |
| Duplicate evidence versions | ${result.evidence.duplicates.length} |
| Ledger drift resolution loaded | ${result.ledgerDriftResolution.loaded ? 'Yes' : 'No'} |
| Ledger drift resolution status | ${result.ledgerDriftResolution.status} |
| Ledger drift resolution blockers | ${result.ledgerDriftResolution.blockers.length} |
| Live verification performed | ${live ? 'Yes' : 'No'} |
| Pure local-only versions | ${live ? live.ledger.pureLocalOnly.length : 'Not checked'} |
| Pure remote-only versions | ${live ? live.ledger.pureRemoteOnly.length : 'Not checked'} |
| Divergent versions | ${live ? live.ledger.divergent.length : 'Not checked'} |
| Unreviewed split versions | ${live ? live.ledger.unreviewedSplitVersions.length : 'Not checked'} |
| Production PITR | ${live ? (live.recovery.pitrEnabled ? 'Enabled' : 'Disabled') : 'Not checked'} |
| Physical backups | ${live ? live.recovery.physicalBackupCount : 'Not checked'} |
| Ready for reviewed freeze retirement | ${result.readyForFreezeRetirement ? 'Yes' : 'No'} |

## Incomplete Evidence Versions

${list(result.evidence.incomplete)}

## Recovery Evidence Blockers

${list(result.recoveryEvidence.blockers)}

## Evidence By Stream

${streamMatrix}

## Closeout Work Queue

${workQueue}

## Closeout Rule

Do not remove \`scripts/supabase-phase0-guard.mjs\`, its CI enforcement, or the broad-push freeze until all local and live checks pass, all ${result.manifestRowCount} manifest versions have reviewed closeout evidence, and production recovery is available and tested.
`
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-phase8-closeout.mjs --plan [--json]')
  console.log('  node scripts/supabase-phase8-closeout.mjs --verify-live [--write] [--json]')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) usage()
  else {
    const repoRoot = findRepoRoot(process.cwd())
    const result = buildResult(repoRoot, options)
    if (options.write) writeFileSync(path.join(repoRoot, REPORT_PATH), report(result))
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`${result.status}: evidence ${result.evidence.complete.length}/${result.manifestRowCount}, freeze retirement ${result.readyForFreezeRetirement ? 'eligible for review' : 'blocked'}.`)
    if (options.verifyLive && !result.readyForFreezeRetirement) process.exitCode = 1
  }
} catch (error) {
  console.error(`Phase 8 closeout gate blocked: ${error.message}`)
  process.exitCode = 1
}
