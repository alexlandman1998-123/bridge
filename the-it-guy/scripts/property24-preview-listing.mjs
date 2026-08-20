import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  createProperty24Arch9ListingPreview,
  fetchArch9ListingForProperty24Preview,
  fetchRecentArch9ListingsForProperty24Preview,
  loadProperty24ImageBytesForPreview,
  normalizeProperty24PreviewText,
} from '../server/services/property24Arch9ListingPreviewService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    listingId: '',
    agencyId: '',
    agentId: '',
    agentSourceReference: '',
    suburbId: '',
    propertyTypeId: '',
    expiryDate: '',
    listingNumber: '',
    photosChanged: true,
    loadImageBytes: false,
    maxImages: 20,
    listCandidates: false,
    limit: 10,
    output: '',
  }

  for (const arg of argv) {
    if (arg === '--photos-unchanged') {
      options.photosChanged = false
    } else if (arg === '--load-image-bytes') {
      options.loadImageBytes = true
    } else if (arg === '--list-candidates') {
      options.listCandidates = true
    } else if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizeProperty24PreviewText(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--agency-id=')) {
      options.agencyId = normalizeProperty24PreviewText(arg.slice('--agency-id='.length))
    } else if (arg.startsWith('--agent-id=')) {
      options.agentId = normalizeProperty24PreviewText(arg.slice('--agent-id='.length))
    } else if (arg.startsWith('--agent-source-reference=')) {
      options.agentSourceReference = normalizeProperty24PreviewText(arg.slice('--agent-source-reference='.length))
    } else if (arg.startsWith('--suburb-id=')) {
      options.suburbId = normalizeProperty24PreviewText(arg.slice('--suburb-id='.length))
    } else if (arg.startsWith('--property-type-id=')) {
      options.propertyTypeId = normalizeProperty24PreviewText(arg.slice('--property-type-id='.length))
    } else if (arg.startsWith('--expiry-date=')) {
      options.expiryDate = normalizeProperty24PreviewText(arg.slice('--expiry-date='.length))
    } else if (arg.startsWith('--listing-number=')) {
      options.listingNumber = normalizeProperty24PreviewText(arg.slice('--listing-number='.length))
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || 10
    } else if (arg.startsWith('--max-images=')) {
      options.maxImages = Number(arg.slice('--max-images='.length)) || 20
    } else if (arg.startsWith('--output=')) {
      options.output = normalizeProperty24PreviewText(arg.slice('--output='.length))
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
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24PreviewText(value)))
  return { ...fromFiles, ...processOverrides }
}

function buildConfig(options) {
  const env = loadEnv()
  const config = {
    supabaseUrl: normalizeProperty24PreviewText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeProperty24PreviewText(env.SUPABASE_SERVICE_ROLE_KEY),
    listingId: options.listingId,
    agencyId: normalizeProperty24PreviewText(options.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382'),
    agentId: normalizeProperty24PreviewText(options.agentId || env.PROPERTY24_DEFAULT_AGENT_ID),
    agentSourceReference: normalizeProperty24PreviewText(
      options.agentSourceReference || env.PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE,
    ),
    suburbId: normalizeProperty24PreviewText(options.suburbId || env.PROPERTY24_DEFAULT_SUBURB_ID),
    propertyTypeId: normalizeProperty24PreviewText(options.propertyTypeId || env.PROPERTY24_DEFAULT_PROPERTY_TYPE_ID),
    expiryDate: normalizeProperty24PreviewText(options.expiryDate || env.PROPERTY24_DEFAULT_EXPIRY_DATE),
    listingNumber: options.listingNumber,
    photosChanged: options.photosChanged,
    loadImageBytes: options.loadImageBytes,
    maxImages: options.maxImages,
    listCandidates: options.listCandidates,
    limit: options.limit,
  }

  config.missing = []
  if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.listCandidates) {
    if (!config.listingId) config.missing.push('--listing-id')
    if (!config.agentId) config.missing.push('--agent-id or PROPERTY24_DEFAULT_AGENT_ID')
    if (!config.agentSourceReference) config.missing.push('--agent-source-reference or PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE')
    if (!config.suburbId) config.missing.push('--suburb-id or PROPERTY24_DEFAULT_SUBURB_ID')
  }

  return config
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-real-listing-preview.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)

  if (config.missing.length) {
    const report = {
      phase: 'property24-real-listing-preview',
      generatedAt: new Date().toISOString(),
      safety: {
        property24ApiCalled: false,
        databaseWritten: false,
        listingPublished: false,
      },
      status: 'BLOCKED',
      missingConfiguration: config.missing,
      nextStep: 'Add the missing values, then run this command again.',
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: config.missing }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (config.listCandidates) {
    const candidates = await fetchRecentArch9ListingsForProperty24Preview({ client, limit: config.limit })
    const report = {
      phase: 'property24-real-listing-candidates',
      generatedAt: new Date().toISOString(),
      safety: {
        property24ApiCalled: false,
        databaseWritten: false,
        listingPublished: false,
      },
      status: 'FOUND',
      count: candidates.length,
      candidates,
      nextStep: 'Pick one candidate id and pass it as --listing-id to generate the Property24 preview.',
    }
    const output = writeReport(report, options.output || path.join(appRoot, 'outputs', 'property24-real-listing-candidates.json'))
    console.log(JSON.stringify({
      status: report.status,
      output,
      count: report.count,
      candidates: report.candidates,
    }, null, 2))
    return
  }

  const bundle = await fetchArch9ListingForProperty24Preview({ client, listingId: config.listingId })
  let previewMedia = bundle.media
  let imageByteLoad = null
  if (config.loadImageBytes) {
    const loaded = await loadProperty24ImageBytesForPreview({
      media: bundle.media,
      storageClient: client,
      storageBaseUrl: config.supabaseUrl,
      maxImages: config.maxImages,
    })
    previewMedia = loaded.media
    imageByteLoad = {
      summary: loaded.summary,
      results: loaded.results,
    }
  }

  const report = createProperty24Arch9ListingPreview({
    ...bundle,
    media: previewMedia,
    agentMapping: {
      property24AgentId: config.agentId,
      sourceReference: config.agentSourceReference,
    },
    catalogMapping: {
      suburbId: config.suburbId,
      propertyTypeId: config.propertyTypeId,
    },
    options: {
      agencyId: config.agencyId,
      expiryDate: config.expiryDate,
      listingNumber: config.listingNumber,
      photosChanged: config.photosChanged,
    },
    imageByteLoad,
  })

  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    canPreview: report.canPreview,
    canSubmit: report.canSubmit,
    dataBlockers: report.dataBlockers,
    technicalBlockers: report.technicalBlockers,
    summary: report.summary,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  }, null, 2))
  process.exitCode = 1
})
