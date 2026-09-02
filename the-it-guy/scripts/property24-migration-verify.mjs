import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createProperty24Client } from '../server/services/property24Client.js'
import { verifyProperty24Migration } from '../server/property24/migrationVerificationService.js'

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

export function parseProperty24MigrationVerifyArgs(argv = []) {
  const artifacts = path.join(appRoot, 'artifacts/property24-vetting')
  const options = {
    mapping: path.join(artifacts, 'migration-phase2-data-mapping.json'),
    images: path.join(artifacts, 'migration-phase4-image-import-apply.json'),
    rerun: path.join(artifacts, 'migration-phase5-duplicate-protection-rerun.json'),
    output: path.join(artifacts, 'migration-phase5-final-evidence.json'),
    markdownOutput: path.join(artifacts, 'migration-phase5-final-evidence.md'),
    fromDate: '',
    concurrency: 4,
    environment: 'exdev',
  }
  for (const arg of argv) {
    if (arg.startsWith('--mapping=')) options.mapping = normalize(arg.slice('--mapping='.length))
    else if (arg.startsWith('--images=')) options.images = normalize(arg.slice('--images='.length))
    else if (arg.startsWith('--rerun=')) options.rerun = normalize(arg.slice('--rerun='.length))
    else if (arg.startsWith('--output=')) options.output = normalize(arg.slice('--output='.length))
    else if (arg.startsWith('--markdown-output=')) options.markdownOutput = normalize(arg.slice('--markdown-output='.length))
    else if (arg.startsWith('--from-date=')) options.fromDate = normalize(arg.slice('--from-date='.length))
    else if (arg.startsWith('--concurrency=')) options.concurrency = positiveInteger(arg.slice('--concurrency='.length), '--concurrency')
    else if (arg.startsWith('--environment=')) options.environment = normalize(arg.slice('--environment='.length)).toLowerCase()
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!options.mapping || !options.images || !options.rerun || !options.output || !options.markdownOutput) throw new Error('All verification input and output paths are required.')
  if (options.concurrency > 8) throw new Error('--concurrency must be 8 or less.')
  if (!['exdev', 'production'].includes(options.environment)) throw new Error('--environment must be exdev or production.')
  return options
}

function absolute(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

function readJsonWithHash(filePath) {
  const resolved = absolute(filePath)
  const bytes = fs.readFileSync(resolved)
  return {
    path: resolved,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    value: JSON.parse(bytes.toString('utf8')),
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
  if (missing.length) throw new Error(`Missing verification configuration: ${missing.join(', ')}.`)
  return config
}

function createClients(config) {
  return {
    supabase: createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    property24: createProperty24Client({
      baseUrl: config.property24BaseUrl,
      username: config.property24Username,
      password: config.property24Password,
      apiVersion: config.property24ApiVersion,
    }),
  }
}

async function writeAtomic(filePath, contents) {
  const resolved = absolute(filePath)
  const temporary = `${resolved}.${process.pid}.tmp`
  await fs.promises.mkdir(path.dirname(resolved), { recursive: true })
  try {
    await fs.promises.writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 })
    await fs.promises.rename(temporary, resolved)
  } finally {
    await fs.promises.unlink(temporary).catch(() => {})
  }
  await fs.promises.chmod(resolved, 0o600)
  return resolved
}

