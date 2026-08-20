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
    apply: false,
    firstname: '',
    lastname: '',
    email: '',
    mobile: '',
    sourceReference: '',
    agencyId: '',
    countryId: '',
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
    } else if (arg.startsWith('--firstname=')) {
      options.firstname = normalizeProperty24Text(arg.slice('--firstname='.length))
    } else if (arg.startsWith('--lastname=')) {
      options.lastname = normalizeProperty24Text(arg.slice('--lastname='.length))
    } else if (arg.startsWith('--email=')) {
      options.email = normalizeProperty24Text(arg.slice('--email='.length))
    } else if (arg.startsWith('--mobile=')) {
      options.mobile = normalizeProperty24Text(arg.slice('--mobile='.length))
    } else if (arg.startsWith('--source-reference=')) {
      options.sourceReference = normalizeProperty24Text(arg.slice('--source-reference='.length))
    } else if (arg.startsWith('--agency-id=')) {
      options.agencyId = normalizeProperty24Text(arg.slice('--agency-id='.length))
    } else if (arg.startsWith('--country-id=')) {
      options.countryId = normalizeProperty24Text(arg.slice('--country-id='.length))
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
    agencyId: normalizeProperty24Text(options.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382'),
    userGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
    countryId: normalizeProperty24Text(options.countryId || env.PROPERTY24_DEFAULT_COUNTRY_ID || '1'),
  }
  config.missing = []
  if (!config.username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (!config.agencyId) config.missing.push('PROPERTY24_DEFAULT_AGENCY_ID or --agency-id')
  if (!config.countryId) config.missing.push('PROPERTY24_DEFAULT_COUNTRY_ID or --country-id')
  return config
}

function buildAgentPayload(options, config) {
  const payload = {
    firstname: options.firstname,
    lastname: options.lastname,
    receiveStatsMail: false,
    published: true,
    agencyId: Number(config.agencyId),
    sourceReference: options.sourceReference,
    mobileNumber: options.mobile,
    emailAddress: options.email,
    countryId: Number(config.countryId),
    status: 'Active',
    jobTitle: 'Agent',
  }

  const missing = []
  if (!payload.firstname) missing.push('--firstname')
  if (!payload.lastname) missing.push('--lastname')
  if (!payload.emailAddress) missing.push('--email')
  if (!payload.mobileNumber) missing.push('--mobile')
  if (!payload.sourceReference) missing.push('--source-reference')
  if (!Number.isInteger(payload.agencyId)) missing.push('--agency-id or PROPERTY24_DEFAULT_AGENCY_ID')
  if (!Number.isInteger(payload.countryId)) missing.push('--country-id or PROPERTY24_DEFAULT_COUNTRY_ID')

  return { payload, missing }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)
  const { payload, missing } = buildAgentPayload(options, config)

  if (config.missing.length || missing.length) {
    console.log(JSON.stringify({
      status: 'BLOCKED',
      missingConfiguration: config.missing,
      missingArguments: missing,
    }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    console.log(JSON.stringify({
      status: 'DRY_RUN',
      message: 'No Property24 write was made. Re-run with --apply to create the agent.',
      payload,
    }, null, 2))
    return
  }

  const client = createProperty24Client({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
    userGroupId: config.userGroupId,
  })

  const result = await client.createAgent(payload)
  console.log(JSON.stringify({
    status: 'CREATED',
    httpStatus: result.status,
    agentId: result.data,
    response: summarizeProperty24Payload(result.data),
    payload: {
      agencyId: payload.agencyId,
      countryId: payload.countryId,
      firstname: payload.firstname,
      lastname: payload.lastname,
      emailAddress: payload.emailAddress,
      mobileNumber: payload.mobileNumber,
      sourceReference: payload.sourceReference,
      status: payload.status,
    },
  }, null, 2))
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
