import {
  LEGAL_ROLE_AUTHORITY_MATRIX,
  LEGAL_ROLE_COORDINATION_STATES,
  LEGAL_ROLE_TYPES,
} from './legalRoleCoordinationContract.js'
import { resolveLegalRequirements } from '../../services/attorneyWorkflow/attorneyWorkflowResolver.js'

export const ATTORNEY_THREE_ROLE_BASELINE_VERSION = 'attorney_three_role_world_class_phase0_v1'

const roleResponsibility = ({ roleType, laneKey, valueProposition, owns, evidence }) => Object.freeze({
  roleType,
  laneKey,
  valueProposition,
  owns: Object.freeze(owns),
  evidence: Object.freeze(evidence),
  appointmentAuthority: LEGAL_ROLE_AUTHORITY_MATRIX[roleType].appointmentAuthorities,
  formalInstructors: LEGAL_ROLE_AUTHORITY_MATRIX[roleType].formalInstructors,
})

export const ATTORNEY_WORLD_CLASS_ROLE_RESPONSIBILITIES = Object.freeze({
  [LEGAL_ROLE_TYPES.transferAttorney]: roleResponsibility({
    roleType: LEGAL_ROLE_TYPES.transferAttorney,
    laneKey: 'transfer',
    valueProposition: 'One coordinated transfer file from instruction through registration and post-registration handover.',
    owns: ['transfer_instruction', 'fica_and_entity_readiness', 'transfer_documents', 'lodgement_and_registration', 'cross_lane_coordination'],
    evidence: ['seller_nomination', 'accepted_transfer_instruction', 'signed_transfer_documents', 'registration_evidence'],
  }),
  [LEGAL_ROLE_TYPES.bondAttorney]: roleResponsibility({
    roleType: LEGAL_ROLE_TYPES.bondAttorney,
    laneKey: 'bond',
    valueProposition: 'A bank-compliant bond matter that stays synchronised with transfer readiness and registration.',
    owns: ['bank_instruction', 'bank_conditions', 'bond_documents', 'guarantees', 'bond_lodgement_and_registration'],
    evidence: ['bank_appointment', 'accepted_bank_instruction', 'bank_conditions_satisfied', 'bond_registration_evidence'],
  }),
  [LEGAL_ROLE_TYPES.cancellationAttorney]: roleResponsibility({
    roleType: LEGAL_ROLE_TYPES.cancellationAttorney,
    laneKey: 'cancellation',
    valueProposition: 'Visible, time-bound cancellation from lender appointment to discharge, without silent transfer blockers.',
    owns: ['existing_bank_instruction', 'cancellation_figures', 'guarantee_requirements', 'consent_to_cancellation', 'cancellation_registration'],
    evidence: ['existing_bank_appointment', 'accepted_bank_instruction', 'valid_cancellation_figures', 'cancellation_registration_evidence'],
  }),
})

const scenario = (definition) => Object.freeze({ coverageStatus: 'covered', expectedMissingFields: [], expectedDocuments: [], ...definition })

export const ATTORNEY_THREE_ROLE_SCENARIOS = Object.freeze([
  scenario({
    id: 'cash_individual_resale',
    category: 'core',
    label: 'Cash individual resale',
    transaction: { finance_type: 'cash', transaction_type: 'resale', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney],
    expectedDocuments: ['buyer_id_document', 'seller_id_document'],
  }),
  scenario({
    id: 'bond_company_buyer',
    category: 'core',
    label: 'Bond-financed company buyer',
    transaction: { finance_type: 'bond', transaction_type: 'private_sale', buyer_entity_type: 'company', seller_entity_type: 'individual', seller_has_existing_bond: false },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney, LEGAL_ROLE_TYPES.bondAttorney],
    expectedDocuments: ['buyer_company_resolution', 'bond_instruction', 'bank_requirements'],
  }),
  scenario({
    id: 'hybrid_trust_full_coordination',
    category: 'core',
    label: 'Hybrid purchase with trust seller and existing bond',
    transaction: { funding_type: 'partial_bond', property_transaction_type: 'private_sale', buyer_entity_type: 'individual', seller_entity_type: 'trust', seller_has_existing_bond: true },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney, LEGAL_ROLE_TYPES.bondAttorney, LEGAL_ROLE_TYPES.cancellationAttorney],
    expectedDocuments: ['seller_trust_deed', 'bond_instruction', 'cancellation_figures'],
  }),
  scenario({
    id: 'development_trust_cash',
    category: 'entity_and_development',
    label: 'Cash development sale to a trust',
    transaction: { finance_type: 'cash', development_id: 'phase0-development', buyer_type: 'trust', seller_type: 'company', seller_has_existing_bond: false },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney],
    expectedDocuments: ['developer_documents', 'buyer_trust_deed', 'seller_company_resolution'],
  }),
  scenario({
    id: 'commercial_vat_company',
    category: 'commercial',
    label: 'Commercial VAT transaction between companies',
    transaction: { finance_type: 'cash', transaction_type: 'commercial', property_type: 'commercial', buyer_entity_type: 'company', seller_entity_type: 'company', vat_treatment: 'vat', seller_has_existing_bond: false },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney],
    expectedDocuments: ['buyer_company_resolution', 'seller_company_resolution', 'vat_status_confirmation'],
  }),
  scenario({
    id: 'missing_finance_fallback',
    category: 'data_quality',
    label: 'Missing finance type is surfaced, not guessed',
    transaction: { transaction_type: 'commercial', property_type: 'commercial', buyer_entity_type: 'company', seller_entity_type: 'company' },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney],
    expectedMissingFields: ['finance_type'],
  }),
  scenario({
    id: 'bond_appointment_replacement',
    category: 'exception',
    label: 'Bond attorney declines and must be replaced',
    transaction: { finance_type: 'bond', buyer_entity_type: 'individual', seller_entity_type: 'individual', seller_has_existing_bond: false },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney, LEGAL_ROLE_TYPES.bondAttorney],
    coordinationState: LEGAL_ROLE_COORDINATION_STATES.replacementRequired,
  }),
  scenario({
    id: 'cancellation_figures_expired',
    category: 'exception',
    label: 'Cancellation figures expire before guarantees',
    transaction: { finance_type: 'bond', buyer_entity_type: 'individual', seller_entity_type: 'individual', cancellation_required: true },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney, LEGAL_ROLE_TYPES.bondAttorney, LEGAL_ROLE_TYPES.cancellationAttorney],
    expectedDocuments: ['cancellation_figures', 'bank_requirements'],
    blocker: 'valid_cancellation_figures',
  }),
  scenario({
    id: 'bank_condition_failure',
    category: 'exception',
    label: 'Bank condition blocks bond readiness',
    transaction: { finance_type: 'bond', buyer_entity_type: 'company', seller_entity_type: 'individual', seller_has_existing_bond: false },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney, LEGAL_ROLE_TYPES.bondAttorney],
    expectedDocuments: ['bank_requirements'],
    blocker: 'bank_conditions_satisfied',
  }),
  scenario({
    id: 'deeds_office_relodgement',
    category: 'exception',
    label: 'Linked matters are rejected and relodged',
    transaction: { finance_type: 'hybrid', transaction_type: 'resale', buyer_entity_type: 'trust', seller_entity_type: 'company', seller_has_existing_bond: true },
    expectedRoles: [LEGAL_ROLE_TYPES.transferAttorney, LEGAL_ROLE_TYPES.bondAttorney, LEGAL_ROLE_TYPES.cancellationAttorney],
    expectedDocuments: ['buyer_trust_deed', 'seller_company_resolution'],
    blocker: 'deeds_office_rejection_resolution',
  }),
])

