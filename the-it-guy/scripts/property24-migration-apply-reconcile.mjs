import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createProperty24Client } from '../server/services/property24Client.js'
import {
  createSupabaseProperty24MigrationRepository,
  executeProperty24MigrationApply,
} from '../server/property24/migrationApplyService.js'
import {
  PROPERTY24_MIGRATION_IMAGE_BUCKET,
  importProperty24MigrationImages,
} from '../server/property24/migrationImageImportService.js'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = fileURLToPath(new URL('..', import.meta.url))

function normalize(value) {
  return String(value ?? '').trim()
}

function parsePositiveInteger(value, label) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`)
  return number
}

export function parseProperty24MigrationApplyArgs(argv = []) {
  const artifactRoot = path.join(appRoot, 'artifacts/property24-vetting')
  const options = {
    apply: false,
    mapping: path.join(artifactRoot, 'migration-phase2-data-mapping.json'),
    imageOutput: path.join(artifactRoot, 'migration-phase4-image-import-apply.json'),
    output: path.join(artifactRoot, 'migration-phase4-apply-reconcile.json'),
    fromDate: '',
    concurrency: 4,
    attempts: 3,
    environment: 'exdev',
  }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg.startsWith('--mapping=')) options.mapping = normalize(arg.slice('--mapping='.length))
    else if (arg.startsWith('--image-output=')) options.imageOutput = normalize(arg.slice('--image-output='.length))
    else if (arg.startsWith('--output=')) options.output = normalize(arg.slice('--output='.length))
    else if (arg.startsWith('--from-date=')) options.fromDate = normalize(arg.slice('--from-date='.length))
    else if (arg.startsWith('--concurrency=')) options.concurrency = parsePositiveInteger(arg.slice('--concurrency='.length), '--concurrency')
    else if (arg.startsWith('--attempts=')) options.attempts = parsePositiveInteger(arg.slice('--attempts='.length), '--attempts')
    else if (arg.startsWith('--environment=')) options.environment = normalize(arg.slice('--environment='.length)).toLowerCase()
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!options.mapping || !options.imageOutput || !options.output) throw new Error('Mapping, image output and evidence output paths are required.')
  if (options.concurrency > 12) throw new Error('--concurrency must be 12 or less.')
  if (options.attempts > 5) throw new Error('--attempts must be 5 or less.')
  if (!['exdev', 'production'].includes(options.environment)) throw new Error('--environment must be exdev or production.')
  return options
}

function absolute(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(absolute(filePath), 'utf8'))
  } catch (error) {
    if (fallback !== null && error.code === 'ENOENT') return fallback
    throw error
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator < 0) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function loadConfig(environment = 'exdev') {
  const files = ['.env', '.env.local', environment === 'production'
    ? '.env.property24.production.local'
    : '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const env = { ...fromFiles, ...process.env }
  const config = {
    supabaseUrl: normalize(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalize(env.SUPABASE_SERVICE_ROLE_KEY),
    property24BaseUrl: normalize(env.PROPERTY24_BASE_URL),
    property24Username: normalize(env.PROPERTY24_BASIC_AUTH_USERNAME),
    property24Password: normalize(env.PROPERTY24_BASIC_AUTH_PASSWORD),
    property24UserGroupId: normalize(env.PROPERTY24_USER_GROUP_ID),
    property24ApiVersion: normalize(env.PROPERTY24_API_VERSION) || (environment === 'production' ? 'v55' : 'v53'),
  }
  const missing = Object.entries(config).filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) throw new Error(`Missing apply/reconcile configuration: ${missing.join(', ')}.`)
  return config
}

async function writeJsonAtomic(filePath, value) {
  const resolved = absolute(filePath)
  const temporary = `${resolved}.${process.pid}.tmp`
  await fs.promises.mkdir(path.dirname(resolved), { recursive: true })
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    await fs.promises.rename(temporary, resolved)
  } finally {
    await fs.promises.unlink(temporary).catch(() => {})
  }
  await fs.promises.chmod(resolved, 0o600)
  return resolved
}

function createClients(config) {
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const property24 = createProperty24Client({
    baseUrl: config.property24BaseUrl,
    username: config.property24Username,
    password: config.property24Password,
    userGroupId: config.property24UserGroupId,
    apiVersion: config.property24ApiVersion,
  })
  return { supabase, property24 }
}

export async function runProperty24MigrationApplyReconcile(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseProperty24MigrationApplyArgs(argv)
  const mappingPlan = readJson(options.mapping)
  const config = dependencies.config || loadConfig(options.environment)
  const clients = dependencies.clients || createClients(config)
  const repository = dependencies.repository || createSupabaseProperty24MigrationRepository(clients.supabase)
  const generatedAt = dependencies.generatedAt || new Date().toISOString()
  const preflight = await executeProperty24MigrationApply({
    repository,
    property24: clients.property24,
    mappingPlan,
    apply: false,
    fromDate: options.fromDate,
    generatedAt,
    idFactory: dependencies.idFactory,
  })
  if (!options.apply || preflight.status !== 'DRY_RUN_READY') {
    const report = {
      ...preflight,
      requestedMode: options.apply ? 'apply' : 'dry-run',
      nextPhase: preflight.status === 'DRY_RUN_READY'
        ? 'Run again with --apply to upload the images, import the mapped rows and reconcile live Property24 status.'
        : 'Resolve the preflight blockers before apply.',
    }
    const output = await writeJsonAtomic(options.output, report)
    console.log(JSON.stringify({ status: report.status, mode: report.mode, output, summary: report.summary, blockers: report.blockers, warnings: report.warnings }, null, 2))
    if (options.apply || report.status === 'BLOCKED') process.exitCode = 1
    return { report, output }
  }

  const existingManifest = readJson(options.imageOutput, {})
  let checkpointQueue = Promise.resolve()
  const checkpoint = (manifest) => {
    checkpointQueue = checkpointQueue.then(() => writeJsonAtomic(options.imageOutput, manifest))
    return checkpointQueue
  }
  const imageManifest = await importProperty24MigrationImages({
    mappingPlan,
    storageClient: clients.supabase,
    existingManifest,
    apply: true,
    bucket: PROPERTY24_MIGRATION_IMAGE_BUCKET,
    listingIds: preflight.listingIds,
    concurrency: options.concurrency,
    attempts: options.attempts,
    fetchImpl: dependencies.fetchImpl || globalThis.fetch,
    dnsLookup: dependencies.dnsLookup,
    imageInspector: dependencies.imageInspector,
    onProgress: checkpoint,
    generatedAt,
  })
  await checkpointQueue
  await writeJsonAtomic(options.imageOutput, imageManifest)
  if (imageManifest.status !== 'COMPLETE') {
    const report = {
      ...preflight,
      status: 'BLOCKED',
      mode: 'apply',
      blockers: [{ code: 'image_import_incomplete', message: `Image import ended with ${imageManifest.status}; no Arch9 database rows were written.` }],
      imageManifest: { output: absolute(options.imageOutput), status: imageManifest.status, summary: imageManifest.summary },
      safety: { property24WritesPerformed: false, databaseWritesPerformed: false, storageWritesPerformed: imageManifest.safety?.storageWritesPerformed || false },
    }
    const output = await writeJsonAtomic(options.output, report)
    console.log(JSON.stringify({ status: report.status, output, blockers: report.blockers, imageSummary: imageManifest.summary }, null, 2))
    process.exitCode = 1
    return { report, output, imageManifest }
  }

  const result = await executeProperty24MigrationApply({
    repository,
    property24: clients.property24,
    mappingPlan,
    imageManifest,
    apply: true,
    fromDate: options.fromDate,
    generatedAt,
    idFactory: dependencies.idFactory,
  })
  const report = {
    ...result,
    imageManifest: { output: absolute(options.imageOutput), status: imageManifest.status, summary: imageManifest.summary },
    safety: {
      ...result.safety,
      storageWritesPerformed: imageManifest.safety?.storageWritesPerformed || false,
      property24WritesPerformed: false,
    },
  }
  const output = await writeJsonAtomic(options.output, report)
  console.log(JSON.stringify({
    status: report.status,
    mode: report.mode,
    output,
    summary: report.summary,
    imageSummary: imageManifest.summary,
    completed: report.completed,
    verification: report.verification?.summary || null,
    blockers: report.blockers,
    warnings: report.warnings,
    safety: report.safety,
  }, null, 2))
  if (report.status !== 'COMPLETE') process.exitCode = 1
  return { report, output, imageManifest }
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  runProperty24MigrationApplyReconcile().catch(async (error) => {
    const options = (() => {
      try { return parseProperty24MigrationApplyArgs(process.argv.slice(2)) } catch { return null }
    })()
    const report = {
      phase: 'property24-migration-import-phase4-apply-reconcile',
      status: 'FAILED',
      message: error.message,
      safety: { property24WritesPerformed: false },
    }
    if (options?.output) await writeJsonAtomic(options.output, report).catch(() => {})
    console.error(JSON.stringify(report, null, 2))
    process.exitCode = 1
  })
}