export function renderProperty24MigrationVerificationMarkdown(report = {}) {
  const lines = [
    '# Property24 migration final verification',
    '',
    `Status: **${report.status || 'UNKNOWN'}**`,
    '',
    `Generated: ${report.generatedAt || 'unknown'}`,
    '',
    `Agency: ${report.context?.agencyId || 'unknown'} (${report.context?.environment || 'unknown'})`,
    '',
    '## Summary',
    '',
    `- Checks passed: ${report.summary?.passedCheckCount || 0}/${report.summary?.checkCount || 0}`,
    `- Duplicate agent mappings: ${report.summary?.duplicateAgentMappingCount ?? 'unknown'}`,
    `- Duplicate listing identities: ${report.summary?.duplicateListingIdentityCount ?? 'unknown'}`,
    `- Duplicate sync rows: ${report.summary?.duplicateSyncCount ?? 'unknown'}`,
    `- Duplicate image rows: ${report.summary?.duplicateImageRowCount ?? 'unknown'}`,
    `- Unexpected images: ${report.summary?.unexpectedImageCount ?? 'unknown'}`,
    `- Verified images: ${report.summary?.verifiedImageCount || 0}/${report.summary?.expectedImageCount || 0}`,
    '',
    '## Listings',
    '',
    '| Property24 # | Type | Property24 status | On portal | Arch9 status | Images |',
    '|---:|---|---|---|---|---:|',
    ...(report.listings || []).map((listing) => `| ${listing.listingNumber} | ${listing.listingType} | ${listing.property24Status} | ${listing.isOnPortal} | ${listing.arch9ListingStatus} | ${listing.mediaCount} |`),
    '',
    '## Agents',
    '',
    '| Property24 agent | Source reference | Property24 status | Arch9 mapping | Arch9 login |',
    '|---:|---|---|---|---|',
    ...(report.agents || []).map((agent) => `| ${agent.property24AgentId} | ${agent.sourceReference} | ${agent.property24Status} | ${agent.arch9MappingStatus} | ${agent.arch9UserId || 'external mapping only'} |`),
    '',
    '## Duplicate-protection rerun',
    '',
    `- Status: ${report.duplicateProtection?.rerunStatus || 'unknown'}`,
    `- Listings created: ${report.duplicateProtection?.createListingCount ?? 'unknown'}`,
    `- Stale media rows: ${report.duplicateProtection?.staleMediaRowCount ?? 'unknown'}`,
    `- Images uploaded again: ${report.duplicateProtection?.uploadedImageCount ?? 'unknown'}`,
    `- Images reused: ${report.duplicateProtection?.reusedImageCount ?? 'unknown'}`,
    '',
    '## Failed checks',
    '',
    ...(report.failures?.length ? report.failures.map((entry) => `- ${entry.id}: ${entry.detail}`) : ['None.']),
    '',
    'This verification was read-only against Property24, Arch9 database records, and Supabase Storage.',
    '',
  ]
  return lines.join('\n')
}

export async function runProperty24MigrationVerify(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseProperty24MigrationVerifyArgs(argv)
  const mapping = readJsonWithHash(options.mapping)
  const images = readJsonWithHash(options.images)
  const rerun = readJsonWithHash(options.rerun)
  const config = dependencies.config || loadConfig(options.environment)
  const clients = dependencies.clients || createClients(config)
  const generatedAt = dependencies.generatedAt || new Date().toISOString()
  const report = await verifyProperty24Migration({
    supabase: clients.supabase,
    property24: clients.property24,
    mappingPlan: mapping.value,
    imageManifest: images.value,
    rerunEvidence: rerun.value,
    fromDate: options.fromDate,
    fetchImpl: dependencies.fetchImpl || globalThis.fetch,
    concurrency: options.concurrency,
    generatedAt,
    inputHashes: {
      mapping: { path: mapping.path, sha256: mapping.sha256 },
      images: { path: images.path, sha256: images.sha256 },
      duplicateProtectionRerun: { path: rerun.path, sha256: rerun.sha256 },
    },
  })
  const output = await writeAtomic(options.output, `${JSON.stringify(report, null, 2)}\n`)
  const markdownOutput = await writeAtomic(options.markdownOutput, renderProperty24MigrationVerificationMarkdown(report))
  console.log(JSON.stringify({
    phase: report.phase,
    status: report.status,
    output,
    markdownOutput,
    summary: report.summary,
    duplicateProtection: report.duplicateProtection,
    listings: report.listings,
    agents: report.agents,
    failures: report.failures,
    safety: report.safety,
  }, null, 2))
  if (report.status !== 'VERIFIED') process.exitCode = 1
  return { report, output, markdownOutput }
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  runProperty24MigrationVerify().catch((error) => {
    console.error(JSON.stringify({
      phase: 'property24-migration-import-phase5-final-verification',
      status: 'FAILED',
      message: error.message,
      safety: { property24WritesPerformed: false, databaseWritesPerformed: false, storageWritesPerformed: false },
    }, null, 2))
    process.exitCode = 1
  })
}
