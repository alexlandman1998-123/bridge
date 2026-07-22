#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

if (!process.argv.includes('--linked')) {
  console.error('Pass --linked to compile the Phase 4 migration in a transaction that is rolled back.')
  process.exit(1)
}

const migrationPath = 'supabase/migrations/202607200010_canonical_partner_relationship_storage.sql'
const migration = readFileSync(migrationPath, 'utf8')
const rollbackSql = migration.replace(/\bcommit;\s*$/i, 'rollback;')
if (rollbackSql === migration || !/\brollback;\s*$/i.test(rollbackSql)) {
  throw new Error('The Phase 4 migration must end with one replaceable COMMIT statement.')
}

execFileSync('npx', ['--yes', 'supabase@latest', 'db', 'query', '--linked', rollbackSql], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 30 * 1024 * 1024,
  env: { ...process.env, NO_COLOR: '1' },
})

console.log('Phase 4 migration compiled successfully and was rolled back.')
