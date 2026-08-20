import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  applyControlledProperty24StatusUpdate,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../server/property24/index.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    apply: false,
    listingId: '',
    listingNumber: '',
    status: '',
    agencyId: '',
    output: '',
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
    } else if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizeProperty24Text(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--listing-number=')) {
      options.listingNumber = normalizeProperty24Text(arg.slice('--listing-number='.length))
    } else if (arg.startsWith('--status=')) {
      options.status = normalizeProperty24Text(arg.slice('--status='.length))
    } else if (arg.startsWith('--agency-id=')) {
      options.agencyId = normalizeProperty24Text(arg.slice('--agency-id='.length))
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
  const config = {
    property24BaseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    property24Username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    property24Password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    property24UserGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
    supabaseUrl: normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY),
    listingId: options.listingId,
    listingNumber: options.listingNumber,
    status: options.status,
    agencyId: normalizeProperty24Text(options.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382'),
  }

  config.missing = []
  if (!config.property24Username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.property24Password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.listingId) config.missing.push('--listing-id')
  if (!config.listingNumber) config.missing.push('--listing-number')
  if (!config.status) config.missing.push('--status')
  if (!config.agencyId) config.missing.push('--agency-id or PROPERTY24_DEFAULT_AGENCY_ID')
  return config
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-status-update.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)

  if (config.missing.length) {
    const report = {
      phase: 'property24-status-update',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED',
      missingConfiguration: config.missing,
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: config.missing }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    const report = {
      phase: 'property24-status-update',
      generatedAt: new Date().toISOString(),
      status: 'DRY_RUN',
      message: 'No Property24 write was made. Re-run with --apply to update the listing status.',
      listingId: config.listingId,
      listingNumber: config.listingNumber,
      listingStatus: config.status,
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, listingNumber: config.listingNumber, listingStatus: config.status }, null, 2))
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
  const report = await applyControlledProperty24StatusUpdate({
    supabase,
    property24,
    config,
    listingNumber: config.listingNumber,
    listingStatus: config.status,
  })
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    httpStatus: report.property24Response?.httpStatus || report.error?.httpStatus || null,
    portalCheck: report.portalCheck?.summary || report.portalCheck || null,
  }, null, 2))
  if (report.status === 'FAILED') process.exitCode = 1
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
