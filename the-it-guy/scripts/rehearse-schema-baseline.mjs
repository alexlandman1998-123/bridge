#!/usr/bin/env node

/**
 * Replays the verified production public-schema capture into the isolated
 * rehearsal project. It never targets production or the legacy staging ref.
 * Run it in a user terminal so the long, single transaction is not interrupted.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const recoveryDirectory = '/Users/alexanderlandman/arch9-db-recovery'
const schemaFile = resolve(recoveryDirectory, 'production-public-schema-20260906-1530.sql')
const rehearsalRef = 'rlavzicedrilmpaamviu'
const keychainService = 'Arch9 Schema Baseline Rehearsal Supabase DB'

if (!existsSync(schemaFile)) throw new Error(`Missing verified schema capture: ${schemaFile}`)

const password = spawnSync('security', ['find-generic-password', '-a', process.env.USER || '', '-s', keychainService, '-w'], { encoding: 'utf8' })
if (password.status !== 0 || !password.stdout.trim()) throw new Error('Rehearsal database password is not available in the macOS Keychain.')

const result = spawnSync('/opt/homebrew/opt/libpq/bin/psql', [
  '--host', 'aws-1-eu-west-1.pooler.supabase.com', '--port', '5432',
  '--username', `postgres.${rehearsalRef}`, '--dbname', 'postgres', '--no-password',
  '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--file', schemaFile,
], {
  env: { ...process.env, PGPASSWORD: password.stdout.trim() },
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
