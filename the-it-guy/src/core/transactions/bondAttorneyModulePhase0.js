import { ATTORNEY_WORKFLOW_STAGE_DEFINITIONS } from '../../constants/attorneyWorkflowStages.js'
import { resolveLegalDocumentRequirements } from '../../services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import { listLegalDocumentDefinitions } from '../documents/legalDocumentCatalog.js'

export const BOND_ATTORNEY_PHASE0_VERSION = 'bond_attorney_module_phase0_v1'

export const BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY = Object.freeze({
  role: 'bond_attorney',
  laneKey: 'bond',
  appointmentAuthority: 'new_lending_bank',
  primaryOutcome: 'Register a bank-compliant bond in sync with transfer readiness and registration.',
  owns: Object.freeze([
    'bank_instruction_acceptance',
    'bank_reference_and_approved_amount',
    'bank_conditions_and_requirements',
    'bond_document_drafting_and_signing',
    'bank_submission_and_approval_to_lodge',
    'guarantees_and_transfer_handoff',
    'simultaneous_lodgement',
    'bond_registration_and_bank_closeout',
  ]),
  coordinatesWith: Object.freeze(['transfer_attorney', 'cancellation_attorney', 'bank_or_originator', 'buyer']),
  doesNotOwn: Object.freeze([
    'transfer_document_preparation',
    'seller_transfer_fica',
    'rates_or_levy_clearance',
    'existing_bond_cancellation_figures',
    'deeds_office_or_bank_portal_decisions',
    'approved_legal_wording_without_firm_or_bank_governance',
  ]),
})

export const BOND_ATTORNEY_PHASE0_PILOT_SCOPE = Object.freeze({
  firstPilot: Object.freeze({
    id: 'standard_individual_freehold_bank_bond',
    transaction: Object.freeze({
      finance_type: 'bond',
      transaction_type: 'resale',
      buyer_entity_type: 'individual',
      seller_entity_type: 'individual',
      property_tenure: 'freehold',
      seller_has_existing_bond: false,
    }),
    included: Object.freeze([
      'single_new_bank_instruction',
      'individual_buyer',
      'freehold_residential_property',
      'ordinary_bond_amount_and_reference_capture',
      'standard_bank_conditions',
      'manual_bank_portal_submission_evidence',
    ]),
  }),
  heldForLater: Object.freeze([
    'company_or_trust_buyer_authority',
    'sectional_title_or_hoa_specific_conditions',
    'commercial_or_vat_transactions',
    'multiple_or_substituted_bonds',
    'development_sale_bond_packs',
    'automated_bank_or_deeds_office_integrations',
    'final mortgage-bond instrument generation without approved firm and bank templates',
  ]),
})

const automationItem = (definition) => {
  const strategy = definition.strategy || 'generate_now'
  return Object.freeze({
    requiredApproval: strategy === 'ingest_only' ? 'source_evidence_required' : 'firm_operational_approval',
    generatedStatus: strategy === 'ingest_only' ? 'not_generated' : 'draft_until_reviewed',
    ...definition,
    strategy,
  })
}

