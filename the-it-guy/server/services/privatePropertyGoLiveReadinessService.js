import { normalizePrivatePropertyText } from './privatePropertyClient.js'
import {
  resolvePrivatePropertyAgencyConfig,
  resolvePrivatePropertyRuntimeCredentials,
} from './privatePropertyAgencyConfigService.js'
import {
  resolvePrivatePropertyAgentMapping,
} from './privatePropertyAgentMappingService.js'
import {
  createPrivatePropertyArch9ListingPreview,
  fetchArch9ListingForPrivatePropertyPreview,
} from './privatePropertyListingPreviewService.js'

export const PRIVATE_PROPERTY_GO_LIVE_READINESS_SERVICE_VERSION = 'arch9_private_property_go_live_readiness_service_v1'

function normalizeKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeEnvironment(value = '') {
  const key = normalizeKey(value)
  return key === 'production' ? 'production' : 'sandbox'
}

function unique(values = []) {
  return [...new Set(values.map(normalizePrivatePropertyText).filter(Boolean))]
}

function statusFromBlockers(blockers = []) {
  return blockers.length ? 'BLOCKED' : 'READY'
}

function buildCheck(name, blockers = [], warnings = [], details = {}) {
  const normalizedBlockers = unique(blockers)
  return {
    name,
    status: normalizedBlockers.length ? 'BLOCKED' : 'PASS',
    blockers: normalizedBlockers,
    warnings: unique(warnings),
    details,
  }
}

function buildPreviewOptions({ agencyConfig = {}, agentMapping = {}, overrides = {} } = {}) {
  return {
    ...overrides,
    branchGuid: normalizePrivatePropertyText(overrides.branchGuid) || normalizePrivatePropertyText(agencyConfig.branchGuid),
    agentIds: normalizePrivatePropertyText(overrides.agentIds) || normalizePrivatePropertyText(agentMapping.agentIds),
  }
}

function buildLocationBlockers(preview = {}) {
  const address = preview.payloadPreview?.address || preview.payload?.address || {}
  if (address.suburbId) return []

  const blockers = []
  if (!normalizePrivatePropertyText(address.suburb)) blockers.push('missing_private_property_suburb')
  if (!normalizePrivatePropertyText(address.town)) blockers.push('missing_private_property_town')
  if (!normalizePrivatePropertyText(address.province)) blockers.push('missing_private_property_province')
  return blockers
}

function buildProductionApprovalBlockers({ environment = 'sandbox', agencyConfig = {} } = {}) {
  if (normalizeEnvironment(environment) !== 'production') return []
  const blockers = []
  const status = normalizeKey(agencyConfig.status)
  if (!['approved', 'active'].includes(status)) blockers.push('private_property_production_config_not_approved')
  if (!normalizePrivatePropertyText(agencyConfig.goLiveApprovedAt)) blockers.push('private_property_production_go_live_not_approved')
  return blockers
}

