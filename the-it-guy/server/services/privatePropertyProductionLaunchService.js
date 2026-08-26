import { normalizePrivatePropertyText } from './privatePropertyClient.js'
import {
  buildPrivatePropertyPublishConfirmation,
  runPrivatePropertyControlledPublishRehearsal,
} from './privatePropertyControlledPublishService.js'
import {
  runPrivatePropertyGoLiveCloseout,
} from './privatePropertyGoLiveCloseoutService.js'

export const PRIVATE_PROPERTY_PRODUCTION_LAUNCH_SERVICE_VERSION = 'arch9_private_property_production_launch_v1'

function normalizeKey(value = '') {
  return normalizePrivatePropertyText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function unique(values = []) {
  return [...new Set(values.map(normalizePrivatePropertyText).filter(Boolean))]
}

function closeoutIsReady(closeout = null, listingId = '') {
  return Boolean(
    closeout &&
    closeout.ready === true &&
    normalizeKey(closeout.status) === 'go_live_ready' &&
    normalizePrivatePropertyText(closeout.listingId) === normalizePrivatePropertyText(listingId),
  )
}

function summarizeCloseout(closeout = null) {
  if (!closeout) return null
  return {
    phase: normalizePrivatePropertyText(closeout.phase),
    status: normalizePrivatePropertyText(closeout.status),
    ready: closeout.ready === true,
    listingId: normalizePrivatePropertyText(closeout.listingId),
    blockers: closeout.blockers || [],
    expectedConfirmation: normalizePrivatePropertyText(closeout.production?.expectedConfirmation),
    sandbox: {
      publishStatus: normalizePrivatePropertyText(closeout.sandbox?.publishEvidence?.status),
      activationStatus: normalizePrivatePropertyText(closeout.sandbox?.activationEvidence?.status),
      syncStatus: normalizePrivatePropertyText(closeout.sandbox?.latestSync?.externalStatus),
      isOnPortal: closeout.sandbox?.latestSync?.isOnPortal === true,
    },
    approval: closeout.approval || null,
  }
}

function summarizeProductionSubmit(result = null) {
  if (!result) return null
  return {
    phase: normalizePrivatePropertyText(result.phase),
    status: normalizePrivatePropertyText(result.status),
    apply: result.apply === true,
    recordSync: result.recordSync === true,
    privatePropertyApiCalled: result.safety?.privatePropertyApiCalled === true,
    databaseWritten: result.safety?.databaseWritten === true,
    listingPublished: result.safety?.listingPublished === true,
    privatePropertyReference: normalizePrivatePropertyText(result.apiResponse?.privatePropertyReference) || null,
    propertyId: normalizePrivatePropertyText(result.submitCandidate?.propertyId) || null,
    branchGuid: normalizePrivatePropertyText(result.submitCandidate?.branchGuid) || null,
    blockers: result.blockers || [],
    warnings: result.warnings || [],
    syncResult: result.syncResult || null,
  }
}

function buildBlockedReport({ listingId = '', closeout = null, blockers = [], apply = false } = {}) {
  return {
    version: PRIVATE_PROPERTY_PRODUCTION_LAUNCH_SERVICE_VERSION,
    phase: 'private-property-go-live-phase7-production-launch',
    generatedAt: new Date().toISOString(),
    listingId: normalizePrivatePropertyText(listingId),
    environment: 'production',
    apply: Boolean(apply),
    recordSync: true,
    status: 'BLOCKED',
    ready: false,
    safety: {
      closeoutChecked: Boolean(closeout),
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    },
    blockers: unique(blockers),
    warnings: [],
    closeout: summarizeCloseout(closeout),
    productionSubmit: null,
    nextStep: 'Resolve launch blockers before submitting a production Private Property listing.',
  }
}

export async function runPrivatePropertyProductionLaunch({
  client,
  listingId = '',
  secrets = process.env,
  overrides = {},
  closeoutReport = null,
  sandboxPublishReport = null,
  sandboxMonitorReport = null,
  evidence = {},
  apply = false,
  confirmation = '',
  privateProperty = null,
  createPrivateProperty = null,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const normalizedListingId = normalizePrivatePropertyText(listingId)
  if (!normalizedListingId) throw new Error('--listing-id is required.')

  const closeout = closeoutReport || await runPrivatePropertyGoLiveCloseout({
    client,
    listingId: normalizedListingId,
    secrets,
    overrides,
    sandboxPublishReport,
    sandboxMonitorReport,
    evidence,
  })
  const expectedConfirmation = normalizePrivatePropertyText(
    closeout?.production?.expectedConfirmation ||
    buildPrivatePropertyPublishConfirmation({ listingId: normalizedListingId, environment: 'production' }),
  )
  const closeoutBlockers = []
  if (!closeout) closeoutBlockers.push('missing_go_live_closeout_report')
  if (closeout && normalizePrivatePropertyText(closeout.listingId) !== normalizedListingId) closeoutBlockers.push('closeout_listing_id_mismatch')
  if (!closeoutIsReady(closeout, normalizedListingId)) closeoutBlockers.push('go_live_closeout_not_ready')

  if (closeoutBlockers.length) {
    return buildBlockedReport({
      listingId: normalizedListingId,
      closeout,
      blockers: closeoutBlockers,
      apply,
    })
  }

  const baseReport = {
    version: PRIVATE_PROPERTY_PRODUCTION_LAUNCH_SERVICE_VERSION,
    phase: 'private-property-go-live-phase7-production-launch',
    generatedAt: new Date().toISOString(),
    listingId: normalizedListingId,
    environment: 'production',
    apply: Boolean(apply),
    recordSync: true,
    status: 'PLAN_READY',
    ready: false,
    safety: {
      closeoutChecked: true,
      privatePropertyApiCalled: false,
      databaseWritten: false,
      rawCredentialsStored: false,
      listingPublished: false,
    },
    blockers: [],
    warnings: unique(closeout.warnings || []),
    closeout: summarizeCloseout(closeout),
    expectedConfirmation,
    productionSubmit: null,
    productionMonitorCommand: `npm run private-property:post-submit-monitor -- --listing-id=${normalizedListingId} --environment=production --continuation-key=0 --record-sync`,
    nextStep: `Re-run with --apply --confirm=${expectedConfirmation} to submit this production listing.`,
  }

  if (!apply) return baseReport

  if (normalizePrivatePropertyText(confirmation) !== expectedConfirmation) {
    return {
      ...baseReport,
      status: 'BLOCKED',
      blockers: ['missing_or_invalid_production_launch_confirmation'],
      expectedConfirmation,
      nextStep: `Re-run with --confirm=${expectedConfirmation} if this exact production launch is approved.`,
    }
  }

  const publishOptions = {
    client,
    listingId: normalizedListingId,
    environment: 'production',
    secrets,
    overrides,
    apply: true,
    confirmation: expectedConfirmation,
    recordSync: true,
  }
  if (privateProperty) publishOptions.privateProperty = privateProperty
  if (createPrivateProperty) publishOptions.createPrivateProperty = createPrivateProperty

  const productionSubmit = await runPrivatePropertyControlledPublishRehearsal(publishOptions)
  return {
    ...baseReport,
    status: productionSubmit.status === 'SUBMITTED' ? 'PRODUCTION_SUBMITTED' : 'BLOCKED',
    ready: productionSubmit.status === 'SUBMITTED',
    safety: {
      closeoutChecked: true,
      privatePropertyApiCalled: productionSubmit.safety?.privatePropertyApiCalled === true,
      databaseWritten: productionSubmit.safety?.databaseWritten === true,
      rawCredentialsStored: false,
      listingPublished: productionSubmit.safety?.listingPublished === true,
    },
    blockers: productionSubmit.status === 'SUBMITTED' ? [] : unique(productionSubmit.blockers || ['private_property_production_submit_failed']),
    warnings: unique([...(baseReport.warnings || []), ...(productionSubmit.warnings || [])]),
    productionSubmit: summarizeProductionSubmit(productionSubmit),
    nextStep: productionSubmit.status === 'SUBMITTED'
      ? 'Run the production post-submit monitor until the listing is activated or attention is required.'
      : 'Resolve the production submit blockers before retrying launch.',
  }
}
