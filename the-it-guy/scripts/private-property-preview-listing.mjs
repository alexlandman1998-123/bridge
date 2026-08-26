import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  createPrivatePropertyArch9ListingPreview,
  createPrivatePropertySandboxFixture,
  fetchArch9ListingForPrivatePropertyPreview,
  fetchRecentArch9ListingsForPrivatePropertyPreview,
  normalizePrivatePropertyPreviewText,
} from '../server/services/privatePropertyListingPreviewService.js'
import {
  resolvePrivatePropertyAgentMapping,
} from '../server/services/privatePropertyAgentMappingService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    listingId: '',
    fixture: '',
    listCandidates: false,
    limit: 10,
    output: '',
    branchGuid: '',
    agentIds: '',
    propertyId: '',
    suburbId: '',
    streetName: '',
    streetNumber: '',
    complexName: '',
    unitNumber: '',
    town: '',
    province: '',
    category: '',
    listingType: '',
    mandateType: '',
    environment: '',
    price: '',
    listingDate: '',
    photosChanged: true,
    soleMandateExclusiveDays: '',
  }

  for (const arg of argv) {
    if (arg === '--list-candidates') {
      options.listCandidates = true
    } else if (arg === '--photos-unchanged') {
      options.photosChanged = false
    } else if (arg.startsWith('--listing-id=')) {
      options.listingId = normalizePrivatePropertyPreviewText(arg.slice('--listing-id='.length))
    } else if (arg.startsWith('--fixture=')) {
      options.fixture = normalizePrivatePropertyPreviewText(arg.slice('--fixture='.length))
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || 10
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
    } else if (arg.startsWith('--street-name=')) {
      options.streetName = normalizePrivatePropertyPreviewText(arg.slice('--street-name='.length))
    } else if (arg.startsWith('--street-number=')) {
      options.streetNumber = normalizePrivatePropertyPreviewText(arg.slice('--street-number='.length))
    } else if (arg.startsWith('--complex-name=')) {
      options.complexName = normalizePrivatePropertyPreviewText(arg.slice('--complex-name='.length))
    } else if (arg.startsWith('--unit-number=')) {
      options.unitNumber = normalizePrivatePropertyPreviewText(arg.slice('--unit-number='.length))
    } else if (arg.startsWith('--town=')) {
      options.town = normalizePrivatePropertyPreviewText(arg.slice('--town='.length))
    } else if (arg.startsWith('--province=')) {
      options.province = normalizePrivatePropertyPreviewText(arg.slice('--province='.length))
    } else if (arg.startsWith('--category=')) {
      options.category = normalizePrivatePropertyPreviewText(arg.slice('--category='.length))
    } else if (arg.startsWith('--listing-type=')) {
      options.listingType = normalizePrivatePropertyPreviewText(arg.slice('--listing-type='.length))
    } else if (arg.startsWith('--mandate-type=')) {
      options.mandateType = normalizePrivatePropertyPreviewText(arg.slice('--mandate-type='.length))
    } else if (arg.startsWith('--environment=')) {
      options.environment = normalizePrivatePropertyPreviewText(arg.slice('--environment='.length))
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
    Object.entries(process.env).filter(([, value]) => normalizePrivatePropertyPreviewText(value)),
  )
  return { ...fromFiles, ...processOverrides }
}

