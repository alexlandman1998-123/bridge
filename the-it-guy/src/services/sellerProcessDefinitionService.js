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
    label: 'Formal Valuation Completed',
    defaultStageKey: 'contacted',
    requiredEvidenceKeys: Object.freeze(['valuation_document_uploaded']),
  }),
  Object.freeze({
    key: 'valuation_presentation_scheduled',
    label: 'Schedule Valuation Presentation',
    defaultStageKey: 'contacted',
    requiredEvidenceKeys: Object.freeze(['valuation_presentation_scheduled']),
  }),
  Object.freeze({
    key: 'valuation_presented',
    label: 'Valuation Presented In Person',
    defaultStageKey: 'seller_onboarding_submitted',
    requiredEvidenceKeys: Object.freeze(['valuation_presented']),
  }),
  Object.freeze({
    key: 'seller_pack_signed',
    label: 'Seller Pack Signed',
    defaultStageKey: 'mandate_signed',
    requiredEvidenceKeys: Object.freeze([
      'mandate_signed',
      'defects_form_signed',
      'fica_pack_signed',
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
      acceptedStatuses: Object.freeze(['scheduled', 'confirmed', 'completed']),
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
      key: 'seller_mandate',
      label: 'Seller Mandate',
      documentType: 'seller_mandate',
      requiredBeforeStage: 'seller_pack_signed',
      acceptedEvidenceModes: Object.freeze(['digital_signature', 'manual_upload']),
      evidenceKey: 'mandate_signed',
    }),
    Object.freeze({
      key: 'defects_disclosure_form',
      label: 'Defects Disclosure Form',
      documentType: 'defects_disclosure_form',
      requiredBeforeStage: 'seller_pack_signed',
      acceptedEvidenceModes: Object.freeze(['digital_signature', 'manual_upload']),
      evidenceKey: 'defects_form_signed',
    }),
    Object.freeze({
      key: 'seller_fica_pack',
      label: 'Seller FICA Pack',
      documentType: 'seller_fica_pack',
      requiredBeforeStage: 'seller_pack_signed',
      acceptedEvidenceModes: Object.freeze(['digital_signature', 'manual_upload']),
      evidenceKey: 'fica_pack_signed',
    }),
  ]),
  evidenceGates: Object.freeze([
    Object.freeze({ key: 'seller_contacted', source: 'activity', requiredForStage: 'first_contact' }),
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
      acceptedStatuses: Object.freeze(['scheduled', 'confirmed', 'awaiting_confirmation', 'completed']),
    }),
    Object.freeze({
      key: 'valuation_presented',
      source: 'appointment',
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
      documentTypes: Object.freeze(['defects_disclosure_form', 'defects_form', 'property_defects_disclosure']),
      acceptedStatuses: Object.freeze(['signed', 'uploaded', 'approved', 'completed']),
    }),
    Object.freeze({
      key: 'fica_pack_signed',
      source: 'document',
      requiredForStage: 'seller_pack_signed',
      documentTypes: Object.freeze(['seller_fica_pack', 'fica_pack', 'seller_fica']),
      acceptedStatuses: Object.freeze(['signed', 'uploaded', 'approved', 'completed']),
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
      readyAfterStage: 'seller_pack_signed',
      exposesInternalKingstonsStages: false,
    }),
    Object.freeze({
      key: 'bond_originator_context',
      partnerType: 'bond_originator',
      readyAfterStage: 'seller_pack_signed',
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
