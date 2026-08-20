import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  createProperty24SynchronisationPreview,
  createRedactedProperty24SynchronisationPreview,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../server/property24/index.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    organisationId: '',
    agencyId: '',
    countryId: '',
    provinceId: '',
    cityId: '',
    output: '',
  }

  for (const arg of argv) {
    if (arg.startsWith('--organisation-id=')) {
      options.organisationId = normalizeProperty24Text(arg.slice('--organisation-id='.length))
    } else if (arg.startsWith('--agency-id=')) {
      options.agencyId = normalizeProperty24Text(arg.slice('--agency-id='.length))
    } else if (arg.startsWith('--country-id=')) {
      options.countryId = normalizeProperty24Text(arg.slice('--country-id='.length))
    } else if (arg.startsWith('--province-id=')) {
      options.provinceId = normalizeProperty24Text(arg.slice('--province-id='.length))
    } else if (arg.startsWith('--city-id=')) {
      options.cityId = normalizeProperty24Text(arg.slice('--city-id='.length))
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
    baseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    userGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
    supabaseUrl: normalizeProperty24Text(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeProperty24Text(env.SUPABASE_SERVICE_ROLE_KEY),
    organisationId: normalizeProperty24Text(options.organisationId || env.PROPERTY24_DEFAULT_ORGANISATION_ID),
    agencyId: normalizeProperty24Text(options.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382'),
    countryId: normalizeProperty24Text(options.countryId || env.PROPERTY24_DEFAULT_COUNTRY_ID),
    provinceId: normalizeProperty24Text(options.provinceId || env.PROPERTY24_DEFAULT_PROVINCE_ID),
    cityId: normalizeProperty24Text(options.cityId || env.PROPERTY24_DEFAULT_CITY_ID),
  }

  config.missing = []
  if (!config.username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.organisationId) config.missing.push('PROPERTY24_DEFAULT_ORGANISATION_ID or --organisation-id')
  if (!config.agencyId) config.missing.push('PROPERTY24_DEFAULT_AGENCY_ID or --agency-id')
  return config
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-sync-preview.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)

  if (config.missing.length) {
    const report = {
      phase: 'property24-agent-catalog-synchronisation',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED',
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
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
    userGroupId: config.userGroupId,
  })

  const report = await createProperty24SynchronisationPreview({
    supabase,
    property24,
    organisationId: config.organisationId,
    agencyId: config.agencyId,
    countryId: config.countryId,
    provinceId: config.provinceId,
    cityId: config.cityId,
  })
  const redacted = createRedactedProperty24SynchronisationPreview(report)
  const output = writeReport(redacted, options.output)
  console.log(JSON.stringify({
    status: redacted.summary.ready ? 'READY' : 'NEEDS_REVIEW',
    output,
    agents: redacted.summary.agents,
    catalog: redacted.summary.catalog,
  }, null, 2))
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