function buildConfig(options) {
  const env = loadEnv()
  const config = {
    supabaseUrl: normalizePrivatePropertyPreviewText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizePrivatePropertyPreviewText(env.SUPABASE_SERVICE_ROLE_KEY),
    listingId: options.listingId,
    fixture: options.fixture,
    listCandidates: options.listCandidates,
    limit: options.limit,
    branchGuid: normalizePrivatePropertyPreviewText(options.branchGuid || env.PRIVATE_PROPERTY_BRANCH_GUID || env.PRIVATE_PROPERTY_GUID),
    agentIds: normalizePrivatePropertyPreviewText(options.agentIds || env.PRIVATE_PROPERTY_DEFAULT_AGENT_IDS || env.PRIVATE_PROPERTY_DEFAULT_AGENT_ID),
    propertyId: options.propertyId,
    suburbId: normalizePrivatePropertyPreviewText(options.suburbId || env.PRIVATE_PROPERTY_DEFAULT_SUBURB_ID),
    streetName: options.streetName,
    streetNumber: options.streetNumber,
    complexName: options.complexName,
    unitNumber: options.unitNumber,
    town: options.town,
    province: options.province,
    category: options.category,
    listingType: options.listingType,
    mandateType: options.mandateType,
    environment: normalizePrivatePropertyPreviewText(options.environment || env.PRIVATE_PROPERTY_ENVIRONMENT || env.PRIVATE_PROPERTY_ENV || 'sandbox'),
    price: options.price,
    listingDate: options.listingDate,
    photosChanged: options.photosChanged,
    soleMandateExclusiveDays: options.soleMandateExclusiveDays,
  }

  config.missing = []
  if (!config.fixture && !config.listCandidates) {
    if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
    if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
    if (!config.listingId) config.missing.push('--listing-id or --fixture=<scenario>')
  }
  if (config.listCandidates) {
    if (!config.supabaseUrl) config.missing.push('SUPABASE_URL or VITE_SUPABASE_URL')
    if (!config.serviceRoleKey) config.missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }
  if (config.fixture) {
    if (!config.branchGuid) config.missing.push('PRIVATE_PROPERTY_BRANCH_GUID or --branch-guid')
    if (!config.agentIds) config.missing.push('PRIVATE_PROPERTY_DEFAULT_AGENT_ID(S) or --agent-id/--agent-ids')
  }

  return config
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-listing-preview.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

function createOptions(config, fixtureOptions = {}) {
  return {
    ...fixtureOptions,
    branchGuid: config.branchGuid,
    agentIds: config.agentIds,
    propertyId: config.propertyId,
    suburbId: config.suburbId,
    streetName: config.streetName,
    streetNumber: config.streetNumber,
    complexName: config.complexName,
    unitNumber: config.unitNumber,
    town: config.town,
    province: config.province,
    category: config.category || fixtureOptions.category,
    listingType: config.listingType || fixtureOptions.listingType,
    mandateType: config.mandateType || fixtureOptions.mandateType,
    price: config.price,
    listingDate: config.listingDate,
    photosChanged: config.photosChanged,
    soleMandateExclusiveDays: config.soleMandateExclusiveDays,
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig(options)

  if (config.missing.length) {
    const report = {
      phase: 'private-property-listing-preview',
      generatedAt: new Date().toISOString(),
      safety: {
        privatePropertyApiCalled: false,
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

  if (config.listCandidates) {
    const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const candidates = await fetchRecentArch9ListingsForPrivatePropertyPreview({ client, limit: config.limit })
    const report = {
      phase: 'private-property-listing-candidates',
      generatedAt: new Date().toISOString(),
      safety: {
        privatePropertyApiCalled: false,
        databaseWritten: false,
        listingPublished: false,
      },
      status: 'FOUND',
      count: candidates.length,
      candidates,
      nextStep: 'Pick one candidate id and pass it as --listing-id to generate the Private Property preview.',
    }
    const output = writeReport(report, options.output || path.join(appRoot, 'outputs', 'private-property-listing-candidates.json'))
    console.log(JSON.stringify({ status: report.status, output, count: report.count, candidates: report.candidates }, null, 2))
    return
  }

  let bundle
  let fixtureOptions = {}
  let resolvedMapping = null
  if (config.fixture) {
    const fixture = createPrivatePropertySandboxFixture(config.fixture)
    bundle = {
      listing: fixture.listing,
      publication: fixture.publication,
      media: fixture.media,
      existingSync: {},
    }
    fixtureOptions = fixture.options || {}
  } else {
    const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    bundle = await fetchArch9ListingForPrivatePropertyPreview({ client, listingId: config.listingId })
    resolvedMapping = await resolvePrivatePropertyAgentMapping({
      client,
      listingId: config.listingId,
      environment: config.environment,
    })
    config.branchGuid = config.branchGuid || resolvedMapping.agencyConfig?.branchGuid || ''
    config.agentIds = config.agentIds || resolvedMapping.agentMapping?.agentIds || ''
  }

  const report = createPrivatePropertyArch9ListingPreview({
    ...bundle,
    agentMapping: {
      agentIds: config.agentIds,
    },
    options: createOptions(config, fixtureOptions),
  })
  if (resolvedMapping) {
    report.mappingResolution = resolvedMapping
    report.technicalBlockers = [...new Set([...(report.technicalBlockers || []), ...(resolvedMapping.ready ? [] : resolvedMapping.blockers)])]
    report.canPreview = report.dataBlockers.length === 0 && report.technicalBlockers.length === 0
    report.status = report.canPreview ? 'PREVIEW_READY' : 'BLOCKED'
  }

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
