import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  PROPERTY24_MIGRATION_IMAGE_BUCKET,
  PROPERTY24_MIGRATION_IMAGE_MAX_BYTES,
  PROPERTY24_MIGRATION_IMAGE_SOURCE_HOST_SUFFIXES,
  importProperty24MigrationImages,
} from '../server/property24/migrationImageImportService.js'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = fileURLToPath(new URL('..', import.meta.url))

function normalize(value) {
  return String(value ?? '').trim()
}

function positiveInteger(value, label) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`)
  return number
}

export function parseProperty24MigrationImageImportArgs(argv = []) {
  const options = {
    apply: false,
    strict: false,
    resume: true,
    mapping: '',
    output: path.join(appRoot, 'outputs/property24-migration-image-import.json'),
    listingIds: '',
    bucket: PROPERTY24_MIGRATION_IMAGE_BUCKET,
    allowHosts: [],
    maxBytes: PROPERTY24_MIGRATION_IMAGE_MAX_BYTES,
    timeoutMs: 30_000,
    concurrency: 4,
    attempts: 3,
  }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--strict') options.strict = true
    else if (arg === '--resume') options.resume = true
    else if (arg === '--no-resume') options.resume = false
    else if (arg.startsWith('--mapping=')) options.mapping = normalize(arg.slice('--mapping='.length))
    else if (arg.startsWith('--output=')) options.output = normalize(arg.slice('--output='.length))
    else if (arg.startsWith('--listing-ids=')) options.listingIds = normalize(arg.slice('--listing-ids='.length))
    else if (arg.startsWith('--bucket=')) options.bucket = normalize(arg.slice('--bucket='.length))
    else if (arg.startsWith('--allow-host=')) options.allowHosts.push(normalize(arg.slice('--allow-host='.length)))
    else if (arg.startsWith('--max-bytes=')) options.maxBytes = positiveInteger(arg.slice('--max-bytes='.length), '--max-bytes')
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = positiveInteger(arg.slice('--timeout-ms='.length), '--timeout-ms')
    else if (arg.startsWith('--concurrency=')) options.concurrency = positiveInteger(arg.slice('--concurrency='.length), '--concurrency')
    else if (arg.startsWith('--attempts=')) options.attempts = positiveInteger(arg.slice('--attempts='.length), '--attempts')
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!options.mapping) throw new Error('--mapping=<phase2-mapping-plan.json> is required.')
  if (!options.output) throw new Error('--output=<image-import-manifest.json> is required.')
  if (!options.bucket) throw new Error('--bucket must not be empty.')
  if (options.concurrency > 12) throw new Error('--concurrency must be 12 or less.')
  if (options.attempts > 5) throw new Error('--attempts must be 5 or less.')
  return options
}

function resolveFile(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

function readJson(filePath, fallback = null) {
  if (!filePath) return fallback
  return JSON.parse(fs.readFileSync(resolveFile(filePath), 'utf8'))
}

function readExistingManifest(outputPath, resume) {
  if (!resume) return {}
  try {
    return readJson(outputPath, {}) || {}
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new Error(`Could not read the resume manifest: ${error.message}`)
  }
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

function loadSupabaseConfig() {
  const files = ['.env', '.env.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const env = { ...fromFiles, ...process.env }
  const url = normalize(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalize(env.SUPABASE_SERVICE_ROLE_KEY)
  const missing = []
  if (!url) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return { url, serviceRoleKey, missing }
}

function createAdminClient(config) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function assertBucketReady(client, bucketName) {
  const result = await client.storage.getBucket(bucketName)
  if (result.error || !result.data) {
    throw new Error(`Storage bucket ${bucketName} is unavailable. Deploy the listing-media storage migration before applying the image import.`)
  }
  if (!result.data.public) throw new Error(`Storage bucket ${bucketName} must be public because listing_media stores durable public URLs.`)
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

export async function runProperty24MigrationImageImport(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseProperty24MigrationImageImportArgs(argv)
  const mappingPlan = readJson(options.mapping)
  const listingIds = readJson(options.listingIds, {}) || {}
  const existingManifest = readExistingManifest(options.output, options.resume)
  const allowedHostSuffixes = options.allowHosts.length
    ? options.allowHosts
    : PROPERTY24_MIGRATION_IMAGE_SOURCE_HOST_SUFFIXES
  let storageClient = dependencies.storageClient || null
  if (options.apply && !storageClient) {
    const config = loadSupabaseConfig()
    if (config.missing.length) throw new Error(`Missing apply configuration: ${config.missing.join(', ')}.`)
    storageClient = createAdminClient(config)
  }
  if (options.apply && !dependencies.skipBucketPreflight) await assertBucketReady(storageClient, options.bucket)

  let writeQueue = Promise.resolve()
  const checkpoint = (manifest) => {
    writeQueue = writeQueue.then(() => writeJsonAtomic(options.output, manifest))
    return writeQueue
  }
  const manifest = await importProperty24MigrationImages({
    mappingPlan,
    storageClient,
    fetchImpl: dependencies.fetchImpl || globalThis.fetch,
    dnsLookup: dependencies.dnsLookup,
    imageInspector: dependencies.imageInspector,
    existingManifest,
    apply: options.apply,
    bucket: options.bucket,
    allowedHostSuffixes,
    listingIds,
    maxBytes: options.maxBytes,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    attempts: options.attempts,
    onProgress: options.apply ? checkpoint : null,
    generatedAt: dependencies.generatedAt,
  })
  await writeQueue
  const output = await writeJsonAtomic(options.output, manifest)
  console.log(JSON.stringify({
    phase: manifest.phase,
    mode: manifest.mode,
    status: manifest.status,
    output,
    context: manifest.context,
    summary: manifest.summary,
    failures: manifest.items?.filter((item) => item.status === 'failed').map((item) => ({
      listingNumber: item.listingNumber,
      sourceOrdinal: item.sourceOrdinal,
      error: item.error,
    })) || [],
    safety: manifest.safety,
  }, null, 2))
  if (manifest.status === 'BLOCKED' || manifest.status === 'PARTIAL' || (options.strict && manifest.status !== 'COMPLETE')) process.exitCode = 1
  return { manifest, output }
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  runProperty24MigrationImageImport().catch((error) => {
    console.error(JSON.stringify({
      phase: 'property24-migration-import-phase3-image-import',
      status: 'FAILED',
      message: error.message,
      safety: { databaseWritesPerformed: false, property24WritesPerformed: false },
    }, null, 2))
    process.exitCode = 1
  })
}
