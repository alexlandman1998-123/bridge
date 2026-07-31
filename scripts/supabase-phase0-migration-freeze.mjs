#!/usr/bin/env node

import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerResolutionPath = 'docs/supabase-ledger-drift-resolution.json'

export function isResolvedLedgerRecord(record) {
  return record?.status === 'LEDGER_DRIFT_RESOLVED' &&
    record.resolved === true &&
    record.counts?.blockers === 0 &&
    Array.isArray(record.blockers) &&
    record.blockers.length === 0
}

export function evaluateMigrationFreeze({ addedMigrations, baseLedger, headLedger }) {
  if (addedMigrations.length === 0) {
    return { allowed: true, reason: 'no-added-migrations' }
  }

  if (isResolvedLedgerRecord(baseLedger) && isResolvedLedgerRecord(headLedger)) {
    return { allowed: true, reason: 'reconciliation-resolved-on-base-and-head' }
  }

  return { allowed: false, reason: 'reconciliation-unresolved' }
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  }

  return result.stdout
}

function readLedgerAtRevision(revision) {
  try {
    return JSON.parse(runGit(['show', `${revision}:${ledgerResolutionPath}`]))
  } catch {
    return null
  }
}

function main() {
  const { BASE_SHA: baseSha, HEAD_SHA: headSha } = process.env
  if (!baseSha || !headSha) {
    throw new Error('BASE_SHA and HEAD_SHA are required')
  }

  const addedMigrations = runGit([
    'diff',
    '--diff-filter=A',
    '--name-only',
    baseSha,
    headSha,
    '--',
    'supabase/migrations/*.sql',
  ]).trim().split('\n').filter(Boolean)

  const decision = evaluateMigrationFreeze({
    addedMigrations,
    baseLedger: readLedgerAtRevision(baseSha),
    headLedger: readLedgerAtRevision(headSha),
  })

  if (decision.allowed) {
    if (addedMigrations.length > 0) {
      console.log('Phase 0 migration freeze baseline is resolved on both base and head; reviewed migrations may proceed.')
      console.log(addedMigrations.join('\n'))
    }
    return
  }

  console.error('Phase 0 blocks new migration files while ledger drift is unresolved:')
  console.error(addedMigrations.join('\n'))
  console.error('Use the database-reconciliation label only for a reviewed history restoration or corrective migration.')
  process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
