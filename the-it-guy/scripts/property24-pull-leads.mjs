import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  normalizeProperty24Text,
  pullAndImportProperty24Leads,
  summarizeProperty24Payload,
} from '../server/property24/index.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    agencyId: '',
    after: '',
    applyLeads: false,
    limit: 500,
    output: '',
  }

  for (const arg of argv) {
    if (arg === '--apply' || arg === '--apply-leads') {
      options.applyLeads = true
    } else if (arg.startsWith('--agency-id=')) {
      options.agencyId = normalizeProperty24Text(arg.slice('--agency-id='.length))
    } else if (arg.startsWith('--after=')) {
      options.after = normalizeProperty24Text(arg.slice('--after='.length))
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || 500
    } else if (arg.startsWith('--output=')) {
      options.output = normalizeProperty24Text(arg.slice('--output='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const files = ['.env', '.env.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)))
  return { ...fromFiles, ...processOverrides }
}

function buildConfig(options) {
  const env = loadEnv()
  const property24BaseUrl = normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL
  const environment = normalizeProperty24Text(env.PROPERTY24_ENVIRONMENT) ||
    (property24BaseUrl.includes('property24-test.com') ? 'exdev' : 'production')
  const config = {
    property24BaseUrl,
    property24Username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    property24Password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    property24UserGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
    supabaseUrl: normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY),
    environment,
    agencyId: normalizeProperty24Text(options.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382'),
    after: options.after,
    applyLeads: options.applyLeads,
    limit: options.limit,
  }
  config.missing = []
  if (!config.property24Username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.property24Password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.agencyId) config.missing.push('PROPERTY24_DEFAULT_AGENCY_ID or --agency-id')
  return config
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-leads.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)
  if (config.missing.length) {
    const report = {
      phase: 'property24-phase7-lead-import',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED',
      mode: config.applyLeads ? 'APPLY_REQUESTED' : 'DRY_RUN',
      safety: {
        property24ApiCalled: false,
        databaseWritten: false,
        leadsCreated: false,
      },
      missingConfiguration: config.missing,
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: config.missing }, null, 2))
    process.exitCode = 1
    return
  }

  const supabase = createSupabaseClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const property24 = createProperty24Client({
    baseUrl: config.property24BaseUrl,
    username: config.property24Username,
    password: config.property24Password,
    userGroupId: config.property24UserGroupId,
  })
  const report = await pullAndImportProperty24Leads({ supabase, property24, config })
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.summary?.failedCount ? 'NEEDS_REVIEW' : 'OK',
    mode: report.mode,
    output,
    leads: report.summary,
    import: report.import?.summary || null,
    safety: report.safety,
  }, null, 2))
  if (report.import?.summary?.failedCount) process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    httpStatus: error.status || null,
    response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  }, null, 2))
  process.exitCode = 1
})
