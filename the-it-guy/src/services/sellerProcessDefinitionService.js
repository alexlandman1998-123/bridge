import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfile,
  resolveSellerProcessProfileForOrganisation,
} from './sellerProcessProfileService.js'

const DEFAULT_SELLER_STAGE_KEYS = Object.freeze([
  'new_lead',
  'contacted',
  'seller_onboarding_sent',
  'seller_onboarding_submitted',
  'mandate_sent',
  'mandate_signed',
  'listing_created',
  'listing_live',
  'documents_submitted',
])

const DEFAULT_PROCESS_DEFINITION = Object.freeze({
  profile: DEFAULT_SELLER_PROCESS_PROFILE,
  label: 'Default Residential Seller Process',
  runtimeEnabled: true,
  phase: 'current_runtime',
  stages: DEFAULT_SELLER_STAGE_KEYS.map((key) => Object.freeze({
    key,
    defaultStageKey: key,
    requiredEvidenceKeys: Object.freeze([]),
  })),
  appointmentRequirements: Object.freeze([]),
  documentRequirements: Object.freeze([]),
  evidenceGates: Object.freeze([]),
  partnerHandoffs: Object.freeze([]),
})

const KINGSTONS_PROCESS_STAGES = Object.freeze([
  Object.freeze({
    key: 'first_contact',
    label: 'First Contact',
    defaultStageKey: 'contacted',
    requiredEvidenceKeys: Object.freeze(['seller_contacted']),
  }),
  Object.freeze({
    key: 'valuation_appointment_scheduled',
    label: 'Schedule Valuation Appointment',
    defaultStageKey: 'contacted',
    requiredEvidenceKeys: Object.freeze(['valuation_appointment_scheduled']),
  }),
  Object.freeze({
    key: 'formal_valuation_completed',
    label: 'Formal Valuation',
    defaultStageKey: 'contacted',
    requiredEvidenceKeys: Object.freeze(['valuation_document_uploaded']),
  }),
  Object.freeze({
    key: 'valuation_presentation_scheduled',
    label: 'Valuation Presentation',
    defaultStageKey: 'contacted',
    requiredEvidenceKeys: Object.freeze(['valuation_presentation_scheduled']),
  }),
  Object.freeze({
    key: 'valuation_presented',
    label: 'Valuation Presented',
    defaultStageKey: 'seller_onboarding_submitted',
    requiredEvidenceKeys: Object.freeze(['valuation_presented']),
  }),
  Object.freeze({
    key: 'seller_pack_signed',
    label: 'Seller Pack',
    defaultStageKey: 'mandate_signed',
    requiredEvidenceKeys: Object.freeze([
      'mandate_signed',
      'defects_form_signed',
      'fica_pack_signed',
      'seller_pack_readiness_complete',
    ]),
  }),
  Object.freeze({
    key: 'listing_terms_confirmed',
    label: 'Listing Terms',
    defaultStageKey: 'mandate_signed',
    requiredEvidenceKeys: Object.freeze([
      'commission_terms_confirmed',
      'transfer_attorney_nominated',
    ]),
  }),
  Object.freeze({
    key: 'listing_ready',
    label: 'List Property',
    defaultStageKey: 'listing_created',
    requiredEvidenceKeys: Object.freeze(['listing_ready']),
  }),
])

