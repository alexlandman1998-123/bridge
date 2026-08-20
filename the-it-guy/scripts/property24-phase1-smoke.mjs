import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../server/services/property24Client.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    agencyId: null,
    countryId: null,
    provinceId: null,
    cityId: null,
    output: null,
    failOnBlocked: false,
  }

  for (const arg of argv) {
    if (arg === '--fail-on-blocked') {
      options.failOnBlocked = true
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
  const baseUrl = normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL
  const username = normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME)
  const password = normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD)
  const agencyId = normalizeProperty24Text(options.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382')
  const userGroupId = normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID)
  const countryId = normalizeProperty24Text(options.countryId || env.PROPERTY24_DEFAULT_COUNTRY_ID)
  const provinceId = normalizeProperty24Text(options.provinceId || env.PROPERTY24_DEFAULT_PROVINCE_ID)
  const cityId = normalizeProperty24Text(options.cityId || env.PROPERTY24_DEFAULT_CITY_ID)

  const missing = []
  if (!username) missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!password) missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (!agencyId) missing.push('PROPERTY24_DEFAULT_AGENCY_ID or --agency-id')

  return {
    baseUrl,
    username,
    password,
    agencyId,
    userGroupId,
    countryId,
    provinceId,
    cityId,
    missing,
  }
}

function createInitialReport(config) {
  return {
    phase: 'property24-syndication-phase1',
    generatedAt: new Date().toISOString(),
    environment: config.baseUrl.includes('property24-test.com') ? 'exdev' : 'unknown',
    baseUrl: config.baseUrl,
    agencyId: config.agencyId,
    userGroupId: config.userGroupId,
    credentialsConfigured: config.missing.length === 0,
    summary: {
      status: 'BLOCKED',
      passCount: 0,
      blockedCount: 0,
    },
    checks: [],
    nextPhase: 'Phase 2: map Arch9 fields/agents/suburbs/property types to Property24 requirements.',
  }
}

async function runCheck(report, name, fn) {
  const startedAt = Date.now()
  try {
    const result = await fn()
    const check = {
      name,
      status: 'PASS',
      httpStatus: result.status,
      durationMs: result.durationMs ?? Date.now() - startedAt,
      summary: summarizeProperty24Payload(result.data),
    }
    report.checks.push(check)
    report.summary.passCount += 1
    return check
  } catch (error) {
    const check = {
      name,
      status: 'BLOCKED',
      httpStatus: error.status || null,
      durationMs: Date.now() - startedAt,
      error: {
        name: error.name || 'Error',
        message: error.message,
        statusText: error.statusText || '',
        responseSummary: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
      },
    }
    report.checks.push(check)
    report.summary.blockedCount += 1
    return check
  }
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-phase1-smoke.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)
  const report = createInitialReport(config)

  if (config.missing.length) {
    report.missingConfiguration = config.missing
    report.summary.status = 'BLOCKED'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.summary.status, output, missingConfiguration: config.missing }, null, 2))
    if (options.failOnBlocked) process.exitCode = 1
    return
  }

  const client = createProperty24Client({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
    userGroupId: config.userGroupId,
  })

  await runCheck(report, 'unauthenticated echo endpoint reachable', () => client.echo())
  await runCheck(report, 'authenticated echo accepts Basic Auth', () => client.echoAuthenticated())
  await runCheck(report, `fetch agencies visible to credential`, () => client.fetchAgencies())
  await runCheck(report, `fetch agency ${config.agencyId}`, () => client.fetchAgency(config.agencyId))
  await runCheck(report, `fetch agency ${config.agencyId} agents`, () => client.fetchAgencyAgents(config.agencyId))
  await runCheck(report, 'fetch countries', () => client.fetchCountries())
  await runCheck(report, 'fetch provinces', () => client.fetchProvinces(config.countryId || undefined))
  await runCheck(report, 'fetch property types', () => client.fetchPropertyTypes(config.countryId || undefined))
  await runCheck(report, 'fetch listing types', () => client.fetchListingTypes(config.countryId || undefined))

  if (config.provinceId) {
    await runCheck(report, `fetch cities for province ${config.provinceId}`, () => client.fetchCities(config.provinceId))
  } else {
    report.checks.push({
      name: 'fetch cities',
      status: 'SKIPPED',
      reason: 'Set PROPERTY24_DEFAULT_PROVINCE_ID or pass --province-id=<id> to avoid fetching every city.',
    })
  }

  if (config.cityId) {
    await runCheck(report, `fetch suburbs for city ${config.cityId}`, () => client.fetchSuburbs(config.cityId))
  } else {
    report.checks.push({
      name: 'fetch suburbs',
      status: 'SKIPPED',
      reason: 'Set PROPERTY24_DEFAULT_CITY_ID or pass --city-id=<id> to avoid fetching every suburb.',
    })
  }

  report.summary.status = report.summary.blockedCount > 0 ? 'BLOCKED' : 'PASS'
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.summary.status,
    output,
    passCount: report.summary.passCount,
    blockedCount: report.summary.blockedCount,
    skippedCount: report.checks.filter((check) => check.status === 'SKIPPED').length,
  }, null, 2))

  if (options.failOnBlocked && report.summary.blockedCount > 0) process.exitCode = 1
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
