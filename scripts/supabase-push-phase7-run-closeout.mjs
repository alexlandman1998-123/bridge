#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const JSON_REPORT_PATH = path.join('docs', 'supabase-push-phase-7-closeout.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-push-phase-7-closeout-report.md')
const CLOSEOUT_REPORT_PATH = path.join('docs', 'supabase-phase-8-closeout-report.md')
const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

function runNode(repoRoot, script, args = []) {
  const result = spawnSync(process.execPath, [path.join(TOOL_ROOT, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  return {
    status: result.status ?? 1,
    ok: result.status === 0 && !result.error,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  }
}

function parseJsonLoose(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  try { return JSON.parse(trimmed) } catch {
    const offset = Math.min(
      ...[trimmed.indexOf('{'), trimmed.indexOf('[')].filter((index) => index >= 0),
    )
    if (!Number.isFinite(offset)) return null
    try { return JSON.parse(trimmed.slice(offset)) } catch { return null }
  }
}

function rowCounts(closeout) {
  return {
    manifestRows: closeout?.manifestRowCount ?? 0,
    completeEvidenceRows: closeout?.evidence?.complete?.length ?? 0,
    incompleteEvidenceRows: closeout?.evidence?.incomplete?.length ?? 0,
    recoveryLocked: closeout?.recoveryEvidence?.locked === true,
    recoveryBlockers: closeout?.recoveryEvidence?.blockers?.length ?? 0,
    duplicateVersions: closeout?.duplicateVersions?.length ?? 0,
    missingManifestFiles: closeout?.missingManifestFiles?.length ?? 0,
    unknownEvidenceRows: closeout?.evidence?.unknown?.length ?? 0,
    duplicateEvidenceVersions: closeout?.evidence?.duplicates?.length ?? 0,
  }
}

function buildResult(repoRoot, options) {
  const evidenceSync = runNode(repoRoot, path.join('scripts', 'supabase-push-phase6-record-production-evidence.mjs'))
  if (!evidenceSync.ok) {
    throw new Error(`Production evidence sync failed: ${evidenceSync.stderr || evidenceSync.error}`)
  }

  const localRun = runNode(repoRoot, path.join('scripts', 'supabase-phase8-closeout.mjs'), ['--plan', '--json'])
  const localCloseout = parseJsonLoose(localRun.stdout)
  if (!localRun.ok || !localCloseout) {
    throw new Error(`Local closeout failed: ${localRun.stderr || localRun.error || 'no JSON result'}`)
  }

  const liveRun = options.verifyLive
    ? runNode(repoRoot, path.join('scripts', 'supabase-phase8-closeout.mjs'), ['--verify-live', '--write', '--json'])
    : null
  const liveCloseout = liveRun ? parseJsonLoose(liveRun.stdout) : null
  const closeout = liveCloseout || localCloseout
  const liveError = liveRun && !liveCloseout ? (liveRun.stderr || liveRun.error || `exit ${liveRun.status}`) : ''
  const finalStatus = closeout.readyForFreezeRetirement
    ? 'READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT'
    : 'CLOSEOUT_BLOCKED'

  return {
    generatedAt: new Date().toISOString(),
    status: finalStatus,
    closeoutReady: closeout.readyForFreezeRetirement === true,
    phase6EvidenceSync: {
      ok: evidenceSync.ok,
      status: evidenceSync.status,
    },
    localCloseout: {
      ok: localRun.ok,
      status: localRun.status,
      decision: localCloseout.status,
      counts: rowCounts(localCloseout),
    },
    liveCloseout: {
      attempted: Boolean(options.verifyLive),
      ok: Boolean(liveRun && liveRun.ok),
      status: liveRun?.status ?? null,
      decision: liveCloseout?.status || null,
      parsed: Boolean(liveCloseout),
      error: liveError.trim(),
      counts: liveCloseout ? rowCounts(liveCloseout) : null,
      ledger: liveCloseout?.live?.ledger
        ? {
            pureLocalOnly: liveCloseout.live.ledger.pureLocalOnly.length,
            pureRemoteOnly: liveCloseout.live.ledger.pureRemoteOnly.length,
            divergent: liveCloseout.live.ledger.divergent.length,
            unreviewedSplitVersions: liveCloseout.live.ledger.unreviewedSplitVersions.length,
          }
        : null,
      recovery: liveCloseout?.live?.recovery || null,
    },
    closeoutReport: options.verifyLive && liveCloseout ? CLOSEOUT_REPORT_PATH : null,
  }
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
  const counts = result.liveCloseout.counts || result.localCloseout.counts
  const ledger = result.liveCloseout.ledger
  const recovery = result.liveCloseout.recovery
  const liveError = result.liveCloseout.error
    ? `\n## Live Closeout Error\n\n\`\`\`text\n${result.liveCloseout.error.replace(/```/g, "'''")}\n\`\`\`\n`
    : ''

  return `# Supabase Push Phase 7 Closeout Report

Generated: ${result.generatedAt}

## Decision

**Status: ${result.status}**

Phase 7 runs the closeout gate after syncing production evidence. It does not remove the Phase 0 broad-push freeze; it only records whether the closeout gates are ready for reviewed freeze retirement.

## Summary

${markdownTable(['Field', 'Value'], [
    ['Phase 6 evidence sync', result.phase6EvidenceSync.ok ? 'Passed' : 'Failed'],
    ['Local closeout decision', `\`${result.localCloseout.decision}\``],
    ['Live closeout attempted', result.liveCloseout.attempted ? 'Yes' : 'No'],
    ['Live closeout parsed', result.liveCloseout.parsed ? 'Yes' : 'No'],
    ['Live closeout decision', result.liveCloseout.decision ? `\`${result.liveCloseout.decision}\`` : 'Not available'],
    ['Closeout ready', result.closeoutReady ? 'Yes' : 'No'],
  ])}