const KINGSTONS_PROCESS_DEFINITION = Object.freeze({
  profile: KINGSTONS_SELLER_PROCESS_PROFILE,
  label: 'Kingstons Residential Seller Process',
  runtimeEnabled: false,
  phase: 'phase2_definition_only',
  stages: KINGSTONS_PROCESS_STAGES,
  appointmentRequirements: Object.freeze([
    Object.freeze({
      key: 'valuation_appointment',
      label: 'Valuation Appointment',
      appointmentType: 'seller_valuation',
      requiredBeforeStage: 'formal_valuation_completed',
      acceptedStatuses: Object.freeze(['scheduled', 'confirmed', 'completed']),
      evidenceKey: 'valuation_appointment_scheduled',
    }),
    Object.freeze({
      key: 'valuation_presentation',
      label: 'Valuation Presentation Appointment',
      appointmentType: 'valuation_presentation',
      requiredBeforeStage: 'valuation_presented',
      acceptedStatuses: Object.freeze(['requested', 'scheduled', 'confirmed', 'awaiting_confirmation', 'completed']),
      evidenceKey: 'valuation_presentation_scheduled',
    }),
  ]),
  documentRequirements: Object.freeze([
    Object.freeze({
      key: 'valuation_document',
      label: 'Formal Valuation Document',
      documentType: 'valuation_document',
      requiredBeforeStage: 'valuation_presentation_scheduled',
      acceptedEvidenceModes: Object.freeze(['manual_upload']),
      evidenceKey: 'valuation_document_uploaded',
    }),
    Object.freeze({
      key: 'signed_mandate',
      label: 'Signed Mandate',
      documentType: 'signed_mandate',
      requiredBeforeStage: 'seller_pack_signed',
      acceptedEvidenceModes: Object.freeze(['digital_signature', 'manual_upload']),
      evidenceKey: 'mandate_signed',
    }),
    Object.freeze({
      key: 'signed_defect_form',
      label: 'Signed Defect Form',
      documentType: 'signed_defect_form',
      requiredBeforeStage: 'seller_pack_signed',
      acceptedEvidenceModes: Object.freeze(['digital_signature', 'manual_upload']),
      evidenceKey: 'defects_form_signed',
    }),
    Object.freeze({
      key: 'signed_fica_form',
      label: 'Signed FICA Form',
      documentType: 'signed_fica_form',
      requiredBeforeStage: 'seller_pack_signed',
      acceptedEvidenceModes: Object.freeze(['digital_signature', 'manual_upload']),
      evidenceKey: 'fica_pack_signed',
    }),
    Object.freeze({
      key: 'seller_pack_readiness_complete',
      label: 'Seller Pack Readiness',
      documentType: 'seller_pack_readiness',
      requiredBeforeStage: 'seller_pack_signed',
      acceptedEvidenceModes: Object.freeze(['manual_upload']),
      evidenceKey: 'seller_pack_readiness_complete',
    }),
  ]),
  evidenceGates: Object.freeze([
    Object.freeze({
      key: 'seller_contacted',
      source: 'activity',
      requiredForStage: 'first_contact',
      impliedByAppointmentTypes: Object.freeze(['seller_valuation', 'seller_consultation', 'viewing']),
    }),
    Object.freeze({
      key: 'valuation_appointment_scheduled',
      source: 'appointment',
      requiredForStage: 'valuation_appointment_scheduled',
      appointmentType: 'seller_valuation',
      appointmentTypeAliases: Object.freeze(['seller_consultation', 'viewing']),
      acceptedStatuses: Object.freeze(['scheduled', 'confirmed', 'awaiting_confirmation', 'completed']),
    }),
    Object.freeze({
      key: 'valuation_document_uploaded',
      source: 'document',
      requiredForStage: 'formal_valuation_completed',
      documentTypes: Object.freeze(['valuation_document']),
      acceptedStatuses: Object.freeze(['uploaded', 'under_review', 'approved', 'completed']),
    }),
    Object.freeze({
      key: 'valuation_presentation_scheduled',
      source: 'appointment',
      requiredForStage: 'valuation_presentation_scheduled',
      appointmentType: 'valuation_presentation',
      acceptedStatuses: Object.freeze(['requested', 'scheduled', 'confirmed', 'awaiting_confirmation', 'completed']),
    }),
    Object.freeze({
      key: 'valuation_presented',
      source: 'activity',
      requiredForStage: 'valuation_presented',
      appointmentType: 'valuation_presentation',
      acceptedStatuses: Object.freeze(['completed']),
    }),
    Object.freeze({
      key: 'mandate_signed',
      source: 'document',
      requiredForStage: 'seller_pack_signed',
      documentTypes: Object.freeze(['seller_mandate', 'signed_mandate', 'mandate_signature', 'manual_mandate_evidence']),
      acceptedStatuses: Object.freeze(['signed', 'uploaded', 'approved', 'completed']),
    }),
    Object.freeze({
      key: 'defects_form_signed',
      source: 'document',
      requiredForStage: 'seller_pack_signed',
      documentTypes: Object.freeze(['signed_defect_form', 'defects_disclosure_form', 'defects_form', 'property_defects_disclosure']),
      acceptedStatuses: Object.freeze(['signed', 'uploaded', 'approved', 'completed']),
    }),
    Object.freeze({
      key: 'fica_pack_signed',
      source: 'document',
      requiredForStage: 'seller_pack_signed',
      documentTypes: Object.freeze(['signed_fica_form', 'seller_fica_pack', 'fica_pack', 'seller_fica']),
      acceptedStatuses: Object.freeze(['signed', 'uploaded', 'approved', 'completed']),
    }),
    Object.freeze({
      key: 'seller_pack_readiness_complete',
      source: 'document',
      requiredForStage: 'seller_pack_signed',
      documentTypes: Object.freeze(['seller_pack_readiness']),
      acceptedStatuses: Object.freeze(['signed', 'uploaded', 'approved', 'completed']),
      requiresAllSellerPackDocuments: true,
    }),
    Object.freeze({
      key: 'commission_terms_confirmed',
      source: 'listing_terms',
      requiredForStage: 'listing_terms_confirmed',
    }),
    Object.freeze({
      key: 'transfer_attorney_nominated',
      source: 'listing_terms',
      requiredForStage: 'listing_terms_confirmed',
    }),
    Object.freeze({
      key: 'listing_ready',
      source: 'listing',
      requiredForStage: 'listing_ready',
      acceptedStatuses: Object.freeze(['draft', 'created', 'mandate_signed', 'active', 'live', 'published']),
    }),
  ]),
  partnerHandoffs: Object.freeze([
    Object.freeze({
      key: 'transfer_attorney_handoff',
      partnerType: 'attorney_firm',
      readyAfterStage: 'listing_terms_confirmed',
      exposesInternalKingstonsStages: false,
    }),
    Object.freeze({
      key: 'bond_originator_context',
      partnerType: 'bond_originator',
      readyAfterStage: 'listing_terms_confirmed',
      exposesInternalKingstonsStages: false,
    }),
  ]),
})

