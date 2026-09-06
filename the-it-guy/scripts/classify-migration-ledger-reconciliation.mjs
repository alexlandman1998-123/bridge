#!/usr/bin/env node
/**
 * Classifies a read-only migration reconciliation map using exact SQL hashes
 * recovered from reachable Git history. It never repairs remote history.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const valueFor = (flag) => {
  const index = args.indexOf(flag)
  return index < 0 ? null : args[index + 1] || null
}
const inputArgument = valueFor('--input')
const outputArgument = valueFor('--output')

if (args.includes('--help') || !inputArgument || !outputArgument) {
  console.log('Usage: node scripts/classify-migration-ledger-reconciliation.mjs --input <map.json> --output <classified-map.json>')
  if (!args.includes('--help')) process.exitCode = 1
} else {
  const inputPath = resolve(process.cwd(), inputArgument)
  const outputPath = resolve(process.cwd(), outputArgument)
  const map = JSON.parse(readFileSync(inputPath, 'utf8'))
  const localByHash = new Map(
    map.entries
      .filter(({ direction, sha256 }) => direction === 'local_only' && sha256)
      .map((entry) => [entry.sha256, entry]),
  )

  const remoteEntries = map.entries.filter(({ direction }) => direction === 'remote_only')
  const recovered = new Map()
  for (const entry of remoteEntries) {
    const historical = recoverHistoricalMigration(entry.version)
    if (historical) recovered.set(entry.version, historical)
  }

  const renamedPairs = new Map()
  for (const [remoteVersion, historical] of recovered) {
    const local = localByHash.get(historical.sha256)
    if (local) renamedPairs.set(remoteVersion, { localVersion: local.version, ...historical })
  }

  for (const entry of map.entries) {
    if (entry.direction === 'remote_only') {
      const renamed = renamedPairs.get(entry.version)
      if (renamed) {
        entry.classification = 'already_applied_under_renamed_timestamp'
        entry.classificationEvidence = `Exact SQL SHA-256 matches local migration ${renamed.localVersion}; historical source ${renamed.path} at ${renamed.commit}.`
        entry.renamedTimestamp = renamed.localVersion
      } else {
        const historical = recovered.get(entry.version)
        entry.classification = 'missing_locally_must_be_restored'
        entry.classificationEvidence = historical
          ? `Historical SQL is recoverable from ${historical.path} at ${historical.commit}, but no current local migration has the same SQL hash.`
          : 'No matching migration file is reachable in Git history; recover the original SQL from the production release source or backup.'
        entry.recoverySource = historical || null
      }
      continue
    }

    const matchingRemote = [...renamedPairs.entries()].find(([, pair]) => pair.localVersion === entry.version)
    if (matchingRemote) {
      entry.classification = 'already_applied_under_renamed_timestamp'
      entry.classificationEvidence = `Exact SQL SHA-256 matches production migration ${matchingRemote[0]} recovered from ${matchingRemote[1].path}.`
      entry.renamedTimestamp = matchingRemote[0]
    } else {
      entry.classification = 'local_work_not_yet_deployed'
      entry.classificationEvidence = 'No exact SQL match was recovered for a production-only migration. Treat as unapplied until staging confirms otherwise.'
    }
  }

  map.classificationPolicy = {
    already_applied_under_renamed_timestamp: 'Only exact SHA-256 equality between recovered production SQL and current local SQL qualifies.',
    missing_locally_must_be_restored: 'Production version has no exact current local SQL counterpart.',
    local_work_not_yet_deployed: 'Local SQL has no exact recovered production SQL counterpart.',
    obsolete_superseded: 'Reserved for explicit replacement evidence; no migration is placed here automatically.',
  }
  map.classificationSummary = Object.fromEntries(
    ['already_applied_under_renamed_timestamp', 'missing_locally_must_be_restored', 'local_work_not_yet_deployed', 'obsolete_superseded']
      .map((classification) => [classification, map.entries.filter((entry) => entry.classification === classification).length]),
  )
  writeFileSync(outputPath, `${JSON.stringify(map, null, 2)}\n`)
  console.log(JSON.stringify({ output: outputPath, ...map.classificationSummary }, null, 2))
}

function recoverHistoricalMigration(version) {
  const pathspec = `:(glob)supabase/migrations/${version}_*.sql`
  const commits = execFileSync('git', ['log', '--all', '--format=%H', '--', pathspec], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
  for (const commit of commits) {
    const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', 'supabase/migrations'], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/u)
      .filter((path) => path.startsWith(`supabase/migrations/${version}_`) && path.endsWith('.sql'))
    for (const path of paths) {
      const sql = execFileSync('git', ['show', `${commit}:${path}`])
      return { path, commit, sha256: createHash('sha256').update(sql).digest('hex') }
    }
  }
  return null
}