const pilotFixture = (definition) => Object.freeze(definition)

export const ATTORNEY_THREE_ROLE_PILOT_FIXTURES = Object.freeze([
  pilotFixture({ id: 'pilot_transfer_only', scenarioId: 'cash_individual_resale', firmIds: { transfer_attorney: '00000000-0000-4000-8000-000000000101' }, userIds: { transfer_attorney: '00000000-0000-4000-8000-000000000111' } }),
  pilotFixture({ id: 'pilot_transfer_and_bond', scenarioId: 'bond_company_buyer', firmIds: { transfer_attorney: '00000000-0000-4000-8000-000000000201', bond_attorney: '00000000-0000-4000-8000-000000000202' }, userIds: { transfer_attorney: '00000000-0000-4000-8000-000000000211', bond_attorney: '00000000-0000-4000-8000-000000000212' } }),
  pilotFixture({ id: 'pilot_three_role', scenarioId: 'hybrid_trust_full_coordination', firmIds: { transfer_attorney: '00000000-0000-4000-8000-000000000301', bond_attorney: '00000000-0000-4000-8000-000000000302', cancellation_attorney: '00000000-0000-4000-8000-000000000303' }, userIds: { transfer_attorney: '00000000-0000-4000-8000-000000000311', bond_attorney: '00000000-0000-4000-8000-000000000312', cancellation_attorney: '00000000-0000-4000-8000-000000000313' } }),
])

export const ATTORNEY_THREE_ROLE_RELEASE_BLOCKERS = Object.freeze([
  Object.freeze({ id: 'live_assignment_coverage_incomplete', severity: 'critical', targetPhase: 7, exitEvidence: 'Required role coverage and accepted instructions meet the pilot launch threshold.' }),
])

export function evaluateAttorneyThreeRoleScenario(definition) {
  const requirements = resolveLegalRequirements(definition.transaction)
  return {
    scenarioId: definition.id,
    roles: requirements.requiredAttorneyRoles,
    documents: requirements.documentRequirements.map((item) => item.id),
    missingFields: requirements.facts.missingFields,
    warnings: requirements.warnings,
  }
}

export function buildAttorneyThreeRoleBaselineReport() {
  const scenarioResults = ATTORNEY_THREE_ROLE_SCENARIOS.map((definition) => {
    const actual = evaluateAttorneyThreeRoleScenario(definition)
    const roleMismatch = [...actual.roles].sort().join('|') !== [...definition.expectedRoles].sort().join('|')
    const missingDocuments = definition.expectedDocuments.filter((id) => !actual.documents.includes(id))
    const missingExpectedFields = definition.expectedMissingFields.filter((id) => !actual.missingFields.includes(id))
    return { scenarioId: definition.id, roleMismatch, missingDocuments, missingExpectedFields, passed: !roleMismatch && !missingDocuments.length && !missingExpectedFields.length }
  })

  return {
    version: ATTORNEY_THREE_ROLE_BASELINE_VERSION,
    scenarioCount: scenarioResults.length,
    exceptionScenarioCount: ATTORNEY_THREE_ROLE_SCENARIOS.filter((item) => item.category === 'exception').length,
    pilotFixtureCount: ATTORNEY_THREE_ROLE_PILOT_FIXTURES.length,
    releaseBlockerCount: ATTORNEY_THREE_ROLE_RELEASE_BLOCKERS.length,
    failedScenarios: scenarioResults.filter((result) => !result.passed),
    scenarios: scenarioResults,
  }
}