export function createPrivatePropertyGoLiveReadinessReport({
  listingId = '',
  environment = 'sandbox',
  bundle = null,
  agencyConfigResolution = null,
  agentMappingResolution = null,
  credentialResolution = null,
  overrides = {},
} = {}) {
  const normalizedEnvironment = normalizeEnvironment(environment)
  const agencyConfig = agentMappingResolution?.agencyConfig || agencyConfigResolution?.config || null
  const agencyConfigResolvedViaMapping = Boolean(agentMappingResolution?.agencyConfig && !agencyConfigResolution?.config)
  const agencyConfigCheckBlockers = agencyConfigResolvedViaMapping
    ? []
    : agencyConfigResolution?.blockers || agentMappingResolution?.blockers || []
  const agencyConfigCheckWarnings = agencyConfigResolvedViaMapping
    ? []
    : agencyConfigResolution?.warnings || []
  const agencyConfigCheckSource = agencyConfigResolvedViaMapping
    ? 'private_property_agency_configs.via_agent_mapping'
    : agencyConfigResolution?.source || 'via_agent_mapping'
  const previewOptions = buildPreviewOptions({
    agencyConfig,
    agentMapping: agentMappingResolution?.agentMapping,
    overrides,
  })
  const preview = bundle
    ? createPrivatePropertyArch9ListingPreview({
      ...bundle,
      agentMapping: agentMappingResolution?.agentMapping || {},
      options: previewOptions,
    })
    : null

  if (preview && agentMappingResolution) {
    preview.mappingResolution = agentMappingResolution
    preview.technicalBlockers = unique([
      ...(preview.technicalBlockers || []),
      ...(agentMappingResolution.ready ? [] : agentMappingResolution.blockers || []),
    ])
    preview.canPreview = (preview.dataBlockers || []).length === 0 && preview.technicalBlockers.length === 0
    preview.status = preview.canPreview ? 'PREVIEW_READY' : 'BLOCKED'
  }

  const credentialBlockers = []
  if (!credentialResolution) {
    credentialBlockers.push('private_property_credentials_not_checked')
  } else {
    credentialBlockers.push(...(credentialResolution.missingSecrets || []).map((secretName) => `missing_runtime_secret:${secretName}`))
  }

  const checks = [
    buildCheck('agency_config', agencyConfigCheckBlockers, agencyConfigCheckWarnings, {
      source: agencyConfigCheckSource,
      config: agencyConfig,
    }),
    buildCheck('agent_mapping', agentMappingResolution?.blockers || ['missing_private_property_agent_mapping_resolution'], agentMappingResolution?.warnings || [], {
      source: agentMappingResolution?.source || 'none',
      mapping: agentMappingResolution?.mapping || null,
    }),
    buildCheck('runtime_credentials', credentialBlockers, [], credentialResolution?.redacted || {}),
    buildCheck('listing_payload', [...(preview?.dataBlockers || []), ...(preview?.technicalBlockers || [])], [], {
      canPreview: Boolean(preview?.canPreview),
      summary: preview?.summary || null,
    }),
    buildCheck('location_resolution', buildLocationBlockers(preview), [], {
      address: preview?.payloadPreview?.address || null,
    }),
    buildCheck('production_approval', buildProductionApprovalBlockers({ environment: normalizedEnvironment, agencyConfig }), [], {
      environment: normalizedEnvironment,
      status: agencyConfig?.status || '',
      goLiveApprovedAt: agencyConfig?.goLiveApprovedAt || '',
    }),
  ]

  const blockers = unique(checks.flatMap((check) => check.blockers))
  const warnings = unique(checks.flatMap((check) => check.warnings))

  return {
    version: PRIVATE_PROPERTY_GO_LIVE_READINESS_SERVICE_VERSION,
    phase: 'private-property-go-live-phase3-readiness',
    generatedAt: new Date().toISOString(),
    environment: normalizedEnvironment,
    listingId: normalizePrivatePropertyText(listingId),
    safety: {
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    },
    status: statusFromBlockers(blockers),
    ready: blockers.length === 0,
    blockers,
    warnings,
    checks,
    agencyConfig,
    agentMapping: agentMappingResolution?.agentMapping || { agentIds: '' },
    preview: preview
      ? {
        status: preview.status,
        canPreview: preview.canPreview,
        canSubmit: preview.canSubmit,
        dataBlockers: preview.dataBlockers,
        technicalBlockers: preview.technicalBlockers,
        summary: preview.summary,
        payloadPreview: preview.payloadPreview,
      }
      : null,
    nextStep: blockers.length
      ? 'Resolve the blockers before running a Private Property live publish.'
      : 'Run the controlled Private Property publish command for this exact listing/environment.',
  }
}

export async function buildPrivatePropertyGoLiveReadinessReport({
  client,
  listingId = '',
  environment = 'sandbox',
  secrets = process.env,
  overrides = {},
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) throw new Error('--listing-id is required.')
  const normalizedEnvironment = normalizeEnvironment(environment)

  const bundle = await fetchArch9ListingForPrivatePropertyPreview({
    client,
    listingId: normalizedListingId,
  })
  const [agencyConfigResolution, agentMappingResolution] = await Promise.all([
    resolvePrivatePropertyAgencyConfig({
      client,
      listingId: normalizedListingId,
      environment: normalizedEnvironment,
    }),
    resolvePrivatePropertyAgentMapping({
      client,
      listingId: normalizedListingId,
      environment: normalizedEnvironment,
    }),
  ])
  const credentialResolution = resolvePrivatePropertyRuntimeCredentials(
    agentMappingResolution.agencyConfig || agencyConfigResolution.config,
    secrets,
  )

  return createPrivatePropertyGoLiveReadinessReport({
    listingId: normalizedListingId,
    environment: normalizedEnvironment,
    bundle,
    agencyConfigResolution,
    agentMappingResolution,
    credentialResolution,
    overrides,
  })
}
