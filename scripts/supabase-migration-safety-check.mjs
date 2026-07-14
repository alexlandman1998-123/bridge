#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
const failures = []

const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
const byVersion = new Map()

for (const file of files) {
  const match = file.match(/^(\d{12}|\d{14})_[a-z0-9][a-z0-9_]*\.sql$/)
  if (!match) {
    failures.push(`Invalid migration filename: ${file}`)
    continue
  }
  const entries = byVersion.get(match[1]) || []
  entries.push(file)
  byVersion.set(match[1], entries)
}

for (const [version, entries] of byVersion) {
  if (entries.length > 1) failures.push(`Duplicate migration version ${version}: ${entries.join(', ')}`)
}

for (const relative of ['package.json', 'the-it-guy/package.json']) {
  const packagePath = path.join(repoRoot, relative)
  if (!existsSync(packagePath)) continue
  const scripts = JSON.parse(readFileSync(packagePath, 'utf8')).scripts || {}
  if (!String(scripts['supabase:db-push'] || '').includes('supabase-phase0-guard.mjs')) {
    failures.push(`${relative} must route supabase:db-push through the Phase 0 guard`)
  }
  for (const [name, command] of Object.entries(scripts)) {
    if (/supabase\s+db\s+(push|reset)/.test(command) && name !== 'supabase:db-push') {
      failures.push(`${relative} script ${name} bypasses the Phase 0 guard`)
    }
    if (String(command).includes('--include-all')) {
      failures.push(`${relative} script ${name} uses forbidden --include-all`)
    }
  }
}

for (const required of [
  'scripts/supabase-phase0-guard.mjs',
  'scripts/supabase-phase0-evidence.mjs',
  'sql/supabase-phase0-catalog-fingerprint.sql',
  'docs/database-release-runbook.md',
]) {
  if (!existsSync(path.join(repoRoot, required))) failures.push(`Missing Phase 0 control: ${required}`)
}

if (failures.length) {
  console.error('Supabase migration safety check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Supabase migration safety check passed (${files.length} unique migration files).`)
