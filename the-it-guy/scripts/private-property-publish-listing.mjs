import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  PRIVATE_PROPERTY_SANDBOX_BASE_URL,
  createPrivatePropertyClient,
  normalizePrivatePropertyText,
  summarizePrivatePropertySoapResponse,
} from '../server/services/privatePropertyClient.js'
import {
  createPrivatePropertyArch9ListingPreview,
  createPrivatePropertySandboxFixture,
  fetchArch9ListingForPrivatePropertyPreview,
  normalizePrivatePropertyPreviewText,
} from '../server/services/privatePropertyListingPreviewService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    apply: false,
    listingId: '',
    fixture: '',
    output: '',
    branchGuid: '',
    agentIds: '',
    propertyId: '',
    suburbId: '',
    category: '',
    listingType: '',
    mandateType: '',
    price: '',
    listingDate: '',
    photosChanged: true,
    soleMandateExclusiveDays: '',
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
    } else if (arg === '--photos-unchanged') {
      options.photosChanged = false
    } else if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizePrivatePropertyPreviewText(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--fixture=')) {
      options.fixture = normalizePrivatePropertyPreviewText(arg.slice('--fixture='.length))
    } else if (arg.startsWith('--output=')) {
      options.output = normalizePrivatePropertyPreviewText(arg.slice('--output='.length))
    } else if (arg.startsWith('--branch-guid=')) {
      options.branchGuid = normalizePrivatePropertyPreviewText(arg.slice('--branch-guid='.length))
    } else if (arg.startsWith('--agent-ids=')) {
      options.agentIds = normalizePrivatePropertyPreviewText(arg.slice('--agent-ids='.length))
    } else if (arg.startsWith('--agent-id=')) {
      options.agentIds = normalizePrivatePropertyPreviewText(arg.slice('--agent-id='.length))
    } else if (arg.startsWith('--property-id=')) {
      options.propertyId = normalizePrivatePropertyPreviewText(arg.slice('--property-id='.length))
    } else if (arg.startsWith('--suburb-id=')) {
      options.suburbId = normalizePrivatePropertyPreviewText(arg.slice('--suburb-id='.length))
    } else if (arg.startsWith('--category=')) {
      options.category = normalizePrivatePropertyPreviewText(arg.slice('--category='.length))
    } else if (arg.startsWith('--listing-type=')) {
      options.listingType = normalizePrivatePropertyPreviewText(arg.slice('--listing-type='.length))
    } else if (arg.startsWith('--mandate-type=')) {
      options.mandateType = normalizePrivatePropertyPreviewText(arg.slice('--mandate-type='.length))
    } else if (arg.startsWith('--price=')) {
      options.price = normalizePrivatePropertyPreviewText(arg.slice('--price='.length))
    } else if (arg.startsWith('--listing-date=')) {
      options.listingDate = normalizePrivatePropertyPreviewText(arg.slice('--listing-date='.length))
    } else if (arg.startsWith('--exclusive-days=')) {
      options.soleMandateExclusiveDays = normalizePrivatePropertyPreviewText(arg.slice('--exclusive-days='.length))
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

function buildConfig(options) {
  const env = loadEnv()
  const config = {
    baseUrl: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_BASE_URL) || PRIVATE_PROPERTY_SANDBOX_BASE_URL,
    username: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_USERNAME || env.PRIVATE_PROPERTY_USER_NAME),
    password: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_PASSWORD),
    vendor: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_VENDOR),
    environment: normalizePrivatePropertyText(env.PRIVATE_PROPERTY_ENVIRONMENT || env.PRIVATE_PROPERTY_ENV || 'sandbox'),
    supabaseUrl: normalizePrivatePropertyText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizePrivatePropertyText(env.SUPABASE_SERVICE_ROLE_KEY),
    listingId: options.listingId,
    fixture: options.fixture,
    branchGuid: normalizePrivatePropertyText(options.branchGuid || env.PRIVATE_PROPERTY_BRANCH_GUID || env.PRIVATE_PROPERTY_GUID),
    agentIds: normalizePrivatePropertyText(options.agentIds || env.PRIVATE_PROPERTY_DEFAULT_AGENT_IDS || env.PRIVATE_PROPERTY_DEFAULT_AGENT_ID),
    propertyId: options.propertyId,
    suburbId: normalizePrivatePropertyText(options.suburbId || env.PRIVATE_PROPERTY_DEFAULT_SUBURB_ID),
    category: options.category,
    listingType: options.listingType,
    mandateType: options.mandateType,
    price: options.price,
    listingDate: options.listingDate,
    photosChanged: options.photosChanged,
    soleMandateExclusiveDays: options.soleMandateExclusiveDays,
  }

  config.missing = []
  if (!config.fixture) {
    if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
    if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
    if (!config.listingId) config.missing.push('--listing-id or --fixture=<scenario>')
  }
  if (!config.branchGuid) config.missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
  if (!config.agentIds) config.missing.push('PRIVATE_PROPERTY_DEFAULT_AGENT_ID(S) or --agent-id/--agent-ids')
  if (options.apply) {
    if (!config.username) config.missing.push('PRIVATE_PROPERTY_USERNAME')
    if (!config.password) config.missing.push('PRIVATE_PROPERTY_PASSWORD')
  }

  return config
}

