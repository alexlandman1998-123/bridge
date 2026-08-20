import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  normalizeProperty24PreviewText,
} from '../server/property24/listingDataService.js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  applyControlledProperty24ListingPublish,
  applyProperty24ListingPublish,
  buildProperty24ListingSubmitPlan,
  createProperty24PublishReport,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../server/property24/index.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    apply: false,
    listingId: '',
    agencyId: '',
    agentId: '',
    agentSourceReference: '',
    suburbId: '',
    propertyTypeId: '',
    expiryDate: '',
    listingNumber: '',
    maxImages: 20,
    photosChanged: true,
    property24ListingUrl: '',
    output: '',
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
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
    } else if (arg.startsWith('--max-images=')) {
      options.maxImages = Number(arg.slice('--max-images='.length)) || 20
    } else if (arg === '--photos-unchanged') {
      options.photosChanged = false
    } else if (arg.startsWith('--property24-listing-url=')) {
      options.property24ListingUrl = normalizeProperty24PreviewText(arg.slice('--property24-listing-url='.length))
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
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)))
  return { ...fromFiles, ...processOverrides }
}

function buildConfig(options) {
  const env = loadEnv()
  const config = {
    property24BaseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    property24Username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    property24Password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    property24UserGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
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
    maxImages: options.maxImages,
    photosChanged: options.photosChanged,
    property24ListingUrl: options.property24ListingUrl,
    apply: options.apply,
  }

  config.missing = []
  if (!config.property24Username) config.missing.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.property24Password) config.missing.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.listingId) config.missing.push('--listing-id')
  if (!config.agentId) config.missing.push('--agent-id or PROPERTY24_DEFAULT_AGENT_ID')
  if (!config.agentSourceReference) config.missing.push('--agent-source-reference or PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE')
  if (!config.suburbId) config.missing.push('--suburb-id or PROPERTY24_DEFAULT_SUBURB_ID')
  return config
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'property24-publish-listing.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)

  if (config.missing.length) {
    const report = {
      phase: 'property24-publish-listing',
      generatedAt: new Date().toISOString(),
      status: 'BLOCKED',
      mode: config.apply ? 'APPLY' : 'DRY_RUN',
      safety: {
        property24ApiCalled: false,
        databaseWritten: false,
        listingPublished: false,
      },
      missingConfiguration: config.missing,
    }
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: config.missing }, null, 2))
    process.exitCode = 1
    return
  }

  const supabase = createSupabaseClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const preview = await buildProperty24ListingSubmitPlan({
    supabase,
    listingId: config.listingId,
    agencyId: config.agencyId,
    agentId: config.agentId,
    agentSourceReference: config.agentSourceReference,
    suburbId: config.suburbId,
    propertyTypeId: config.propertyTypeId,
    expiryDate: config.expiryDate,
    listingNumber: config.listingNumber,
    storageBaseUrl: config.supabaseUrl,
    maxImages: config.maxImages,
    photosChanged: config.photosChanged,
    convertImagesToJpeg: true,
  })
  let report = createProperty24PublishReport({ config, preview, apply: config.apply })

  if (!preview.canSubmit) {
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({
      status: report.status,
      output,
      canSubmit: preview.canSubmit,
      dataBlockers: preview.dataBlockers,
      technicalBlockers: preview.technicalBlockers,
    }, null, 2))
    process.exitCode = 1
    return
  }

  if (!config.apply) {
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({
      status: report.status,
      output,
      message: 'Dry run only. Re-run with --apply to send this listing to Property24 ExDev.',
      canSubmit: preview.canSubmit,
      summary: preview.summary,
    }, null, 2))
    return
  }

  const property24 = createProperty24Client({
    baseUrl: config.property24BaseUrl,
    username: config.property24Username,
    password: config.property24Password,
    userGroupId: config.property24UserGroupId,
  })
  report = await applyControlledProperty24ListingPublish({
    supabase,
    property24,
    config,
    preview,
    report,
    applyPublish: applyProperty24ListingPublish,
    allowPublishWithoutMandate: true,
    publishWithoutMandateReason: 'Property24 ExDev publish accepted before mandate evidence upload.',
  })

  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    httpStatus: report.property24Response?.httpStatus || null,
    property24Response: report.property24Response?.summary || null,
    portalCheck: report.portalCheck?.summary || report.portalCheck || null,
  }, null, 2))
  if (report.status === 'FAILED') process.exitCode = 1
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name || 'Error',
    message: error.message,
    httpStatus: error.status || null,
    response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  }, null, 2))
  process.exitCode = 1
})
