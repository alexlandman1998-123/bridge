import {
  createProperty24Arch9ListingPreview,
  fetchArch9ListingForProperty24Preview,
  loadProperty24ImageBytesForPreview,
  normalizeProperty24PreviewText,
} from './listingDataService.js'
import {
  createProperty24RentalListingPlan,
} from '../services/property24RentalListingAdapter.js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  summarizeProperty24Payload,
} from './client.js'
import { recordProperty24ListingSync } from './syncService.js'

function normalizeLower(value = '') {
  return normalizeProperty24PreviewText(value).toLowerCase()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeProperty24PreviewText(value)
    if (text) return text
  }
  return ''
}

function normalizeIntegerText(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? String(Math.round(numeric)) : ''
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function isRentalListingBundle(bundle = {}) {
  const listing = asObject(bundle.listing)
  const publication = asObject(bundle.publication)
  const facts = asObject(listing.seller_canonical_facts || listing.sellerCanonicalFacts)
  const rentalInfo = asObject(facts.rentalInfo || facts.rental_info)
  const category = normalizeLower(firstText(
    listing.listing_category,
    listing.listingCategory,
    listing.listing_type,
    listing.listingType,
    publication.listing_type,
    publication.listingType,
    facts.listingType,
    facts.listing_type,
  ))
  return category.includes('rental') || Object.keys(rentalInfo).length > 0
}

function isMissingRelationError(error) {
  const message = normalizeLower(error?.message)
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

async function maybeSingle(query) {
  if (!query || typeof query.maybeSingle !== 'function') return { data: null, error: null }
  return query.maybeSingle()
}

function normalizeProperty24Settings(settings = {}) {
  const source = asObject(settings.property24 || settings.property_24 || settings)
  return {
    enabled: Boolean(source.enabled),
    environment: ['production', 'exdev'].includes(normalizeLower(source.environment)) ? normalizeLower(source.environment) : 'exdev',
    agencyId: normalizeIntegerText(source.agencyId || source.agency_id),
    agentMappings: asArray(source.agentMappings || source.agent_mappings).map((mapping) => ({
      arch9UserId: firstText(mapping.arch9UserId, mapping.arch9_user_id, mapping.userId, mapping.user_id),
      arch9MembershipId: firstText(mapping.arch9MembershipId, mapping.arch9_membership_id, mapping.membershipId, mapping.membership_id),
      arch9Email: normalizeLower(firstText(mapping.arch9Email, mapping.arch9_email, mapping.email)),
      property24AgentId: normalizeIntegerText(firstText(mapping.property24AgentId, mapping.property24_agent_id, mapping.agentId, mapping.agent_id)),
      property24Name: firstText(mapping.property24Name, mapping.property24_name),
      property24Email: normalizeLower(firstText(mapping.property24Email, mapping.property24_email)),
      sourceReference: firstText(mapping.sourceReference, mapping.source_reference),
      matchStatus: normalizeLower(firstText(mapping.matchStatus, mapping.match_status, mapping.status, 'mapped')),
    })),
  }
}

function normalizeProperty24AgentMappingRow(row = {}) {
  return {
    arch9UserId: firstText(row.arch9_user_id, row.arch9UserId, row.user_id, row.userId),
    arch9Email: normalizeLower(firstText(row.email_snapshot, row.emailSnapshot, row.email)),
    property24AgentId: normalizeIntegerText(firstText(row.property24_agent_id, row.property24AgentId, row.agentId)),
    property24Name: firstText(row.first_name_snapshot, row.firstNameSnapshot, row.property24Name),
    property24Email: normalizeLower(firstText(row.property24_email, row.property24Email)),
    sourceReference: firstText(row.source_reference, row.sourceReference),
    matchStatus: normalizeLower(firstText(row.status, row.matchStatus, 'active')),
  }
}

function normalizeOrganisationUser(row = {}) {
  return {
    membershipId: firstText(row.id),
    userId: firstText(row.user_id, row.userId),
    email: normalizeLower(firstText(row.email)),
  }
}

function getListingAssignedAgentIdentity(listing = {}, organisationUsers = []) {
  const assignedId = firstText(
    listing.assigned_agent_id,
    listing.assignedAgentId,
    listing.owner_user_id,
    listing.ownerUserId,
    listing.agent_id,
    listing.agentId,
    listing.created_by,
    listing.createdBy,
  )
  const assignedEmail = normalizeLower(firstText(listing.assigned_agent_email, listing.assignedAgentEmail, listing.agent_email, listing.agentEmail))
  const matchedUser = organisationUsers.find((user) => (
    assignedId && [user.userId, user.membershipId].includes(assignedId)
  )) || organisationUsers.find((user) => assignedEmail && user.email === assignedEmail) || null

  return {
    userId: firstText(matchedUser?.userId, assignedId),
    membershipId: firstText(matchedUser?.membershipId),
    email: firstText(matchedUser?.email, assignedEmail),
    assignedId,
  }
}

function findResolvedAgentMapping({ mappings = [], identity = {} } = {}) {
  const activeMappings = mappings.filter((mapping) => !['inactive', 'disabled'].includes(mapping.matchStatus))
  return activeMappings.find((mapping) => identity.userId && mapping.arch9UserId === identity.userId) ||
    activeMappings.find((mapping) => identity.membershipId && mapping.arch9MembershipId === identity.membershipId) ||
    activeMappings.find((mapping) => identity.email && mapping.arch9Email === identity.email) ||
    null
}

async function fetchOptionalSingle({ supabase, table, select = '*', filters = [] } = {}) {
  let query = supabase.from(table).select(select)
  for (const [method, ...args] of filters) query = query[method](...args)
  const { data, error } = await maybeSingle(query)
  if (error && isMissingRelationError(error)) return null
  if (error) throw error
  return data || null
}

async function fetchOrganisationUsersForProperty24({ supabase, organisationId } = {}) {
  const normalizedOrganisationId = normalizeProperty24PreviewText(organisationId)
  if (!normalizedOrganisationId) return []
  const { data, error } = await supabase
    .from('organisation_users')
    .select('id, user_id, email')
    .eq('organisation_id', normalizedOrganisationId)

  if (error && isMissingRelationError(error)) return []
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeOrganisationUser)
}

async function fetchProperty24AccountSettings({ supabase, organisationId, environment } = {}) {
  const settingsRow = await fetchOptionalSingle({
    supabase,
    table: 'organisation_settings',
    select: 'settings_json',
    filters: [['eq', 'organisation_id', organisationId]],
  })
  const rawSettingsJson = asObject(settingsRow?.settings_json || {})
  const jsonSettingsConfigured = Boolean(rawSettingsJson.property24 || rawSettingsJson.property_24)
  const jsonSettings = normalizeProperty24Settings(rawSettingsJson)

  const accountRow = await fetchOptionalSingle({
    supabase,
    table: 'property24_accounts',
    select: 'agency_id, enabled, environment',
    filters: [
      ['eq', 'organisation_id', organisationId],
      ['eq', 'environment', environment || jsonSettings.environment || 'exdev'],
    ],
  })

  return {
    ...jsonSettings,
    configured: Boolean(accountRow || jsonSettingsConfigured),
    enabled: Boolean(accountRow?.enabled ?? jsonSettings.enabled),
    agencyId: normalizeIntegerText(accountRow?.agency_id) || jsonSettings.agencyId,
    environment: normalizeLower(accountRow?.environment) || jsonSettings.environment,
  }
}

async function fetchProperty24AgentMappingRows({ supabase, organisationId, agencyId, environment } = {}) {
  const normalizedOrganisationId = normalizeProperty24PreviewText(organisationId)
  const normalizedAgencyId = normalizeIntegerText(agencyId)
  if (!normalizedOrganisationId || !normalizedAgencyId) return []
  let query = supabase
    .from('property24_agent_mappings')
    .select('*')
    .eq('organisation_id', normalizedOrganisationId)
    .eq('environment', environment || 'exdev')
    .eq('agency_id', Number(normalizedAgencyId))
    .eq('status', 'active')

  const { data, error } = await query
  if (error && isMissingRelationError(error)) return []
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeProperty24AgentMappingRow)
}

