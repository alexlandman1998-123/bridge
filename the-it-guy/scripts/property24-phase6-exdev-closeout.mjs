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
import {
  PROPERTY24_PHASE6,
  executeProperty24Phase6Closeout,
} from '../server/property24/phase6CloseoutService.js'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = fileURLToPath(new URL('..', import.meta.url))

export function parseProperty24Phase6Args(argv = []) {
  const options = {
    apply: false,
    output: path.join(appRoot, 'artifacts/property24-vetting/phase6-closeout.json'),
  }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg.startsWith('--output=')) options.output = normalizeProperty24Text(arg.slice('--output='.length))
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!options.output) throw new Error('--output must not be empty.')
  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function loadConfig() {
  const files = ['.env', '.env.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)))
  const env = { ...fromFiles, ...processOverrides }
  const config = {
    baseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    userGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
  }
  config.missing = []
  if (!config.username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  return config
}

async function writeJsonAtomic(filePath, value) {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  const temporaryPath = `${resolvedPath}.${process.pid}.tmp`
  await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true })
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fs.promises.rename(temporaryPath, resolvedPath)
  } finally {
    await fs.promises.unlink(temporaryPath).catch(() => {})
  }
  return resolvedPath
}

export async function runProperty24Phase6(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseProperty24Phase6Args(argv)
  const config = dependencies.config || loadConfig()
  if (config.missing?.length) throw new Error(`Missing Property24 configuration: ${config.missing.join(', ')}.`)
  if (normalizeProperty24Text(config.baseUrl).replace(/\/+$/g, '') !== PROPERTY24_EXDEV_BASE_URL) {
    throw new Error(`Phase 6 is locked to Property24 XDev; received ${config.baseUrl}.`)
  }
  const property24 = dependencies.property24 || createProperty24Client(config)
  const report = await executeProperty24Phase6Closeout({
    property24,
    apply: options.apply,
    fromDate: dependencies.fromDate,
    wait: dependencies.wait,
  })
  const output = await writeJsonAtomic(options.output, report)
  console.log(JSON.stringify({
    phase: 'property24-phase6-exdev-closeout',
    status: report.status,
    environment: report.environment,
    agencyId: PROPERTY24_PHASE6.agencyId,
    output,
    completed: report.completed?.map((item) => ({ step: item.step, status: item.status })) || [],
    final: report.final || null,
    error: report.error || null,
  }, null, 2))
  if (['PHASE6_BLOCKED', 'PHASE6_PARTIAL_FAILURE'].includes(report.status)) process.exitCode = 1
  return { report, output }
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  runProperty24Phase6().catch((error) => {
    console.error(JSON.stringify({
      phase: 'property24-phase6-exdev-closeout',
      status: 'FAILED',
      name: error.name || 'Error',
      message: error.message,
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }, null, 2))
    process.exitCode = 1
  })
}
