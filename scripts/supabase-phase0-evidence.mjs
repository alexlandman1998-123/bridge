#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const evidenceDir = path.join(repoRoot, 'docs', 'database-evidence')
const catalogSql = path.join(repoRoot, 'sql', 'supabase-phase0-catalog-fingerprint.sql')
const catalogPath = path.join(evidenceDir, 'phase0-production-catalog.json')
const ledgerPath = path.join(evidenceDir, 'phase0-production-ledger.json')
const reportPath = path.join(repoRoot, 'docs', 'supabase-migration-phase-0-evidence.md')

function parseJsonLoose(text) {
  const value = String(text || '').trim()
  if (!value) throw new Error('Supabase returned no JSON output')
  try {
    return JSON.parse(value)
  } catch {
    const first = [value.indexOf('{'), value.indexOf('[')]
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0]
    if (first === undefined) throw new Error('Supabase output did not contain JSON')
    return JSON.parse(value.slice(first))
  }
}

function runSupabase(args) {
  const result = spawnSync('npx', ['supabase', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr || result.error?.message || `Supabase exited ${result.status}`)
  }
  return parseJsonLoose(result.stdout)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value) {
  // Evidence files are machine-readable baselines. Compact JSON keeps the Git
  // diff small enough to review while the companion Markdown report carries
  // the human-readable counts and integrity hashes.
  return `${JSON.stringify(value)}\n`
}

function gitValue(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unavailable'
}

if (!existsSync(catalogSql)) throw new Error(`Missing catalog SQL: ${catalogSql}`)

const ledgerResult = runSupabase(['migration', 'list', '--linked', '--output-format', 'json'])
const catalogResult = runSupabase([
  'db', 'query', '--linked', '--file', catalogSql, '--output-format', 'json',
])

const ledger = [...(ledgerResult.migrations || [])].sort((a, b) =>
  String(a.time || '').localeCompare(String(b.time || '')),
)
const catalog = [...(catalogResult.rows || [])].sort((a, b) =>
  `${a.object_type}:${a.object_name}`.localeCompare(`${b.object_type}:${b.object_name}`),
)

mkdirSync(evidenceDir, { recursive: true })
const ledgerJson = stableJson({ captured_at: new Date().toISOString(), migrations: ledger })
const catalogJson = stableJson({ captured_at: new Date().toISOString(), objects: catalog })
writeFileSync(ledgerPath, ledgerJson)
writeFileSync(catalogPath, catalogJson)

const counts = Object.fromEntries(
  [...new Set(catalog.map((item) => item.object_type))]
    .sort()
    .map((type) => [type, catalog.filter((item) => item.object_type === type).length]),
)
const localOnly = ledger.filter((row) => row.local && !row.remote).length
const remoteOnly = ledger.filter((row) => row.remote && !row.local).length
const localVersions = new Set(ledger.map((row) => row.local).filter(Boolean))
const remoteVersions = new Set(ledger.map((row) => row.remote).filter(Boolean))
const normalizedMatched = [...localVersions].filter((version) => remoteVersions.has(version)).length
const normalizedLocalOnly = [...localVersions].filter((version) => !remoteVersions.has(version)).length
const normalizedRemoteOnly = [...remoteVersions].filter((version) => !localVersions.has(version)).length

const report = `# Supabase Phase 0 Production Evidence

Generated: ${new Date().toISOString()}

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | ${gitValue(['branch', '--show-current'])} |
| Git commit | ${gitValue(['rev-parse', 'HEAD'])} |
| Migration rows | ${ledger.length} |
| CLI local-only display rows | ${localOnly} |
| CLI remote-only display rows | ${remoteOnly} |
| Normalized matched versions | ${normalizedMatched} |
| Normalized local-only versions | ${normalizedLocalOnly} |
| Normalized remote-only versions | ${normalizedRemoteOnly} |
| Catalog objects | ${catalog.length} |

## Catalog counts

${Object.entries(counts).map(([type, count]) => `- ${type}: ${count}`).join('\n')}

## Integrity hashes

- Catalog snapshot SHA-256: \`${sha256(catalogJson)}\`
- Ledger snapshot SHA-256: \`${sha256(ledgerJson)}\`

## Files

- \`docs/database-evidence/phase0-production-catalog.json\`
- \`docs/database-evidence/phase0-production-ledger.json\`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
`

writeFileSync(reportPath, report)
console.log(`Wrote ${path.relative(repoRoot, catalogPath)}`)
console.log(`Wrote ${path.relative(repoRoot, ledgerPath)}`)
console.log(`Wrote ${path.relative(repoRoot, reportPath)}`)
