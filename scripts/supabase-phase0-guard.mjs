#!/usr/bin/env node

import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_OVERRIDE = 'I_UNDERSTAND_LEDGER_DRIFT'
const BLOCKED_COMMANDS = new Set([
  'db push',
  'db reset',
  'migration repair',
])

const ONBOARDING_CRITICAL_MIGRATIONS = [
  ['202605240010', 'atomic workspace onboarding'],
  ['202606040001', 'role-contract onboarding wrapper'],
  ['202606170002', 'principal claim invite RPC'],
  ['202606170003', 'principal claim completion RPC'],
  ['202606190001', 'email-claim onboarding repair'],
  ['202607020002', 'principal-claim invite RLS hardening'],
  ['202607120002', 'branch-scope onboarding fix'],
]

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function getMigrationFiles(repoRoot) {
  const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
  if (!existsSync(migrationsDir)) return []
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
}

function summarizeDuplicateVersions(files) {
  const byVersion = new Map()
  for (const file of files) {
    const version = file.split('_')[0]
    if (!version) continue
    const entries = byVersion.get(version) || []
    entries.push(file)
    byVersion.set(version, entries)
  }
  return [...byVersion.entries()]
    .filter(([, entries]) => entries.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
}

function findMissingCriticalMigrations(files) {
  const versions = new Set(files.map((file) => file.split('_')[0]))
  return ONBOARDING_CRITICAL_MIGRATIONS.filter(([version]) => !versions.has(version))
}

function normalizeCommand(args) {
  const commandArgs = args.filter((arg) => !arg.startsWith('--'))
  return commandArgs.slice(0, 2).join(' ')
}

function printStatus({ repoRoot, files }) {
  const duplicates = summarizeDuplicateVersions(files)
  const missingCritical = findMissingCriticalMigrations(files)

  console.log('Supabase Phase 0 stabilization guard is active.')
  console.log('')
  console.log(`Repo: ${repoRoot}`)
  console.log(`Local migration files: ${files.length}`)
  console.log('')
  console.log('Blocked broad commands while the remote migration ledger is drifted:')
  console.log('- supabase db push')
  console.log('- supabase db reset')
  console.log('- supabase migration repair')
  console.log('')
  console.log('Allowed Phase 0 work:')
  console.log('- Read-only diagnostics: migration list, SELECT catalog checks, REST RPC probes.')
  console.log('- Narrow production patches only when a user-facing incident is blocked.')
  console.log('- Every patch must have a small SQL file, a live object check, and a rollback/no-residue smoke test where possible.')
  console.log('')

  if (duplicates.length) {
    console.log('Duplicate local migration timestamps detected:')
    for (const [version, entries] of duplicates) {
      console.log(`- ${version}: ${entries.join(', ')}`)
    }
  } else {
    console.log('Duplicate local migration timestamps detected: none')
  }

  console.log('')
  if (missingCritical.length) {
    console.log('Missing local onboarding-critical migrations:')
    for (const [version, label] of missingCritical) {
      console.log(`- ${version}: ${label}`)
    }
  } else {
    console.log('Onboarding-critical migration files are present locally.')
  }
}

const args = process.argv.slice(2)
const repoRoot = findRepoRoot(process.cwd())
const files = getMigrationFiles(repoRoot)
const normalizedCommand = normalizeCommand(args)
const overrideEnabled = process.env.BRIDGE_SUPABASE_PHASE0_OVERRIDE === REQUIRED_OVERRIDE

if (!args.length || args.includes('--status')) {
  printStatus({ repoRoot, files })
  process.exit(0)
}

if (BLOCKED_COMMANDS.has(normalizedCommand) && !overrideEnabled) {
  console.error('Blocked by Supabase Phase 0 stabilization guard.')
  console.error('')
  console.error(`Command: supabase ${normalizedCommand}`)
  console.error('')
  console.error('Reason: the linked Supabase migration ledger is drifted; broad migration commands can misreport or apply the wrong set of migrations.')
  console.error('Use docs/supabase-migration-phase-0-stabilization.md before any production DB change.')
  console.error('')
  console.error(`Emergency override, only after documented approval: BRIDGE_SUPABASE_PHASE0_OVERRIDE=${REQUIRED_OVERRIDE}`)
  process.exit(2)
}

if (BLOCKED_COMMANDS.has(normalizedCommand) && overrideEnabled) {
  console.warn('Phase 0 override accepted. Continue only with documented approval and captured evidence.')
}

printStatus({ repoRoot, files })