export const BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION = Object.freeze([
  automationItem({
    id: 'instruction_acknowledgement',
    label: 'Instruction acknowledgement and matter opening note',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Confirm receipt of the bank instruction and open the matter with the firm reference.',
  }),
  automationItem({
    id: 'buyer_fica_request_pack',
    label: 'Buyer FICA request pack and deficiency reminders',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Tell the buyer exactly what the bond team still needs for bank and FICA readiness.',
  }),
  automationItem({
    id: 'bank_condition_schedule',
    label: 'Bank condition checklist and outstanding-condition schedule',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Turn lender requirements into owned, dated follow-up work.',
  }),
  automationItem({
    id: 'bond_signing_appointment_pack',
    label: 'Bond signing appointment letter and signing checklist',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Prepare the buyer for signing and reduce repeated secretary follow-up.',
  }),
  automationItem({
    id: 'guarantee_request_cover',
    label: 'Guarantee request cover and guarantee schedule',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Package guarantee values, wording status and expiry dates for transfer coordination.',
  }),
  automationItem({
    id: 'lodgement_readiness_cover',
    label: 'Lodgement readiness checklist and cover sheet',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Prove the bond pack is ready before simultaneous lodgement.',
  }),
  automationItem({
    id: 'registration_notification',
    label: 'Registration notification',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Notify linked professionals and the buyer when bond registration is confirmed.',
  }),
  automationItem({
    id: 'bank_closeout_report',
    label: 'Bank close-out report',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Close the bank file with final references, registration facts and outstanding exceptions.',
  }),
  automationItem({
    id: 'power_of_attorney_to_pass_mortgage_bond',
    label: 'Power of attorney to pass mortgage bond',
    strategy: 'template_controlled',
    riskTier: 'legal_instrument',
    targetPhase: 7,
    requiredApproval: 'firm_and_bank_template_approval',
    purpose: 'Prepare a governed draft only when the exact bank or firm template is approved.',
  }),
  automationItem({
    id: 'company_or_trust_authority_resolution',
    label: 'Company or trust authority resolution',
    strategy: 'template_controlled',
    riskTier: 'legal_instrument',
    targetPhase: 7,
    requiredApproval: 'firm_template_approval',
    purpose: 'Support entity buyers after the individual/freehold pilot proves stable.',
  }),
  automationItem({
    id: 'mortgage_bond_draft',
    label: 'Mortgage bond or sectional mortgage bond draft',
    strategy: 'template_controlled',
    riskTier: 'legal_instrument',
    targetPhase: 7,
    requiredApproval: 'firm_and_bank_template_approval',
    purpose: 'Draft only against a governed, bank-specific template and attorney review workflow.',
  }),
  automationItem({
    id: 'banking_mandate_or_debit_order',
    label: 'Banking mandate or debit-order declaration',
    strategy: 'template_controlled',
    riskTier: 'bank_controlled',
    targetPhase: 7,
    requiredApproval: 'bank_template_approval',
    purpose: 'Use bank wording only; never fall back to generic mandate language.',
  }),
  automationItem({
    id: 'bond_instruction',
    label: 'Bank instruction',
    strategy: 'ingest_only',
    riskTier: 'bank_controlled',
    targetPhase: 3,
    purpose: 'Store, classify and route the lender instruction; do not originate it.',
  }),
  automationItem({
    id: 'bond_grant_letter',
    label: 'Grant or approval letter',
    strategy: 'ingest_only',
    riskTier: 'bank_controlled',
    targetPhase: 3,
    purpose: 'Store the bank approval evidence and extract checked facts.',
  }),
  automationItem({
    id: 'bank_approval_to_lodge',
    label: 'Bank approval to lodge',
    strategy: 'ingest_only',
    riskTier: 'bank_controlled',
    targetPhase: 8,
    purpose: 'Use as evidence for lodgement readiness; do not synthesize approval.',
  }),
  automationItem({
    id: 'deeds_registration_evidence',
    label: 'Registration evidence and Deeds Office outcomes',
    strategy: 'ingest_only',
    riskTier: 'external_registry',
    targetPhase: 8,
    purpose: 'Attach real registration evidence and rejection notes from the external process.',
  }),
])

export const BOND_ATTORNEY_PHASE0_DATA_CONTRACT = Object.freeze([
  'bank_name',
  'bank_reference',
  'approved_bond_amount',
  'mortgagor_identity_and_capacity',
  'mortgagee_identity',
  'property_legal_description',
  'title_deed_or_deeds_office_reference',
  'buyer_marital_or_entity_authority',
  'bank_conditions',
  'guarantee_values_and_expiry',
  'signing_method_and_signed_pack_status',
  'bank_submission_reference',
  'approval_to_lodge_reference',
  'lodgement_reference',
  'registration_date',
])

export const BOND_ATTORNEY_PHASE0_BASELINE_METRICS = Object.freeze([
  'time_from_instruction_to_acceptance',
  'time_from_instruction_to_first_missing_info_request',
  'open_bank_condition_count',
  'condition_owner_sla_breach_count',
  'draft_pack_rework_count',
  'buyer_signing_reschedule_count',
  'bank_submission_rejection_count',
  'guarantee_wording_rework_count',
  'days_waiting_for_transfer_or_cancellation_handoff',
  'lodgement_rejection_count',
  'time_from_registration_to_bank_closeout',
])

export const BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS = Object.freeze([
  Object.freeze({
    id: 'bond_pack_workspace_missing',
    severity: 'critical',
    targetPhase: 3,
    exitEvidence: 'Bond pack workspace shows source facts, requirements, generation state, review state and evidence in one place.',
  }),
  Object.freeze({
    id: 'bond_operational_generator_missing',
    severity: 'high',
    targetPhase: 4,
    exitEvidence: 'Approved low-risk operational documents can be generated as drafts and linked back to the matter.',
  }),
  Object.freeze({
    id: 'bank_conditions_not_structured',
    severity: 'high',
    targetPhase: 5,
    exitEvidence: 'Bank conditions have typed owners, evidence, blocking status and due dates.',
  }),
  Object.freeze({
    id: 'signing_workspace_missing',
    severity: 'high',
    targetPhase: 6,
    exitEvidence: 'Bond signing pack tracks each signer, capacity, original/wet-ink requirements and signed evidence.',
  }),
  Object.freeze({
    id: 'legal_instrument_templates_not_approved',
    severity: 'critical',
    targetPhase: 7,
    exitEvidence: 'Firm and bank approved templates exist with versioned governance before legal instruments are drafted.',
  }),
  Object.freeze({
    id: 'lodgement_registration_evidence_not_packet_bound',
    severity: 'high',
    targetPhase: 8,
    exitEvidence: 'Approval to lodge, guarantee, lodgement and registration facts are evidence-backed, not stage-only.',
  }),
  Object.freeze({
    id: 'bank_and_deeds_integrations_absent',
    severity: 'medium',
    targetPhase: 9,
    exitEvidence: 'Manual evidence remains available, with optional inbound bank and registry signals reconciled safely.',
  }),
])

