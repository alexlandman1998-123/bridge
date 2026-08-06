import { DEFAULT_SELLER_PROCESS_PROFILE } from './sellerProcessProfileService.js'
import { buildSellerProcessProjectionBundle } from './sellerProcessProjectionService.js'

const SURFACE_KEYS = Object.freeze([
  'sellerLeadWorkspace',
  'mandateFlow',
  'listingWorkspace',
  'sellerDocumentCenter',
  'appointments',
  'activityTimeline',
  'notifications',
  'reportingDashboard',
  'partners',
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function baseEnvelope(bundle = {}) {
  const surface = bundle.surface || {}
  return {
    profile: surface.profile || DEFAULT_SELLER_PROCESS_PROFILE,
    mode: surface.mode || 'default',
    readOnly: true,
    shadowOnly: true,
    canWrite: false,
    canMutate: false,
    canReplaceJourney: false,
    canApplyToRuntime: false,
    journeyPatch: null,
    readinessPatch: null,
    listingPatch: null,
    notificationDrafts: [],
  }
}

function evidenceBySource(evaluation = {}) {
  return asArray(evaluation.blockers).reduce((result, blocker) => {
    const source = blocker.source || 'unknown'
    if (!result[source]) result[source] = []
    result[source].push(blocker.evidenceKey)
    return result
  }, {})
}

function completedProcessEvents(surface = {}) {
  return asArray(surface.completedProcessStageKeys).map((stageKey) => ({
    key: `seller_process_shadow:${stageKey}`,
    stageKey,
    shadowOnly: true,
    canWrite: false,
  }))
}

function buildSellerLeadWorkspacePayload(bundle = {}) {
  const surface = bundle.surface || {}
  return {
    ...baseEnvelope(bundle),
    panelKey: 'seller_process_shadow',
    currentDefaultStageKey: surface.currentDefaultStageKey || '',
    currentProcessStageKey: surface.currentProcessStageKey || '',
    currentProcessStageLabel: surface.currentProcessStageLabel || '',
    completedProcessStageKeys: asArray(surface.completedProcessStageKeys),
    missingEvidenceKeys: asArray(surface.missingEvidenceKeys),
    percent: surface.percent || 0,
  }
}

function buildMandateFlowPayload(bundle = {}) {
  const surface = bundle.surface || {}
  const packEvidenceKeys = ['mandate_signed', 'defects_form_signed', 'fica_pack_signed']
  const missingEvidenceKeys = asArray(surface.missingEvidenceKeys).filter((key) => packEvidenceKeys.includes(key))
  return {
    ...baseEnvelope(bundle),
    requiredSellerPackEvidenceKeys: packEvidenceKeys,
    missingSellerPackEvidenceKeys: missingEvidenceKeys,
    canFinalizeListing: false,
    canMarkMandateSigned: false,
  }
}

function buildListingWorkspacePayload(bundle = {}) {
  const surface = bundle.surface || {}
  return {
    ...baseEnvelope(bundle),
    currentDefaultStageKey: surface.currentDefaultStageKey || '',
    shadowProcessPercent: surface.percent || 0,
    canActivateListing: false,
    canPublishListing: false,
  }
}

function buildSellerDocumentCenterPayload(bundle = {}) {
  const evaluation = bundle.evaluation || {}
  const bySource = evidenceBySource(evaluation)
  return {
    ...baseEnvelope(bundle),
    missingDocumentEvidenceKeys: asArray(bySource.document),
    missingAppointmentEvidenceKeys: asArray(bySource.appointment),
    missingActivityEvidenceKeys: asArray(bySource.activity),
    missingListingEvidenceKeys: asArray(bySource.listing),
    uploadRequests: [],
    documentRequestPatch: null,
  }
}

function buildAppointmentsPayload(bundle = {}) {
  const evaluation = bundle.evaluation || {}
  const bySource = evidenceBySource(evaluation)
  return {
    ...baseEnvelope(bundle),
    missingAppointmentEvidenceKeys: asArray(bySource.appointment),
    appointmentRequestDrafts: [],
    canScheduleAutomatically: false,
  }
}

function buildActivityTimelinePayload(bundle = {}) {
  const surface = bundle.surface || {}
  return {
    ...baseEnvelope(bundle),
    shadowEvents: completedProcessEvents(surface),
    canWriteTimeline: false,
    activityPatch: null,
  }
}

function buildNotificationsPayload(bundle = {}) {
  return {
    ...baseEnvelope(bundle),
    shouldSend: false,
    shouldQueue: false,
    notificationDrafts: [],
    notificationPatch: null,
  }
}

function buildReportingDashboardPayload(bundle = {}) {
  return {
    ...baseEnvelope(bundle),
    ...(bundle.reporting || {}),
    readOnly: true,
    shadowOnly: true,
    internalOnly: true,
    canWrite: false,
    dashboardPatch: null,
  }
}

function buildPartnersPayload(bundle = {}) {
  return {
    ...baseEnvelope(bundle),
    attorneyFirm: bundle.partners?.attorney_firm || null,
    bondOriginator: bundle.partners?.bond_originator || null,
    exposesInternalProcessStages: false,
    partnerPatch: null,
  }
}

export function buildSellerProcessShadowIntegration(source = {}) {
  const bundle = buildSellerProcessProjectionBundle(source)
  return Object.freeze({
    profile: bundle.surface?.profile || DEFAULT_SELLER_PROCESS_PROFILE,
    mode: bundle.surface?.mode || 'default',
    readOnly: true,
    shadowOnly: true,
    canWrite: false,
    canApplyToRuntime: false,
    surfaceKeys: SURFACE_KEYS,
    sellerLeadWorkspace: buildSellerLeadWorkspacePayload(bundle),
    mandateFlow: buildMandateFlowPayload(bundle),
    listingWorkspace: buildListingWorkspacePayload(bundle),
    sellerDocumentCenter: buildSellerDocumentCenterPayload(bundle),
    appointments: buildAppointmentsPayload(bundle),
    activityTimeline: buildActivityTimelinePayload(bundle),
    notifications: buildNotificationsPayload(bundle),
    reportingDashboard: buildReportingDashboardPayload(bundle),
    partners: buildPartnersPayload(bundle),
  })
}

export function listSellerProcessShadowIntegrationSurfaceKeys() {
  return SURFACE_KEYS
}
