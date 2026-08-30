import { createClient } from '@supabase/supabase-js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  applyControlledProperty24ListingPublish,
  applyProperty24ListingPublish,
  buildProperty24ListingSubmitPlan,
  createProperty24Client,
  createProperty24PublishReport,
} from '../property24/index.js'
import { runPrivatePropertyControlledPublishRehearsal } from './privatePropertyControlledPublishService.js'

const PROVIDERS = Object.freeze({ property24_publish: 'property24', private_property_publish: 'private_property' })

function text(value) { return String(value || '').trim() }
function enabled(value) { return text(value).toLowerCase() === 'true' }

export function validateListingSyndicationJob({ listingId, jobType, payload = {}, env = process.env } = {}) {
  const provider = PROVIDERS[jobType]
  const environment = text(payload.environment).toLowerCase()
  const expected = `${String(provider || '').toUpperCase()}_PUBLISH:${text(listingId)}:${environment}`
  if (!provider || !text(listingId)) throw Object.assign(new Error('Unsupported syndication job.'), { code: 'INVALID_SYNDICATION_JOB' })
  if (!['sandbox', 'production'].includes(environment)) throw Object.assign(new Error('Invalid syndication environment.'), { code: 'INVALID_SYNDICATION_ENVIRONMENT' })
  if (payload.provider !== provider || payload.confirmation !== expected || !payload.approvedBy || !payload.approvedAt) {
    throw Object.assign(new Error('Syndication approval evidence is invalid.'), { code: 'INVALID_SYNDICATION_APPROVAL' })
  }
  if (environment === 'production' && !enabled(env.LISTING_SYNDICATION_PRODUCTION_ENABLED)) {
    throw Object.assign(new Error('Production syndication is disabled.'), { code: 'PRODUCTION_SYNDICATION_DISABLED' })
  }
  const providerFlag = provider === 'property24' ? env.PROPERTY24_WORKER_ENABLED : env.PRIVATE_PROPERTY_WORKER_ENABLED
  if (!enabled(providerFlag)) throw Object.assign(new Error(`${provider} worker is disabled.`), { code: 'PROVIDER_WORKER_DISABLED' })
  return { provider, environment, expected }
}

function supabaseAdmin(env) {
  const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const key = text(env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !key) throw Object.assign(new Error('Syndication database environment is incomplete.'), { code: 'DATABASE_ENVIRONMENT_INCOMPLETE' })
  return { url, client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }
}

function summarize(report = {}, provider, environment) {
  return {
    provider,
    environment,
    status: report.status || 'UNKNOWN',
    submitted: report.status === 'SUBMITTED',
    generatedAt: report.generatedAt || new Date().toISOString(),
    listingId: report.listingId || null,
    blockers: report.blockers || report.preview?.dataBlockers || [],
    warnings: report.warnings || [],
    httpStatus: report.property24Response?.httpStatus || report.apiResponse?.status || null,
    externalReference: report.syncResult?.syncId || report.apiResponse?.privatePropertyReference || null,
  }
}

async function publishProperty24({ client, url, listingId, environment, payload, env }) {
  const config = {
    listingId,
    environment,
    property24BaseUrl: text(payload.baseUrl || env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    agencyId: text(payload.agencyId || env.PROPERTY24_DEFAULT_AGENCY_ID || '31382'),
    agentId: text(payload.agentId || env.PROPERTY24_DEFAULT_AGENT_ID),
    agentSourceReference: text(payload.agentSourceReference || env.PROPERTY24_DEFAULT_AGENT_SOURCE_REFERENCE),
    suburbId: text(payload.suburbId || env.PROPERTY24_DEFAULT_SUBURB_ID),
    propertyTypeId: text(payload.propertyTypeId || env.PROPERTY24_DEFAULT_PROPERTY_TYPE_ID),
    expiryDate: text(payload.expiryDate || env.PROPERTY24_DEFAULT_EXPIRY_DATE),
    listingNumber: text(payload.listingNumber),
    maxImages: Math.min(20, Math.max(1, Number(payload.maxImages) || 20)),
    photosChanged: payload.photosChanged !== false,
    actorUserId: payload.approvedBy,
  }
  const preview = await buildProperty24ListingSubmitPlan({
    supabase: client, ...config, storageBaseUrl: url, convertImagesToJpeg: true,
  })
  let report = createProperty24PublishReport({ config, preview, apply: true })
  if (preview.canSubmit) {
    const portal = createProperty24Client({
      baseUrl: config.property24BaseUrl,
      username: text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
      password: text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
      userGroupId: text(env.PROPERTY24_USER_GROUP_ID),
    })
    report = await applyControlledProperty24ListingPublish({
      supabase: client, property24: portal, config, preview, report,
      applyPublish: applyProperty24ListingPublish,
    })
  }
  return report
}

export async function executeListingSyndicationJob({ listingId, jobType, payload = {}, env = process.env } = {}) {
  const { provider, environment } = validateListingSyndicationJob({ listingId, jobType, payload, env })
  const { url, client } = supabaseAdmin(env)
  const report = provider === 'property24'
    ? await publishProperty24({ client, url, listingId, environment, payload, env })
    : await runPrivatePropertyControlledPublishRehearsal({
        client, listingId, environment, secrets: env, overrides: payload.overrides || {},
        apply: true, confirmation: payload.confirmation, recordSync: true,
      })
  const result = summarize(report, provider, environment)
  if (!result.submitted) throw Object.assign(new Error(`Provider submission ended with ${result.status}.`), { code: 'SYNDICATION_NOT_SUBMITTED', result })
  return result
}
