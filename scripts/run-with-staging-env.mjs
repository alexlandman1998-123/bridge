#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ENV_FILE = path.join('the-it-guy', '.env.staging.local')
const REQUIRED_RECOVERY_CONFIRMATION = 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const separator = argv.indexOf('--')
  const prelude = separator >= 0 ? argv.slice(0, separator) : argv
  const command = separator >= 0 ? argv.slice(separator + 1) : argv
  const options = { envFile: DEFAULT_ENV_FILE, printEnv: false, command }
  for (let index = 0; index < prelude.length; index += 1) {
    const arg = prelude[index]
    if (arg === '--env-file') options.envFile = prelude[++index]
    else if (arg === '--print-env') options.printEnv = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (separator < 0) options.command = []
  return options
}

function parseEnvFile(source) {
  const values = {}
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    values[key] = rawValue.trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function normalizeProjectBoundDbUrl(projectRef, rawDbUrl) {
  if (!rawDbUrl) return ''
  const parsed = new URL(rawDbUrl)
  const directHost = `db.${projectRef}.supabase.co`
  if (parsed.hostname.toLowerCase() === directHost) {
    parsed.search = ''
    parsed.searchParams.set('sslmode', 'require')
    if (!parsed.port) parsed.port = '5432'
    return parsed.toString()
  }
  if (!parsed.hostname.toLowerCase().endsWith('.pooler.supabase.com')) {
    throw new Error('SUPABASE_STAGING_DB_URL must be a Supabase pooler URL or direct Supabase database URL.')
  }
  const usernameProjectRef = decodeURIComponent(parsed.username || '').split('.')[1]
  if (usernameProjectRef !== projectRef) {
    throw new Error('Pooler username project ref does not match SUPABASE_STAGING_PROJECT_REF.')
  }
  if (!['5432', '6543'].includes(parsed.port || '5432')) {
    throw new Error('Supabase pooler URL must use port 5432 or 6543.')
  }
  parsed.pathname = '/postgres'
  parsed.search = ''
  parsed.searchParams.set('sslmode', 'require')
  return parsed.toString()
}

function stagingEnv(repoRoot, options) {
  const envPath = path.resolve(repoRoot, options.envFile)
  if (!existsSync(envPath)) throw new Error(`Staging env file not found: ${options.envFile}`)
  const fileEnv = parseEnvFile(readFileSync(envPath, 'utf8'))
  const projectRef = String(fileEnv.SUPABASE_STAGING_PROJECT_REF || '').trim()
  if (!/^[a-z0-9]{8,64}$/.test(projectRef)) {
    throw new Error('SUPABASE_STAGING_PROJECT_REF must be present and must be a lowercase Supabase project ref.')
  }
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error('Refusing to configure staging with the production project ref.')
  const recovery = String(fileEnv.SUPABASE_STAGING_RECOVERY_CONFIRMED || '').trim()
  if (recovery !== REQUIRED_RECOVERY_CONFIRMATION) {
    throw new Error(`SUPABASE_STAGING_RECOVERY_CONFIRMED must equal ${REQUIRED_RECOVERY_CONFIRMATION}.`)
  }
  const dbUrl = normalizeProjectBoundDbUrl(projectRef, fileEnv.SUPABASE_STAGING_DB_URL)
  return {
    ...process.env,
    ...fileEnv,
    SUPABASE_STAGING_PROJECT_REF: projectRef,
    SUPABASE_STAGING_DB_URL: dbUrl,
    SUPABASE_STAGING_RECOVERY_CONFIRMED: recovery,
  }
}

function maskedDbShape(dbUrl) {
  try {
    const parsed = new URL(dbUrl)
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}?${[...parsed.searchParams.keys()].join(',')}`
  } catch {
    return 'invalid-url'
  }
}

function printUsage() {
  console.log('Usage:')
  console.log('  node scripts/run-with-staging-env.mjs [--env-file <path>] -- <command> [args...]')
  console.log('  node scripts/run-with-staging-env.mjs [--env-file <path>] --print-env')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
  } else {
    const repoRoot = findRepoRoot(process.cwd())
    const env = stagingEnv(repoRoot, options)
    if (options.printEnv) {
      console.log(JSON.stringify({
        envFile: options.envFile,
        stagingProjectRef: `${env.SUPABASE_STAGING_PROJECT_REF.slice(0, 3)}...len${env.SUPABASE_STAGING_PROJECT_REF.length}`,
        stagingDbUrlShape: maskedDbShape(env.SUPABASE_STAGING_DB_URL),
        recoveryConfirmed: env.SUPABASE_STAGING_RECOVERY_CONFIRMED === REQUIRED_RECOVERY_CONFIRMATION,
      }, null, 2))
    } else {
      if (!options.command.length) throw new Error('A command is required after --.')
      const result = spawnSync(options.command[0], options.command.slice(1), {
        cwd: repoRoot,
        env,
        encoding: 'utf8',
        stdio: 'inherit',
      })
      if (result.error) throw result.error
      process.exitCode = result.status ?? 1
    }
  }
} catch (error) {
  console.error(`Configure staging env failed: ${error.message}`)
  process.exitCode = 1
}