const SELLER_PROCESS_DEFINITIONS = Object.freeze({
  [DEFAULT_SELLER_PROCESS_PROFILE]: DEFAULT_PROCESS_DEFINITION,
  [KINGSTONS_SELLER_PROCESS_PROFILE]: KINGSTONS_PROCESS_DEFINITION,
})

function cloneDefinition(value) {
  return JSON.parse(JSON.stringify(value))
}

export function getSellerProcessDefinitionByProfile(profile = DEFAULT_SELLER_PROCESS_PROFILE) {
  const resolution = resolveSellerProcessProfile({ sellerProcessProfile: profile })
  const definition = SELLER_PROCESS_DEFINITIONS[resolution.profile] || DEFAULT_PROCESS_DEFINITION
  return Object.freeze({
    ...cloneDefinition(definition),
    resolution,
  })
}

export function getSellerProcessDefinition(source = {}) {
  const resolution = resolveSellerProcessProfileForOrganisation(source)
  const definition = SELLER_PROCESS_DEFINITIONS[resolution.profile] || DEFAULT_PROCESS_DEFINITION
  return Object.freeze({
    ...cloneDefinition(definition),
    resolution,
  })
}

export function listSellerProcessDefinitions() {
  return Object.freeze(Object.values(SELLER_PROCESS_DEFINITIONS).map(cloneDefinition))
}

export function getSellerProcessStageKeys(source = {}) {
  return getSellerProcessDefinition(source).stages.map((stage) => stage.key)
}

export function getSellerProcessEvidenceKeys(source = {}) {
  return getSellerProcessDefinition(source).evidenceGates.map((gate) => gate.key)
}
