#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIVE_CLOSEOUT_SCRIPT = path.join('scripts', 'supabase-phase8-closeout.mjs')
const SPLIT_INVESTIGATION_SCRIPT = path.join('scripts', 'supabase-phase6-split-ledger-investigation.mjs')
const PRODUCTION_PROMOTION_PATH = path.join('docs', 'supabase-push-phase-5-production-promotion.json')
const NON_RUNNABLE_CLEARANCE_DIR = path.join('docs', 'non-runnable-clearance')
const JSON_REPORT_PATH = path.join('docs', 'supabase-ledger-drift-resolution.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-ledger-drift-resolution-report.md')
const RESOLVED_SPLIT_DECISIONS = new Set([
  'confirmed_live_split',
  'confirmed_live_manual_sql',
  'confirmed_superseded_split',
  'confirmed_live_name_unavailable',
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
  const options = {
    verifyLive: true,
    json: false,
    liveCloseoutFixture: '',
    splitInvestigationFixture: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--verify-live') options.verifyLive = true
    else if (arg === '--local-only' || arg === '--plan') options.verifyLive = false
    else if (arg === '--live-closeout') options.liveCloseoutFixture = argv[++index]
    else if (arg === '--split-investigation') options.splitInvestigationFixture = argv[++index]
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
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

function runNode(repoRoot, script, args) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  }
}

function loadLiveCloseout(repoRoot, options) {
  if (options.liveCloseoutFixture) {
    return {
      source: options.liveCloseoutFixture,
      result: readJson(path.resolve(repoRoot, options.liveCloseoutFixture)),
      command: null,
    }
  }
  const run = runNode(repoRoot, LIVE_CLOSEOUT_SCRIPT, [options.verifyLive ? '--verify-live' : '--plan', '--json'])
  const result = parseJsonLoose(run.stdout)
  if (!result) throw new Error(`Could not parse closeout ledger output: ${run.stderr || run.error || `exit ${run.status}`}`)
  return { source: LIVE_CLOSEOUT_SCRIPT, result, command: run }
}

function loadSplitInvestigation(repoRoot, options) {
  if (options.splitInvestigationFixture) {
    return {
      source: options.splitInvestigationFixture,
      result: readJson(path.resolve(repoRoot, options.splitInvestigationFixture)),
      command: null,
    }
  }
  const args = options.verifyLive ? ['--fetch-remote', '--json'] : ['--json']
  const run = runNode(repoRoot, SPLIT_INVESTIGATION_SCRIPT, args)
  const result = parseJsonLoose(run.stdout)
  if (!result) throw new Error(`Could not parse split investigation output: ${run.stderr || run.error || `exit ${run.status}`}`)
  return { source: SPLIT_INVESTIGATION_SCRIPT, result, command: run }
}

function readPromotionRows(repoRoot) {
  const absolutePath = path.join(repoRoot, PRODUCTION_PROMOTION_PATH)
  if (!existsSync(absolutePath)) return new Map()
  const report = readJson(absolutePath)
  return new Map((Array.isArray(report.rows) ? report.rows : []).map((row) => [row.version, row]))
}

function readCorrectiveClearanceRows(repoRoot) {
  const absoluteDir = path.join(repoRoot, NON_RUNNABLE_CLEARANCE_DIR)
  if (!existsSync(absoluteDir)) return new Map()
  const rows = readdirSync(absoluteDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        return readJson(path.join(absoluteDir, file))
      } catch {
        return null
      }
    })
    .filter((row) => row && row.clearanceDecision === 'apply_corrective_after_dependency_check')
    .filter((row) => String(row.approvedBy || '').trim() && String(row.approvedAt || '').trim())
    .filter((row) => String(row.version || '').trim() && String(row.correctiveVersion || '').trim())

  return new Map(rows.map((row) => [String(row.version), row]))
}