## Evidence Gate

${markdownTable(['Check', 'Value'], [
    ['Manifest rows', String(counts.manifestRows)],
    ['Complete production evidence rows', String(counts.completeEvidenceRows)],
    ['Incomplete production evidence rows', String(counts.incompleteEvidenceRows)],
    ['Production recovery locked', counts.recoveryLocked ? 'Yes' : 'No'],
    ['Production recovery blockers', String(counts.recoveryBlockers)],
    ['Duplicate migration versions', String(counts.duplicateVersions)],
    ['Missing manifest files', String(counts.missingManifestFiles)],
    ['Unknown evidence rows', String(counts.unknownEvidenceRows)],
    ['Duplicate evidence versions', String(counts.duplicateEvidenceVersions)],
  ])}

## Live Gate

${ledger || recovery ? markdownTable(['Check', 'Value'], [
    ['Pure local-only versions', String(ledger?.pureLocalOnly ?? 'Not checked')],
    ['Pure remote-only versions', String(ledger?.pureRemoteOnly ?? 'Not checked')],
    ['Divergent versions', String(ledger?.divergent ?? 'Not checked')],
    ['Unreviewed split versions', String(ledger?.unreviewedSplitVersions ?? 'Not checked')],
    ['Production PITR', recovery ? (recovery.pitrEnabled ? 'Enabled' : 'Disabled') : 'Not checked'],
    ['Physical backups', String(recovery?.physicalBackupCount ?? 'Not checked')],
  ]) : 'Live closeout was not available for this run.'}
${liveError}
## Result

The closeout remains blocked until all manifest rows have reviewed production evidence, live ledger drift is resolved, and production recovery is available and tested. Keep the Phase 0 broad-push freeze active.
`
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-push-phase7-run-closeout.mjs [--verify-live] [--json]')
  console.log('  node scripts/supabase-push-phase7-run-closeout.mjs --local-only [--json]')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) usage()
  else {
    const repoRoot = findRepoRoot(process.cwd())
    const result = buildResult(repoRoot, options)
    writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
    writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else console.log(`${result.status}: evidence ${result.localCloseout.counts.completeEvidenceRows}/${result.localCloseout.counts.manifestRows}, closeout ${result.closeoutReady ? 'ready' : 'blocked'}.`)
  }
} catch (error) {
  console.error(`Supabase push phase 7 closeout failed: ${error.message}`)
  process.exitCode = 1
}
