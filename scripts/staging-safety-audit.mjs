#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_STAGING_ENV_FILE = path.join('the-it-guy', '.env.staging.local')
const DEFAULT_PREVIEW_ENV_FILE = path.join('.vercel', '.env.preview.local')
const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const REQUIRED_RECOVERY_CONFIRMATION = 'I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
const RENTALS_FLAGS = Object.freeze([
  'VITE_RENTALS_ENABLED',
  'VITE_RENTAL_APPLICATIONS_ENABLED',
  'VITE_RENTAL_LEASES_ENABLED',
  'VITE_RENTAL_MANAGEMENT_ENABLED',
  'VITE_PROPERTY24_RENTALS_ENABLED',
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
    stagingEnvFile: DEFAULT_STAGING_ENV_FILE,
    previewEnvFile: DEFAULT_PREVIEW_ENV_FILE,
    json: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--staging-env-file') options.stagingEnvFile = argv[++index]
    else if (arg === '--preview-env-file') options.previewEnvFile = argv[++index]
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function parseEnvFile(source) {
  const values = {}
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function readEnv(repoRoot, relativeFile) {
  const absolutePath = path.resolve(repoRoot, relativeFile)
  if (!existsSync(absolutePath)) return { exists: false, path: relativeFile, values: {} }
  return {
    exists: true,
    path: relativeFile,
    values: parseEnvFile(readFileSync(absolutePath, 'utf8')),
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function projectRefFromSupabaseUrl(value) {
  const parsed = parseUrl(value)
  if (!parsed) return ''
  const host = parsed.hostname.toLowerCase()
  const match = host.match(/^([a-z0-9]{8,64})\.supabase\.co$/)
  return match ? match[1] : ''
}

function projectRefFromDbUrl(value) {
  const parsed = parseUrl(value)
  if (!parsed) return ''
  const host = parsed.hostname.toLowerCase()
  const direct = host.match(/^db\.([a-z0-9]{8,64})\.supabase\.co$/)
  if (direct) return direct[1]
  if (host.endsWith('.pooler.supabase.com')) {
    return decodeURIComponent(parsed.username || '').split('.')[1] || ''
  }
  return ''
}

function envSummary(env = {}) {
  const supabaseUrl = normalizeText(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  const parsed = parseUrl(supabaseUrl)
  return {
    supabaseHost: parsed?.hostname || '',
    supabaseProjectRef: projectRefFromSupabaseUrl(supabaseUrl),
    vercelEnv: normalizeText(env.VERCEL_ENV),
    vercelTargetEnv: normalizeText(env.VERCEL_TARGET_ENV),
    viteAppEnv: normalizeText(env.VITE_APP_ENV),
    rentalsFlags: Object.fromEntries(RENTALS_FLAGS.map((key) => [key, normalizeText(env[key]) || 'default_false'])),
  }
}

function pushIssue(issues, code, message, severity = 'critical', metadata = {}) {
  issues.push({ code, severity, message, metadata })
}

function auditStagingEnv(staging) {
  const issues = []
  const env = staging.values
  const stagingProjectRef = normalizeText(env.SUPABASE_STAGING_PROJECT_REF)
  const appProjectRef = projectRefFromSupabaseUrl(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  const dbProjectRef = projectRefFromDbUrl(env.SUPABASE_STAGING_DB_URL)

  if (!staging.exists) {
    pushIssue(issues, 'staging_env_missing', `Staging env file is missing: ${staging.path}`)
  }
  if (!/^[a-z0-9]{8,64}$/.test(stagingProjectRef)) {
    pushIssue(issues, 'staging_project_ref_missing', 'SUPABASE_STAGING_PROJECT_REF is missing or invalid.')
  }
  if (stagingProjectRef === PRODUCTION_PROJECT_REF) {
    pushIssue(issues, 'staging_project_is_production', 'SUPABASE_STAGING_PROJECT_REF points at production.')
  }
  if (appProjectRef && appProjectRef !== stagingProjectRef) {
    pushIssue(issues, 'staging_app_url_project_mismatch', 'Staging app Supabase URL does not match SUPABASE_STAGING_PROJECT_REF.', 'critical', {
      appProjectRef,
      stagingProjectRef,
    })
  }
  if (!dbProjectRef) {
    pushIssue(issues, 'staging_db_url_missing_or_unbound', 'SUPABASE_STAGING_DB_URL is missing or is not recognisably bound to a Supabase project.')
  } else if (dbProjectRef !== stagingProjectRef) {
    pushIssue(issues, 'staging_db_project_mismatch', 'SUPABASE_STAGING_DB_URL is not bound to SUPABASE_STAGING_PROJECT_REF.', 'critical', {
      dbProjectRef,
      stagingProjectRef,
    })
  }
  if (normalizeText(env.SUPABASE_STAGING_RECOVERY_CONFIRMED) !== REQUIRED_RECOVERY_CONFIRMATION) {
    pushIssue(issues, 'staging_recovery_not_confirmed', `SUPABASE_STAGING_RECOVERY_CONFIRMED must equal ${REQUIRED_RECOVERY_CONFIRMATION}.`)
  }

  return {
    ok: issues.length === 0,
    path: staging.path,
    exists: staging.exists,
    stagingProjectRef,
    appProjectRef,
    dbProjectRef,
    summary: envSummary(env),
    issues,
  }
}

function isPreviewLike(env = {}) {
  const target = normalizeText(env.VERCEL_TARGET_ENV || env.VERCEL_ENV || env.VITE_APP_ENV).toLowerCase()
  return ['preview', 'staging', 'development', 'local', 'test'].includes(target)
}

function auditPreviewEnv(preview) {
  const issues = []
  const env = preview.values
  const projectRef = projectRefFromSupabaseUrl(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  const previewLike = isPreviewLike(env)

  if (!preview.exists) {
    pushIssue(issues, 'preview_env_missing', `Preview env snapshot is missing: ${preview.path}`, 'warning')
  } else if (!projectRef) {
    pushIssue(issues, 'preview_supabase_url_missing', 'Preview env does not expose a Supabase project ref.', 'warning')
  } else if (previewLike && projectRef === PRODUCTION_PROJECT_REF) {
    pushIssue(issues, 'preview_points_at_production_supabase', 'Vercel preview/staging env points at production Supabase.')
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'critical'),
    path: preview.path,
    exists: preview.exists,
    previewLike,
    projectRef,
    summary: envSummary(env),
    issues,
  }
}

function auditRentalsFlagDefaults(envSources = []) {
  const enabled = []
  for (const source of envSources) {
    for (const key of RENTALS_FLAGS) {
      if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalizeText(source.values[key]).toLowerCase())) {
        enabled.push({ file: source.path, key })
      }
    }
  }
  return {
    ok: enabled.length === 0,
    requiredDefault: false,
    flags: [...RENTALS_FLAGS],
    enabled,
    issues: enabled.map((row) => ({
      code: 'rentals_flag_enabled_before_staging_readiness',
      severity: 'critical',
      message: `${row.key} is enabled in ${row.file}; keep Rentals off until staging proof is complete.`,
      metadata: row,
    })),
  }
}

function buildReport(repoRoot, options) {
  const staging = readEnv(repoRoot, options.stagingEnvFile)
  const preview = readEnv(repoRoot, options.previewEnvFile)
  const stagingAudit = auditStagingEnv(staging)
  const previewAudit = auditPreviewEnv(preview)
  const rentalsFlags = auditRentalsFlagDefaults([staging, preview])
  const issues = [
    ...stagingAudit.issues,
    ...previewAudit.issues,
    ...rentalsFlags.issues,
  ]
  return {
    generatedAt: new Date().toISOString(),
    status: issues.some((issue) => issue.severity === 'critical') ? 'BLOCKED' : 'READY',
    repoRoot,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    staging: stagingAudit,
    preview: previewAudit,
    rentalsFlags,
    issues,
  }
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/staging-safety-audit.mjs [--json]')
  console.log('  node scripts/staging-safety-audit.mjs --staging-env-file <path> --preview-env-file <path> [--json]')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
  } else {
    const repoRoot = findRepoRoot(process.cwd())
    const report = buildReport(repoRoot, options)
    if (options.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      console.log(`Staging safety audit: ${report.status}`)
      console.log(`Staging Supabase: ${report.staging.summary.supabaseHost || 'missing'} (${report.staging.stagingProjectRef || 'missing'})`)
      console.log(`Preview Supabase: ${report.preview.summary.supabaseHost || 'missing'} (${report.preview.projectRef || 'missing'})`)
      console.log(`Rentals flags: ${report.rentalsFlags.ok ? 'off by default' : 'enabled before readiness'}`)
      for (const issue of report.issues) {
        console.log(`- [${issue.severity}] ${issue.code}: ${issue.message}`)
      }
    }
    process.exitCode = report.status === 'READY' ? 0 : 1
  }
} catch (error) {
  console.error(`Staging safety audit failed: ${error.message}`)
  process.exitCode = 1
}