function classifyPureLocal(row, promotionRows, correctiveClearanceRows) {
  const version = row.local || row.version
  const promotion = promotionRows.get(version)
  if (!promotion) {
    const correctiveClearance = correctiveClearanceRows.get(version)
    const correctiveVersion = String(correctiveClearance?.correctiveVersion || '').trim()
    const correctivePromotion = correctiveVersion ? promotionRows.get(correctiveVersion) : null
    if (correctivePromotion) {
      return {
        version,
        stream: correctivePromotion.stream,
        file: correctiveClearance.file || correctiveClearance.originalFile || '',
        resolution: 'superseded_by_corrective_promotion_plan',
        resolved: true,
        blockers: [],
        correctiveVersion,
        correctiveFile: correctivePromotion.file,
        command: `npm run supabase:push:promote-one -- --version ${correctiveVersion} --plan`,
      }
    }
    return {
      version,
      resolution: 'unmanaged_pure_local_only',
      resolved: false,
      blockers: ['missing_production_promotion_plan'],
      command: '',
    }
  }
  const command = `npm run supabase:push:promote-one -- --version ${version} --plan`
  if (promotion.readyForProduction === true) {
    return {
      version,
      stream: promotion.stream,
      file: promotion.file,
      resolution: 'ready_for_one_version_promotion',
      resolved: false,
      blockers: ['production_promotion_execution_pending'],
      command,
    }
  }
  return {
    version,
    stream: promotion.stream,
    file: promotion.file,
    resolution: 'promotion_blocked_by_phase5',
    resolved: false,
    blockers: [
      'production_promotion_not_ready',
      ...(Array.isArray(promotion.blockers) ? promotion.blockers.map((blocker) => `phase5_${blocker}`) : []),
    ],
    command,
  }
}

function classifyPureRemote(row) {
  const version = row.remote || row.version
  return {
    version,
    resolution: 'restore_local_history_or_accept_remote_only',
    resolved: false,
    blockers: ['remote_history_without_local_migration_file'],
    command: `git log --all -- supabase/migrations/${version}_*.sql`,
  }
}

function classifyDivergent(row) {
  return {
    local: row.local,
    remote: row.remote,
    resolution: 'manual_divergent_ledger_review',
    resolved: false,
    blockers: ['divergent_local_remote_versions'],
    command: 'Inspect the Supabase migration list row and decide whether local history or remote ledger repair is correct.',
  }
}

function classifySplitRows(splitRows) {
  return splitRows.map((row) => {
    const resolved = RESOLVED_SPLIT_DECISIONS.has(row.decision)
    return {
      version: row.version,
      module: row.module,
      objectStatus: row.objectStatus,
      remoteNameStatus: row.remoteNameStatus,
      decision: row.decision,
      resolved,
      blockers: resolved ? [] : [`split_${row.decision || 'review_required'}`],
    }
  })
}