export async function resolveProperty24ListingPublishConfiguration({
  supabase,
  config = {},
  listingId,
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizeProperty24PreviewText(listingId || config.listingId)
  if (!normalizedListingId) return config

  const listing = await fetchOptionalSingle({
    supabase,
    table: 'private_listings',
    select: '*',
    filters: [['eq', 'id', normalizedListingId]],
  })
  if (!listing) return config

  const organisationId = firstText(listing.organisation_id, listing.organisationId, config.organisationId)
  if (!organisationId) return config

  const [accountSettings, organisationUsers] = await Promise.all([
    fetchProperty24AccountSettings({ supabase, organisationId, environment: config.environment }),
    fetchOrganisationUsersForProperty24({ supabase, organisationId }),
  ])

  const agencyId = config.explicitAgencyId || accountSettings.agencyId || config.agencyId
  const tableMappings = await fetchProperty24AgentMappingRows({
    supabase,
    organisationId,
    agencyId,
    environment: config.environment || accountSettings.environment || 'exdev',
  })
  const identity = getListingAssignedAgentIdentity(listing, organisationUsers)
  const settingsMapping = findResolvedAgentMapping({ mappings: accountSettings.agentMappings, identity })
  const tableMapping = findResolvedAgentMapping({ mappings: tableMappings, identity })
  const mapping = tableMapping || settingsMapping || null

  const agentId = config.explicitAgentId || mapping?.property24AgentId || config.agentId
  const agentSourceReference = config.explicitAgentSourceReference ||
    mapping?.sourceReference ||
    config.agentSourceReference

  return {
    ...config,
    organisationId,
    agencyId,
    agentId,
    agentSourceReference,
    syndicationEnabled: Boolean(accountSettings.configured ? accountSettings.enabled : config.syndicationEnabled),
    property24ResolvedMapping: {
      source: tableMapping ? 'property24_agent_mappings' : settingsMapping ? 'organisation_settings.property24.agentMappings' : 'none',
      listingAssignedAgentId: identity.assignedId || null,
      arch9UserId: identity.userId || null,
      arch9MembershipId: identity.membershipId || null,
      arch9Email: identity.email || null,
      property24AgentId: mapping?.property24AgentId || null,
      sourceReference: mapping?.sourceReference || null,
    },
  }
}

export function resolveProperty24Environment(baseUrl = PROPERTY24_EXDEV_BASE_URL) {
  return String(baseUrl || '').replace(/\/+$/g, '') === PROPERTY24_EXDEV_BASE_URL ? 'exdev' : 'production'
}

export function createRedactedProperty24Payload(payload = {}) {
  if (!payload || typeof payload !== 'object') return null
  return {
    ...payload,
    photos: Array.isArray(payload.photos)
      ? payload.photos.map((photo) => ({
          mimeContentType: photo.mimeContentType,
          caption: photo.caption || null,
          isFloorPlan: Boolean(photo.isFloorPlan),
          bytesLoaded: Boolean(photo.bytes),
          byteLengthApprox: photo.bytes ? Math.round((String(photo.bytes).length * 3) / 4) : 0,
        }))
      : payload.photos,
  }
}

export async function buildProperty24ListingSubmitPlan({
  supabase,
  listingId,
  agencyId,
  agentId,
  agentSourceReference,
  environment = 'exdev',
  sandboxPayloadTestMode = false,
  suburbId,
  propertyTypeId,
  expiryDate,
  listingNumber,
  storageBaseUrl = '',
  maxImages = 20,
  photosChanged = true,
  convertImagesToJpeg = true,
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  const bundle = await fetchArch9ListingForProperty24Preview({ client: supabase, listingId })
  const loaded = await loadProperty24ImageBytesForPreview({
    media: bundle.media,
    storageClient: supabase,
    storageBaseUrl,
    maxImages,
    convertImagesToJpeg,
  })

  return createProperty24Arch9ListingPreview({
    ...bundle,
    media: loaded.media,
    agentMapping: {
      property24AgentId: agentId,
      sourceReference: agentSourceReference,
    },
    catalogMapping: {
      suburbId,
      propertyTypeId,
    },
    imageByteLoad: {
      summary: loaded.summary,
      results: loaded.results,
    },
    options: {
      agencyId,
      environment,
      sandboxPayloadTestMode,
      expiryDate,
      listingNumber,
      photosChanged,
      includeSubmitPayload: true,
    },
  })
}

export async function buildProperty24RentalListingSubmitPlan({
  supabase,
  listingId,
  agencyId,
  agentId,
  agentSourceReference,
  environment = 'exdev',
  sandboxPayloadTestMode = true,
  suburbId,
  propertyTypeId,
  expiryDate,
  listingNumber,
  storageBaseUrl = '',
  maxImages = 20,
  photosChanged = true,
  convertImagesToJpeg = true,
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  const bundle = await fetchArch9ListingForProperty24Preview({ client: supabase, listingId })
  if (!isRentalListingBundle(bundle)) {
    const error = new Error('This endpoint only supports rental listings.')
    error.code = 'rental_listing_required'
    error.status = 400
    throw error
  }
  const loaded = await loadProperty24ImageBytesForPreview({
    media: bundle.media,
    storageClient: supabase,
    storageBaseUrl,
    maxImages,
    convertImagesToJpeg,
  })

  return createProperty24RentalListingPlan({
    ...bundle,
    media: loaded.media,
    agentMapping: {
      property24AgentId: agentId,
      sourceReference: agentSourceReference,
    },
    catalogMapping: {
      suburbId,
      propertyTypeId,
    },
    options: {
      agencyId,
      environment,
      sandboxPayloadTestMode,
      expiryDate,
      listingNumber,
      photosChanged,
      includeSubmitPayload: true,
    },
    imageByteLoad: {
      summary: loaded.summary,
      results: loaded.results,
    },
  })
}

export function createProperty24PublishReport({ config = {}, preview, apply = false } = {}) {
  return {
    phase: 'property24-publish-listing',
    generatedAt: new Date().toISOString(),
    mode: apply ? 'APPLY' : 'DRY_RUN',
    status: preview?.canSubmit ? (apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY') : 'BLOCKED',
    safety: {
      property24ApiCalled: false,
      databaseWritten: false,
      listingPublished: false,
    },
    listingId: normalizeProperty24PreviewText(config.listingId),
    preview: {
      canSubmit: Boolean(preview?.canSubmit),
      dataBlockers: preview?.dataBlockers || [],
      technicalBlockers: preview?.technicalBlockers || [],
      summary: preview?.summary || {},
      imageByteLoad: preview?.imageByteLoad || null,
    },
    redactedPreviewPayload: createRedactedProperty24Payload(preview?.previewPayload),
    redactedPayload: createRedactedProperty24Payload(preview?.payload),
  }
}

export async function applyProperty24ListingPublish({
  supabase,
  property24,
  config = {},
  preview,
  report,
  allowPublishWithoutMandate = true,
  publishWithoutMandateReason = 'Property24 ExDev publish accepted before mandate evidence upload.',
} = {}) {
  if (!supabase) throw new Error('Supabase client is required.')
  if (!property24) throw new Error('Property24 client is required.')
  if (!preview?.payload) throw new Error('Property24 submit payload is required.')
  const nextReport = report || createProperty24PublishReport({ config, preview, apply: true })

  let result
  try {
    result = await property24.saveListing(preview.payload)
    nextReport.status = 'SUBMITTED'
    nextReport.safety.property24ApiCalled = true
    nextReport.safety.listingPublished = true
    nextReport.property24Response = {
      httpStatus: result.status,
      durationMs: result.durationMs,
      summary: summarizeProperty24Payload(result.data),
      data: result.data,
    }
  } catch (error) {
    nextReport.status = 'FAILED'
    nextReport.safety.property24ApiCalled = true
    nextReport.error = {
      name: error.name || 'Error',
      message: error.message,
      httpStatus: error.status || null,
      response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
    }
    return nextReport
  }

  const listingNumber = result.data?.listingNumber || result.data?.ListingNumber || result.data
  let portalIsOnPortal = Boolean(result.data?.isOnPortal ?? result.data?.IsOnPortal)
  if (listingNumber && typeof listingNumber !== 'object') {
    try {
      const portalResult = await property24.checkListingOnPortal(listingNumber)
      portalIsOnPortal = Boolean(portalResult.data)
      nextReport.portalCheck = {
        httpStatus: portalResult.status,
        durationMs: portalResult.durationMs,
        summary: summarizeProperty24Payload(portalResult.data),
        data: portalResult.data,
      }
    } catch (error) {
      nextReport.portalCheck = {
        status: 'FAILED',
        message: error.message,
        httpStatus: error.status || null,
        response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
      }
    }

    const syncRecord = await recordProperty24ListingSync({
      client: supabase,
      listingId: config.listingId,
      agencyId: config.agencyId,
      listingNumber,
      environment: config.environment || resolveProperty24Environment(config.property24BaseUrl),
      isOnPortal: portalIsOnPortal,
      reasons: Array.isArray(result.data?.reasons) ? result.data.reasons : [],
      responseSummary: nextReport.property24Response.summary,
      payloadSummary: preview.summary,
      payloadHash: config.payloadHash,
      imagePayloadHash: config.imagePayloadHash,
      property24ListingUrl: config.property24ListingUrl,
      allowPublishWithoutMandate,
      publishWithoutMandateReason,
    })
    nextReport.databaseWrite = {
      table: 'property24_listing_syncs',
      privateListingId: syncRecord.sync.private_listing_id,
      listingNumber: syncRecord.sync.listing_number,
      property24Status: syncRecord.listing.property24_status,
      property24Reference: syncRecord.listing.property24_reference,
      ...(syncRecord.syncWarning ? { syncWarning: syncRecord.syncWarning } : {}),
      ...(syncRecord.statusUpdateWarning ? { statusUpdateWarning: syncRecord.statusUpdateWarning } : {}),
      ...(syncRecord.externalLinkWarning ? { externalLinkWarning: syncRecord.externalLinkWarning } : {}),
    }
    nextReport.safety.databaseWritten = true
  }

  return nextReport
}
