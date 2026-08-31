import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createProperty24MigrationMappingPlan } from '../server/property24/migrationMappingService.js'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = fileURLToPath(new URL('..', import.meta.url))

export function parseProperty24MigrationMappingArgs(argv = []) {
  const options = {
    agents: '',
    listings: '',
    images: '',
    agencyId: null,
    organisationId: '',
    environment: 'exdev',
    catalog: '',
    arch9Agents: '',
    existingAgentMappings: '',
    output: path.join(appRoot, 'outputs/property24-migration-data-mapping.json'),
    strict: false,
  }
  for (const arg of argv) {
    if (arg === '--strict') options.strict = true
    else if (arg === '--apply') throw new Error('This command creates a mapping plan only and does not support --apply.')
    else if (arg.startsWith('--agents=')) options.agents = arg.slice('--agents='.length).trim()
    else if (arg.startsWith('--listings=')) options.listings = arg.slice('--listings='.length).trim()
    else if (arg.startsWith('--images=')) options.images = arg.slice('--images='.length).trim()
    else if (arg.startsWith('--agency-id=')) options.agencyId = arg.slice('--agency-id='.length).trim()
    else if (arg.startsWith('--organisation-id=')) options.organisationId = arg.slice('--organisation-id='.length).trim()
    else if (arg.startsWith('--environment=')) options.environment = arg.slice('--environment='.length).trim()
    else if (arg.startsWith('--catalog=')) options.catalog = arg.slice('--catalog='.length).trim()
    else if (arg.startsWith('--arch9-agents=')) options.arch9Agents = arg.slice('--arch9-agents='.length).trim()
    else if (arg.startsWith('--existing-agent-mappings=')) options.existingAgentMappings = arg.slice('--existing-agent-mappings='.length).trim()
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length).trim()
    else throw new Error(`Unknown option: ${arg}`)
  }
  for (const key of ['agents', 'listings', 'images']) {
    if (!options[key]) throw new Error(`--${key}=<csv-path> is required.`)
  }
  return options
}

function resolveFile(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

function readTextSource(filePath) {
  const resolvedPath = resolveFile(filePath)
  return { path: resolvedPath, text: fs.readFileSync(resolvedPath, 'utf8') }
}

function readJson(filePath, fallback) {
  if (!filePath) return fallback
  return JSON.parse(fs.readFileSync(resolveFile(filePath), 'utf8'))
}

function asArray(value, keys = []) {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

async function writeJsonAtomic(filePath, value) {
  const resolvedPath = resolveFile(filePath)
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

export async function runProperty24MigrationMapping(argv = process.argv.slice(2)) {
  const options = parseProperty24MigrationMappingArgs(argv)
  const catalog = readJson(options.catalog, {})
  const arch9AgentsSource = readJson(options.arch9Agents, [])
  const existingMappingsSource = readJson(options.existingAgentMappings, [])
  const report = createProperty24MigrationMappingPlan({
    agents: readTextSource(options.agents),
    listings: readTextSource(options.listings),
    images: readTextSource(options.images),
    expectedAgencyId: options.agencyId,
    organisationId: options.organisationId,
    environment: options.environment,
    catalog,
    arch9Agents: asArray(arch9AgentsSource, ['agents', 'profiles', 'items', 'data']),
    existingAgentMappings: asArray(existingMappingsSource, ['mappings', 'items', 'data']),
  })
  const output = await writeJsonAtomic(options.output, report)
  console.log(JSON.stringify({
    phase: report.phase,
    mode: report.mode,
    status: report.status,
    output,
    context: report.context || null,
    summary: report.summary || null,
    resolutionQueue: report.resolutionQueue?.slice(0, 20) || [],
    safety: report.safety,
  }, null, 2))
  if (report.status === 'BLOCKED' || (options.strict && report.status !== 'READY')) process.exitCode = 1
  return { report, output }
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  runProperty24MigrationMapping().catch((error) => {
    console.error(JSON.stringify({
      phase: 'property24-migration-import-phase2-data-mapping',
      mode: 'mapping-plan',
      status: 'FAILED',
      message: error.message,
      safety: { property24WritesPerformed: false, databaseWritesPerformed: false },
    }, null, 2))
    process.exitCode = 1
  })
}
