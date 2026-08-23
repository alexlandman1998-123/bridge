import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  PRIVATE_PROPERTY_SANDBOX_BASE_URL,
  createPrivatePropertyClient,
  normalizePrivatePropertyText,
  summarizePrivatePropertySoapResponse,
} from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    output: null,
    failOnBlocked: false,
    skipEventFeed: false,
    continuationKey: '0',
    startDateTime: '',
  }

  for (const arg of argv) {
    if (arg === '--fail-on-blocked') {
      options.failOnBlocked = true
    } else if (arg === '--skip-event-feed') {
      options.skipEventFeed = true
    } else if (arg.startsWith('--output=')) {
      options.output = normalizePrivatePropertyText(arg.slice('--output='.length))
    } else if (arg.startsWith('--continuation-key=')) {
      options.continuationKey = normalizePrivatePropertyText(arg.slice('--continuation-key='.length)) || '0'
    } else if (arg.startsWith('--start-date-time=')) {
      options.startDateTime = normalizePrivatePropertyText(arg.slice('--start-date-time='.length))
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
  const files = ['.env', '.env.local', '.env.private-property.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizePrivatePropertyText(value)),
  )
  return { ...fromFiles, ...processOverrides }
}

function buildConfig() {
  const env = loadEnv()
  const baseUrl = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_BASE_URL) || PRIVATE_PROPERTY_SANDBOX_BASE_URL
  const username = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_USERNAME || env.PRIVATE_PROPERTY_USER_NAME)
  const password = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_PASSWORD)
  const branchGuid = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_BRANCH_GUID || env.PRIVATE_PROPERTY_GUID)
  const vendor = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_VENDOR)
  const environment = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_ENVIRONMENT || env.PRIVATE_PROPERTY_ENV || 'sandbox')

  const missing = []
  if (!username) missing.push('PRIVATE_PROPERTY_USERNAME')
  if (!password) missing.push('PRIVATE_PROPERTY_PASSWORD')
  if (!branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID')

  return {
    baseUrl,
    username,
    password,
    branchGuid,
    vendor,
    environment,
    missing,
  }
}

function createInitialReport(config) {
  return {
    phase: 'private-property-phase1-smoke',
    generatedAt: new Date().toISOString(),
    environment: config.environment,
    baseUrl: config.baseUrl,
    vendor: config.vendor || null,
    username: config.username || null,
    branchGuid: config.branchGuid || null,
    credentialsConfigured: config.missing.length === 0,
    summary: {
      status: 'BLOCKED',
      passCount: 0,
      blockedCount: 0,
      skippedCount: 0,
    },
    checks: [],
    nextPhase: 'Phase 2: create sandbox agents with UpdateAgent and capture Private Property AgentId values.',
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
      summary: result.summary || summarizePrivatePropertySoapResponse(result.method || name, result.data || ''),
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
        faultCode: error.faultCode || '',
        faultString: error.faultString || '',
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse(name, error.responseBody) : null,
      },
    }
    report.checks.push(check)
    report.summary.blockedCount += 1
    return check
  }
}

function addSkippedCheck(report, name, reason) {
  report.checks.push({ name, status: 'SKIPPED', reason })
  report.summary.skippedCount += 1
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-phase1-smoke.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig()
  const report = createInitialReport(config)

  if (config.missing.length) {
    report.missingConfiguration = config.missing
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.summary.status, output, missingConfiguration: config.missing }, null, 2))
    if (options.failOnBlocked) process.exitCode = 1
    return
  }

  const client = createPrivatePropertyClient({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
  })

  const sampleToken = client.createToken()
  report.tokenProbe = {
    generated: Boolean(sampleToken.digest),
    userName: sampleToken.userName,
    stampTime: sampleToken.stampTime,
    expires: sampleToken.expires,
    uidLength: sampleToken.uid.length,
    digestLength: sampleToken.digest.length,
  }

  await runCheck(report, 'GetCountries authenticated SOAP call', () => client.getCountries())

  if (options.skipEventFeed) {
    addSkippedCheck(report, 'GetListingEventFeedByBranch authenticated SOAP call', 'Skipped by --skip-event-feed.')
  } else {
    await runCheck(report, 'GetListingEventFeedByBranch authenticated SOAP call', () =>
      client.getListingEventFeedByBranch({
        branchGuid: config.branchGuid,
        continuationKey: options.continuationKey,
        startDateTime: options.startDateTime,
      }))
  }

  report.summary.status = report.summary.blockedCount > 0 ? 'BLOCKED' : 'PASS'
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.summary.status,
    output,
    passCount: report.summary.passCount,
    blockedCount: report.summary.blockedCount,
    skippedCount: report.summary.skippedCount,
  }, null, 2))

  if (options.failOnBlocked && report.summary.blockedCount > 0) process.exitCode = 1
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