function buildResult(repoRoot, options) {
  const liveSource = loadLiveCloseout(repoRoot, options)
  const splitSource = loadSplitInvestigation(repoRoot, options)
  const promotionRows = readPromotionRows(repoRoot)
  const ledger = liveSource.result.live?.ledger || {
    pureLocalOnly: [],
    pureRemoteOnly: [],
    divergent: [],
    unreviewedSplitVersions: [],
  }
  const splitRows = classifySplitRows(Array.isArray(splitSource.result.splitRows) ? splitSource.result.splitRows : [])
  const correctiveClearanceRows = readCorrectiveClearanceRows(repoRoot)
  const pureLocalOnly = (ledger.pureLocalOnly || []).map((row) => classifyPureLocal(row, promotionRows, correctiveClearanceRows))
  const pureRemoteOnly = (ledger.pureRemoteOnly || []).map(classifyPureRemote)
  const divergent = (ledger.divergent || []).map(classifyDivergent)
  const unresolvedSplitRows = splitRows.filter((row) => !row.resolved)
  const blockers = [
    ...pureLocalOnly.filter((row) => !row.resolved).flatMap((row) => row.blockers.map((blocker) => `${row.version}:${blocker}`)),
    ...pureRemoteOnly.flatMap((row) => row.blockers.map((blocker) => `${row.version}:${blocker}`)),
    ...divergent.flatMap((row) => row.blockers.map((blocker) => `${row.local || 'unknown'}:${blocker}`)),
    ...unresolvedSplitRows.flatMap((row) => row.blockers.map((blocker) => `${row.version}:${blocker}`)),
  ]

  return {
    generatedAt: new Date().toISOString(),
    status: blockers.length ? 'LEDGER_DRIFT_BLOCKED' : 'LEDGER_DRIFT_RESOLVED',
    closeoutSource: liveSource.source,
    splitInvestigationSource: splitSource.source,
    closeoutCommandStatus: liveSource.command?.status ?? null,
    splitCommandStatus: splitSource.command?.status ?? null,
    resolved: blockers.length === 0,
    reviewedSplitVersions: splitRows.filter((row) => row.resolved).map((row) => row.version).sort(),
    unresolvedSplitVersions: unresolvedSplitRows.map((row) => row.version).sort(),
    counts: {
      pureLocalOnly: pureLocalOnly.length,
      pureRemoteOnly: pureRemoteOnly.length,
      divergent: divergent.length,
      splitRows: splitRows.length,
      reviewedSplitRows: splitRows.filter((row) => row.resolved).length,
      unresolvedSplitRows: unresolvedSplitRows.length,
      blockers: blockers.length,
    },
    rows: {
      pureLocalOnly,
      pureRemoteOnly,
      divergent,
      splitRows,
    },
    blockers,
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

function buildMarkdown(result) {
  const localRows = result.rows.pureLocalOnly.map((row) => [
    `\`${row.version}\``,
    `\`${row.stream || 'unknown'}\``,
    `\`${row.resolution}\``,
    row.blockers.length ? row.blockers.map((blocker) => `\`${blocker}\``).join('<br>') : 'None',
    row.command ? `\`${row.command}\`` : '',
  ])
  const remoteRows = result.rows.pureRemoteOnly.map((row) => [
    `\`${row.version}\``,
    `\`${row.resolution}\``,
    row.blockers.map((blocker) => `\`${blocker}\``).join('<br>'),
    `\`${row.command}\``,
  ])
  const splitRows = result.rows.splitRows.map((row) => [
    `\`${row.version}\``,
    `\`${row.module || 'unknown'}\``,
    `\`${row.decision}\``,
    row.resolved ? 'Yes' : 'No',
    row.blockers.length ? row.blockers.map((blocker) => `\`${blocker}\``).join('<br>') : 'None',
  ])

  return `# Supabase Ledger Drift Resolution

Generated: ${result.generatedAt}

## Decision

| Field | Value |
| --- | --- |
| Status | \`${result.status}\` |
| Resolved | ${result.resolved ? 'Yes' : 'No'} |
| Pure local-only rows | ${result.counts.pureLocalOnly} |
| Pure remote-only rows | ${result.counts.pureRemoteOnly} |
| Divergent rows | ${result.counts.divergent} |
| Reviewed split rows | ${result.counts.reviewedSplitRows} |
| Unresolved split rows | ${result.counts.unresolvedSplitRows} |
| Blockers | ${result.counts.blockers} |

## Pure Local-Only

${markdownTable(['Version', 'Stream', 'Resolution', 'Blockers', 'Command'], localRows)}

## Pure Remote-Only

${markdownTable(['Version', 'Resolution', 'Blockers', 'Command'], remoteRows)}

## Split Rows

${markdownTable(['Version', 'Module', 'Decision', 'Reviewed', 'Blockers'], splitRows)}

## Closeout Integration

The reviewed split versions in this report are safe for closeout accounting only. Pure local-only rows still need one-version production promotion, and pure remote-only rows still need local history restoration or explicit remote-only acceptance.
`
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-resolve-ledger-drift.mjs [--verify-live] [--json]')
  console.log('  node scripts/supabase-resolve-ledger-drift.mjs --local-only [--json]')
  console.log('  node scripts/supabase-resolve-ledger-drift.mjs --live-closeout <json> --split-investigation <json> [--json]')
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
    else {
      console.log(`Wrote ${JSON_REPORT_PATH}`)
      console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
      console.log(`Status: ${result.status}`)
    }
  }
} catch (error) {
  console.error(`Resolve ledger drift failed: ${error.message}`)
  process.exitCode = 1
}
