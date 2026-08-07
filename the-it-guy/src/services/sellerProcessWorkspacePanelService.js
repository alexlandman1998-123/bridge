import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfileForOrganisation,
} from './sellerProcessProfileService.js'
import {
  SELLER_PROCESS_SHADOW_WORKSPACE_KEY,
  buildSellerLeadWorkspaceShadowIntegration,
} from './sellerProcessWorkspaceIntegrationService.js'

const EVIDENCE_LABELS = Object.freeze({
  seller_contacted: 'First contact recorded',
  valuation_appointment_scheduled: 'Valuation appointment scheduled',
  valuation_document_uploaded: 'Formal valuation uploaded',
  valuation_presentation_scheduled: 'Valuation presentation scheduled',
  valuation_presented: 'Valuation presented in person',
  mandate_signed: 'Mandate signed',
  defects_form_signed: 'Defects form signed',
  fica_pack_signed: 'FICA pack signed',
  listing_ready: 'Listing ready',
})

const STAGE_LABELS = Object.freeze({
  first_contact: 'First Contact',
  valuation_appointment_scheduled: 'Valuation Appointment',
  formal_valuation_completed: 'Formal Valuation',
  valuation_presentation_scheduled: 'Presentation Appointment',
  valuation_presented: 'Valuation Presented',
  seller_pack_signed: 'Seller Pack Signed',
  listing_ready: 'List Property',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function labelForEvidence(key = '') {
  return EVIDENCE_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function labelForStage(key = '', fallback = '') {
  return STAGE_LABELS[key] || normalizeText(fallback) || labelForEvidence(key)
}

function getShadowIntegration(workspaceOrPayload = {}) {
  if (workspaceOrPayload?.[SELLER_PROCESS_SHADOW_WORKSPACE_KEY]) {
    return workspaceOrPayload[SELLER_PROCESS_SHADOW_WORKSPACE_KEY]
  }
  const fallbackPayload = buildShadowIntegrationFallback(workspaceOrPayload)
  if (fallbackPayload) return fallbackPayload
  return workspaceOrPayload
}

function buildShadowIntegrationFallback(workspace = {}) {
  const row = workspace?.row || workspace?.lead || {}
  const lead = workspace?.lead || row
  const resolution = resolveSellerProcessProfileForOrganisation({
    organisationId: workspace?.organisationId || workspace?.organisation_id,
    organisationSettings: workspace?.organisationSettings || workspace?.organizationSettings,
    sellerProcessProfile: workspace?.sellerProcessProfile || workspace?.seller_process_profile,
    row,
    lead,
  })

  if (resolution.isKingstons !== true) return null

  return buildSellerLeadWorkspaceShadowIntegration({
    row,
    lead,
    contact: workspace?.contact || row?.contact || {},
    appointments: workspace?.appointments || row?.appointments || [],
    listings: workspace?.listings || row?.listings || [],
    documentPackets: workspace?.documentPackets || row?.documentPackets || [],
    leadActivities: workspace?.leadActivities || workspace?.timeline || row?.leadActivities || [],
    organisationSettings: workspace?.organisationSettings || workspace?.organizationSettings || null,
    sellerProcessProfile: resolution.profile,
  })
}

function buildProgressSteps(payload = {}) {
  const workspace = payload.sellerLeadWorkspace || {}
  const completedKeys = new Set(asArray(workspace.completedProcessStageKeys))
  const currentKey = normalizeText(workspace.currentProcessStageKey)
  const stageKeys = [
    ...asArray(workspace.completedProcessStageKeys),
    currentKey,
  ].filter(Boolean)
  return [...new Set(stageKeys)].map((stageKey) => ({
    key: stageKey,
    label: labelForStage(stageKey, stageKey === currentKey ? workspace.currentProcessStageLabel : ''),
    state: completedKeys.has(stageKey) ? 'complete' : stageKey === currentKey ? 'current' : 'upcoming',
    readOnly: true,
  }))
}

function buildMissingEvidence(payload = {}) {
  return asArray(payload.sellerLeadWorkspace?.missingEvidenceKeys).map((key) => ({
    key,
    label: labelForEvidence(key),
    readOnly: true,
  }))
}

function buildActionCards(payload = {}) {
  const documentCenter = payload.sellerDocumentCenter || {}
  const appointments = payload.appointments || {}
  const mandateFlow = payload.mandateFlow || {}
  const listingWorkspace = payload.listingWorkspace || {}
  return [
    {
      key: 'schedule_valuation_appointment',
      label: 'Schedule Valuation Appointment',
      surface: 'appointments',
      pending: asArray(appointments.missingAppointmentEvidenceKeys).includes('valuation_appointment_scheduled'),
      disabled: false,
      readOnly: false,
    },
    {
      key: 'upload_valuation_document',
      label: 'Upload Valuation Document',
      surface: 'sellerDocumentCenter',
      pending: asArray(documentCenter.missingDocumentEvidenceKeys).includes('valuation_document_uploaded'),
      disabled: false,
      readOnly: false,
    },
    {
      key: 'schedule_valuation_presentation',
      label: 'Schedule Valuation Presentation',
      surface: 'appointments',
      pending: asArray(appointments.missingAppointmentEvidenceKeys).includes('valuation_presentation_scheduled') ||
        asArray(appointments.missingAppointmentEvidenceKeys).includes('valuation_presented'),
      disabled: false,
      readOnly: false,
    },
    {
      key: 'complete_seller_pack',
      label: 'Complete Seller Pack',
      surface: 'mandateFlow',
      pending: asArray(mandateFlow.missingSellerPackEvidenceKeys).length > 0,
      disabled: false,
      readOnly: false,
    },
    {
      key: 'prepare_listing',
      label: 'Prepare Listing',
      surface: 'listingWorkspace',
      pending: listingWorkspace.canActivateListing === false,
      disabled: false,
      readOnly: false,
    },
  ]
}

function buildPartnerReadiness(payload = {}) {
  const partners = payload.partners || {}
  return [
    partners.attorneyFirm && {
      key: 'attorney_firm',
      label: 'Transfer Attorney',
      ready: partners.attorneyFirm.ready === true,
      status: partners.attorneyFirm.status || 'not_ready',
      blockerCount: Number(partners.attorneyFirm.blockerCount || 0),
      exposesInternalProcessStages: false,
    },
    partners.bondOriginator && {
      key: 'bond_originator',
      label: 'Bond Originator',
      ready: partners.bondOriginator.ready === true,
      status: partners.bondOriginator.status || 'not_ready',
      blockerCount: Number(partners.bondOriginator.blockerCount || 0),
      exposesInternalProcessStages: false,
    },
  ].filter(Boolean)
}

export function buildSellerProcessWorkspacePanelModel(workspaceOrPayload = {}) {
  const payload = getShadowIntegration(workspaceOrPayload)
  const isKingstonsShadow = payload?.profile && payload.profile !== DEFAULT_SELLER_PROCESS_PROFILE && payload.mode === 'shadow'
  if (!isKingstonsShadow) {
    return Object.freeze({
      visible: false,
      profile: payload?.profile || DEFAULT_SELLER_PROCESS_PROFILE,
      mode: payload?.mode || 'default',
      readOnly: true,
      shadowOnly: true,
      sections: [],
      actionCards: [],
      partnerReadiness: [],
    })
  }

  return Object.freeze({
    visible: true,
    profile: payload.profile,
    mode: payload.mode,
    readOnly: false,
    shadowOnly: false,
    title: 'Kingstons Seller Process',
    currentStageLabel: payload.sellerLeadWorkspace?.currentProcessStageLabel || labelForStage(payload.sellerLeadWorkspace?.currentProcessStageKey),
    percent: payload.sellerLeadWorkspace?.percent || 0,
    sections: [
      {
        key: 'progress',
        label: 'Progress',
        items: buildProgressSteps(payload),
        readOnly: true,
      },
      {
        key: 'missing_evidence',
        label: 'Missing Evidence',
        items: buildMissingEvidence(payload),
        readOnly: true,
      },
    ],
    actionCards: buildActionCards(payload),
    partnerReadiness: buildPartnerReadiness(payload),
  })
}