function createOptions(config, fixtureOptions = {}) {
  return {
    ...fixtureOptions,
    branchGuid: config.branchGuid,
    agentIds: config.agentIds,
    propertyId: config.propertyId,
    suburbId: config.suburbId,
    category: config.category || fixtureOptions.category,
    listingType: config.listingType || fixtureOptions.listingType,
    mandateType: config.mandateType || fixtureOptions.mandateType,
    price: config.price,
    listingDate: config.listingDate,
    photosChanged: config.photosChanged,
    soleMandateExclusiveDays: config.soleMandateExclusiveDays,
  }
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-publish-listing.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

function createPublishReport({ config, options, preview }) {
  return {
    phase: 'private-property-phase4-publish-listing',
    generatedAt: new Date().toISOString(),
    environment: config.environment,
    baseUrl: config.baseUrl,
    vendor: config.vendor || null,
    username: config.username || null,
    branchGuid: config.branchGuid || null,
    apply: Boolean(options.apply),
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    status: 'BLOCKED',
    canSubmit: Boolean(preview.canPreview),
    dataBlockers: preview.dataBlockers || [],
    technicalBlockers: preview.technicalBlockers || [],
    summary: preview.summary,
    payloadPreview: preview.payloadPreview,
    listingXml: preview.listingXml,
    syncCandidate: {
      listingId: normalizePrivatePropertyText(preview.summary?.listingId),
      propertyId: normalizePrivatePropertyText(preview.summary?.propertyId),
      branchGuid: config.branchGuid,
      agentIds: preview.summary?.agentIds || [],
      environment: config.environment,
      privatePropertyReference: '',
      lastSubmittedAt: '',
    },
    apiResponse: null,
    nextStep: 'Resolve blockers before submitting to Private Property.',
  }
}

function createBlockedReport(config, options) {
  return {
    phase: 'private-property-phase4-publish-listing',
    generatedAt: new Date().toISOString(),
    environment: config.environment,
    baseUrl: config.baseUrl,
    vendor: config.vendor || null,
    username: config.username || null,
    branchGuid: config.branchGuid || null,
    apply: Boolean(options.apply),
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    status: 'BLOCKED',
    missingConfiguration: config.missing,
    nextStep: 'Add the missing values, then run this command again.',
  }
}

function extractPrivatePropertyReference(summary = {}) {
  const text = normalizePrivatePropertyText(summary.resultText)
  const explicit = text.match(/(?:ref(?:erence)?|listing\s*id)\D+([A-Z0-9-]{4,})/i)
  return explicit ? explicit[1] : ''
}

async function fetchBundle(config) {
  if (config.fixture) {
    const fixture = createPrivatePropertySandboxFixture(config.fixture)
    return {
      bundle: {
        listing: fixture.listing,
        publication: fixture.publication,
        media: fixture.media,
        existingSync: {},
      },
      fixtureOptions: fixture.options || {},
    }
  }

  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    bundle: await fetchArch9ListingForPrivatePropertyPreview({ client, listingId: config.listingId }),
    fixtureOptions: {},
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)

  if (config.missing.length) {
    const report = createBlockedReport(config, options)
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({ status: report.status, output, missingConfiguration: report.missingConfiguration }, null, 2))
    process.exitCode = 1
    return
  }

  const { bundle, fixtureOptions } = await fetchBundle(config)
  const preview = createPrivatePropertyArch9ListingPreview({
    ...bundle,
    agentMapping: {
      agentIds: config.agentIds,
    },
    options: createOptions(config, fixtureOptions),
  })
  const report = createPublishReport({ config, options, preview })

  if (!preview.canPreview) {
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({
      status: report.status,
      output,
      dataBlockers: report.dataBlockers,
      technicalBlockers: report.technicalBlockers,
    }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    report.status = 'DRY_RUN'
    report.nextStep = 'No Private Property write was made. Re-run with --apply during the sandbox window to submit this listing.'
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({
      status: report.status,
      output,
      canSubmit: report.canSubmit,
      message: report.nextStep,
      summary: report.summary,
    }, null, 2))
    return
  }

  const client = createPrivatePropertyClient({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
  })

  report.safety.privatePropertyApiCalled = true
  report.syncCandidate.lastSubmittedAt = new Date().toISOString()

  try {
    const response = await client.updateListing(preview.listingXml)
    report.status = 'SUBMITTED'
    report.safety.listingPublished = true
    report.apiResponse = {
      status: response.status,
      durationMs: response.durationMs,
      summary: response.summary || summarizePrivatePropertySoapResponse('UpdateListing', response.data || ''),
    }
    report.syncCandidate.privatePropertyReference = extractPrivatePropertyReference(report.apiResponse.summary)
    report.nextStep = 'Poll GetListingEventFeedByBranch for ImagesDownloading, ImagesDownloaded, Activated, or error events.'
  } catch (error) {
    report.status = 'BLOCKED'
    report.safety.listingPublished = false
    report.apiResponse = {
      error: {
        name: error.name || 'Error',
        message: error.message,
        status: error.status || null,
        statusText: error.statusText || '',
        faultCode: error.faultCode || '',
        faultString: error.faultString || '',
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse('UpdateListing', error.responseBody) : null,
      },
    }
    report.nextStep = 'Fix the Private Property submit error, then re-run with --apply.'
    process.exitCode = 1
  }

  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.status,
    output,
    listingPublished: report.safety.listingPublished,
    apiResponse: report.apiResponse,
    nextStep: report.nextStep,
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