const EXPECTED_BOND_STAGE_KEYS = Object.freeze([
  'bond_instruction_received',
  'bank_reference_captured',
  'bond_approval_letter_received',
  'bank_requirements_confirmed',
  'bank_conditions_outstanding',
  'bank_conditions_resolved',
  'bond_documents_prepared',
  'buyer_bond_signing_scheduled',
  'buyer_signed_bond_documents',
  'bond_documents_sent_to_bank',
  'bank_approval_to_lodge_received',
  'guarantees_issued',
  'guarantee_wording_accepted',
  'bond_lodgement_ready',
  'bond_lodged',
  'bond_registered',
  'bond_close_out_complete',
])

const EXPECTED_BOND_REQUIREMENT_IDS = Object.freeze([
  'bond_instruction',
  'bond_grant_letter',
  'bank_requirements',
  'buyer_bank_fica',
  'bond_documents',
  'bank_signing_documents',
  'guarantees_issued',
])

const strategyCounts = (items) => items.reduce((acc, item) => {
  acc[item.strategy] = (acc[item.strategy] || 0) + 1
  return acc
}, {})

const generatedBondCatalogKeys = () => listLegalDocumentDefinitions()
  .filter((definition) => {
    const haystack = [definition.key, definition.packetType, definition.label, definition.shortLabel]
      .map((value) => String(value || '').toLowerCase())
      .join(' ')
    return haystack.includes('bond') || haystack.includes('mortgage') || haystack.includes('guarantee')
  })
  .map((definition) => definition.key)

export function buildBondAttorneyPhase0BaselineReport() {
  const stageKeys = (ATTORNEY_WORKFLOW_STAGE_DEFINITIONS.bond || []).map((stage) => stage.key)
  const missingStageKeys = EXPECTED_BOND_STAGE_KEYS.filter((key) => !stageKeys.includes(key))
  const requirementsReport = resolveLegalDocumentRequirements(BOND_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.transaction)
  const bondRequirementIds = requirementsReport.requirements
    .filter((requirement) => requirement.laneKey === 'bond')
    .map((requirement) => requirement.id)
  const missingRequirementIds = EXPECTED_BOND_REQUIREMENT_IDS.filter((id) => !bondRequirementIds.includes(id))
  const bondCatalogKeys = generatedBondCatalogKeys()
  const automationCounts = strategyCounts(BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION)

  return Object.freeze({
    version: BOND_ATTORNEY_PHASE0_VERSION,
    laneKey: BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.laneKey,
    stageCount: stageKeys.length,
    missingStageKeys,
    bondRequirementIds,
    missingRequirementIds,
    signingRequirementIds: requirementsReport.signingRequirements
      .filter((requirement) => requirement.laneKey === 'bond')
      .map((requirement) => requirement.id),
    generatedBondCatalogKeys: bondCatalogKeys,
    generatorCoverageStatus: bondCatalogKeys.length ? 'started' : 'not_started',
    automationCounts,
    dataContractFieldCount: BOND_ATTORNEY_PHASE0_DATA_CONTRACT.length,
    baselineMetricCount: BOND_ATTORNEY_PHASE0_BASELINE_METRICS.length,
    releaseBlockerCount: BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length,
    readyForPhase1: missingStageKeys.length === 0 && missingRequirementIds.length === 0,
  })
}

export function listBondAttorneyPhase0ExitGateFailures() {
  const report = buildBondAttorneyPhase0BaselineReport()
  const failures = []
  if (report.missingStageKeys.length) failures.push({ id: 'missing_bond_stages', detail: report.missingStageKeys })
  if (report.missingRequirementIds.length) failures.push({ id: 'missing_bond_document_requirements', detail: report.missingRequirementIds })
  if (!report.automationCounts.generate_now) failures.push({ id: 'missing_generate_now_document_candidates' })
  if (!report.automationCounts.template_controlled) failures.push({ id: 'missing_template_controlled_document_candidates' })
  if (!report.automationCounts.ingest_only) failures.push({ id: 'missing_ingest_only_document_candidates' })
  if (report.dataContractFieldCount < 10) failures.push({ id: 'data_contract_too_thin', detail: report.dataContractFieldCount })
  if (report.baselineMetricCount < 8) failures.push({ id: 'baseline_metrics_too_thin', detail: report.baselineMetricCount })
  return failures
}
