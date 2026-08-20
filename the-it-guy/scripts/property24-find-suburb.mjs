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
    countryName: '',
    provinceName: '',
    cityName: '',
    suburbName: '',
    output: '',
  }

  for (const arg of argv) {
    if (arg.startsWith('--country=')) {
      options.countryName = normalizeProperty24Text(arg.slice('--country='.length))
    } else if (arg.startsWith('--province=')) {
      options.provinceName = normalizeProperty24Text(arg.slice('--province='.length))
    } else if (arg.startsWith('--city=')) {
      options.cityName = normalizeProperty24Text(arg.slice('--city='.length))
    } else if (arg.startsWith('--suburb=')) {
      options.suburbName = normalizeProperty24Text(arg.slice('--suburb='.length))
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
    countryName: options.countryName || 'South Africa',
    provinceName: options.provinceName,
    cityName: options.cityName,
    suburbName: options.suburbName,
  }

  config.missing = []
  if (!config.username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (!config.countryName) config.missing.push('--country')
  if (!config.provinceName) config.missing.push('--province')
  if (!config.cityName) config.missing.push('--city')
  if (!config.suburbName) config.missing.push('--suburb')
  return config
}

function getFoundSuburb(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (payload.found === false) return null
  if (payload.suburb && typeof payload.suburb === 'object') return payload.suburb
  return null
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-find-suburb.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)
  const report = {
    phase: 'property24-suburb-lookup',
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    query: {
      countryName: config.countryName,
      provinceName: config.provinceName,
      cityName: config.cityName,
      suburbName: config.suburbName,
    },
    summary: {
      status: 'BLOCKED',
      found: false,
      suburbId: null,
    },
  }

  if (config.missing.length) {
    report.missingConfiguration = config.missing
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.summary.status, output, missingConfiguration: config.missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createProperty24Client({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
    userGroupId: config.userGroupId,
  })

  const result = await client.findSuburb({
    countryName: config.countryName,
    provinceName: config.provinceName,
    cityName: config.cityName,
    suburbName: config.suburbName,
  })
  const suburb = getFoundSuburb(result.data)

  report.httpStatus = result.status
  report.durationMs = result.durationMs
  report.responseSummary = summarizeProperty24Payload(result.data)
  report.summary.status = suburb?.id ? 'FOUND' : 'NOT_FOUND'
  report.summary.found = Boolean(suburb?.id)
  report.summary.suburbId = suburb?.id || null
  report.suburb = suburb || null

  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.summary.status,
    output,
    suburbId: report.summary.suburbId,
    suburbName: suburb?.name || null,
    cityName: suburb?.cityName || null,
    provinceName: suburb?.provinceName || null,
  }, null, 2))

  if (!suburb?.id) process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name,
    message: error.message,
    httpStatus: error.status || null,
    response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  }, null, 2))
  process.exitCode = 1
})
