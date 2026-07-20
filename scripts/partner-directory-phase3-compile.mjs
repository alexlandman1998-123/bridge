#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const linked = process.argv.includes('--linked')
if (!linked) {
  console.error('Pass --linked to compile the Phase 3 migration in a transaction that is rolled back.')
  process.exit(1)
}

const migrationPath = 'supabase/migrations/202607200009_partner_identity_linking_and_deduplication.sql'
const migration = readFileSync(migrationPath, 'utf8')
const rollbackSql = migration.replace(/\bcommit;\s*$/i, 'rollback;')

if (rollbackSql === migration || !/\brollback;\s*$/i.test(rollbackSql)) {
  throw new Error('The Phase 3 migration must end with one replaceable COMMIT statement.')
}

execFileSync(
  'npx',
  ['--yes', 'supabase@latest', 'db', 'query', '--linked', rollbackSql],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  },
)

console.log('Phase 3 migration compiled successfully and was rolled back.')
