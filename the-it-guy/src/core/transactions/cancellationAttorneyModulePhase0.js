import {
  ATTORNEY_WORKFLOW_STAGE_DEFINITIONS,
  getAttorneyDocumentRequirementKeysForLane,
} from '../../constants/attorneyWorkflowStages.js'
import { resolveLegalDocumentRequirements } from '../../services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js'
import { listLegalDocumentDefinitions } from '../documents/legalDocumentCatalog.js'

export const CANCELLATION_ATTORNEY_PHASE0_VERSION = 'cancellation_attorney_module_phase0_v1'

export const CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY = Object.freeze({
  role: 'cancellation_attorney',
  laneKey: 'cancellation',
  appointmentAuthority: 'existing_lending_bank',
  primaryOutcome: 'Cancel the seller existing bond in sync with transfer lodgement, registration, settlement and discharge close-out.',
  owns: Object.freeze([
    'existing_bond_and_lender_instruction_intake',
    'cancellation_bank_and_account_reference',
    'ninety_day_notice_and_penalty_risk',
    'cancellation_figures_request_and_validity',
    'guarantee_requirements_and_acceptance',
    'bank_cancellation_documents_and_seller_signing',
    'simultaneous_lodgement_readiness',
    'cancellation_registration_evidence',
    'settlement_reconciliation_and_closeout',
  ]),
  coordinatesWith: Object.freeze(['transfer_attorney', 'bond_attorney', 'existing_lending_bank', 'seller']),
  doesNotOwn: Object.freeze([
    'transfer_document_preparation',
    'buyer_bond_approval_or_bank_conditions',
    'new_bond_registration',
    'rates_or_levy_clearance',
    'deeds_office_or_bank_portal_decisions',
    'approved_legal_wording_without_firm_or_bank_governance',
    'settlement_payment_execution_by_external_bank',
  ]),
})

export const CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE = Object.freeze({
  firstPilot: Object.freeze({
    id: 'standard_individual_freehold_existing_bond_cancellation',
    transaction: Object.freeze({
      finance_type: 'bond',
      transaction_type: 'resale',
      buyer_entity_type: 'individual',
      seller_entity_type: 'individual',
      property_tenure: 'freehold',
      seller_has_existing_bond: true,
      cancellation_required: true,
    }),
    included: Object.freeze([
      'single_existing_lender_instruction',
      'individual_seller',
      'freehold_residential_resale',
      'ordinary_home_loan_account_reference',
      'manual_cancellation_figures_capture',
      'manual_guarantee_and_registration_evidence_upload',
      'manual_settlement_proof_capture',
    ]),
  }),
  heldForLater: Object.freeze([
    'company_trust_or_deceased_estate_seller_authority',
    'sectional_title_or_hoa_specific_cancellation_dependencies',
    'commercial_or_vat_transactions',
    'multiple_existing_bonds_or_substituted_security',
    'development_sale_cancellation_packs',
    'automated_existing_lender_or_deeds_office_integrations',
    'final discharge or cancellation instruments without approved firm and bank templates',
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

export const CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION = Object.freeze([
  automationItem({
    id: 'cancellation_instruction_acknowledgement',
    label: 'Cancellation instruction acknowledgement and matter opening note',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Confirm receipt of the existing-lender cancellation instruction and open the cancellation matter.',
  }),
  automationItem({
    id: 'seller_existing_bond_information_request',
    label: 'Seller existing-bond information request',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Ask the seller or transfer team for the bank, account number, bond statement and notice status needed to request figures.',
  }),
  automationItem({
    id: 'cancellation_figures_request_cover',
    label: 'Cancellation figures request cover',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Request lender-issued cancellation figures with the account reference, settlement date assumptions and contact details.',
  }),
  automationItem({
    id: 'notice_penalty_risk_summary',
    label: '90-day notice and penalty-risk summary',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Summarise notice status, penalty exposure and escalation notes without deciding the lender outcome.',
  }),
  automationItem({
    id: 'cancellation_guarantee_request_cover',
    label: 'Cancellation guarantee request cover and schedule',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Package the required guarantee amount, beneficiary wording, expiry and handoff instructions for transfer or bond teams.',
  }),
  automationItem({
    id: 'guarantee_acceptance_or_variance_note',
    label: 'Guarantee acceptance or variance note',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Record whether the received guarantee matches figures and wording, or what variance must be corrected.',
  }),
  automationItem({
    id: 'cancellation_lodgement_readiness_checklist',
    label: 'Cancellation lodgement readiness checklist',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Prove that figures, guarantee, cancellation documents and linked transfer/bond timing are ready for simultaneous lodgement.',
  }),
  automationItem({
    id: 'cancellation_registration_notification',
    label: 'Cancellation registration notification',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Notify linked professionals that cancellation registration evidence has been captured.',
  }),
  automationItem({
    id: 'settlement_closeout_report',
    label: 'Settlement and close-out report',
    strategy: 'generate_now',
    riskTier: 'operational',
    targetPhase: 4,
    purpose: 'Close the cancellation matter with registration evidence, settlement proof and unresolved exception notes.',
  }),
  automationItem({
    id: 'bank_cancellation_documents',
    label: 'Bank cancellation documents',
    strategy: 'template_controlled',
    riskTier: 'bank_controlled',
    targetPhase: 7,
    requiredApproval: 'bank_template_approval',
    purpose: 'Use lender-approved wording only; never fall back to generic bank cancellation forms.',
  }),
  automationItem({
    id: 'cancellation_consent',
    label: 'Seller cancellation consent',
    strategy: 'template_controlled',
    riskTier: 'legal_instrument',
    targetPhase: 7,
    requiredApproval: 'firm_and_bank_template_approval',
    purpose: 'Prepare consent only when exact firm and/or bank wording is approved for the matter.',
  }),
  automationItem({
    id: 'bond_discharge_or_cancellation_instrument',
    label: 'Bond discharge or cancellation instrument',
    strategy: 'template_controlled',
    riskTier: 'legal_instrument',
    targetPhase: 7,
    requiredApproval: 'firm_and_bank_template_approval',
    purpose: 'Draft legal discharge/cancellation instruments only against governed templates.',
  }),
  automationItem({
    id: 'seller_authority_resolution_for_cancellation',
    label: 'Seller authority resolution for cancellation',
    strategy: 'template_controlled',
    riskTier: 'legal_instrument',
    targetPhase: 7,
    requiredApproval: 'firm_template_approval',
    purpose: 'Support company, trust or represented sellers after the individual/freehold pilot proves stable.',
  }),
  automationItem({
    id: 'lender_cancellation_instruction',
    label: 'Existing-lender cancellation instruction',
    strategy: 'ingest_only',
    riskTier: 'bank_controlled',
    targetPhase: 3,
    purpose: 'Store and classify the lender instruction; do not originate it.',
  }),
  automationItem({
    id: 'bond_statement',
    label: 'Existing bond statement',
    strategy: 'ingest_only',
    riskTier: 'bank_controlled',
    targetPhase: 3,
    purpose: 'Use as source evidence for the account reference and existing lender details.',
  }),
  automationItem({
    id: 'cancellation_figures',
    label: 'Cancellation or settlement figures',
    strategy: 'ingest_only',
    riskTier: 'bank_controlled',
    targetPhase: 5,
    purpose: 'Attach lender-issued figures and extract verified amount, expiry, daily interest and payment references.',
  }),
  automationItem({
    id: 'guarantee_letter',
    label: 'Guarantee letter for cancellation',
    strategy: 'ingest_only',
    riskTier: 'transfer_or_bond_handoff',
    targetPhase: 6,
    purpose: 'Attach the guarantee evidence; do not synthesize or approve external guarantee wording automatically.',
  }),
  automationItem({
    id: 'cancellation_registration_evidence',
    label: 'Cancellation registration or discharge evidence',
    strategy: 'ingest_only',
    riskTier: 'external_registry',
    targetPhase: 8,
    purpose: 'Attach actual cancellation registration evidence; never infer registration from workflow stage text.',
  }),
  automationItem({
    id: 'proof_of_settlement',
    label: 'Settlement proof or payment confirmation',
    strategy: 'ingest_only',
    riskTier: 'bank_controlled',
    targetPhase: 9,
    purpose: 'Attach proof of payment or lender confirmation before close-out; do not execute external settlement.',
  }),
])

export const CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT = Object.freeze([
  'seller_existing_bond_status',
  'cancellation_bank',
  'cancellation_bond_account_number',
  'lender_instruction_reference',
  'cancellation_instruction_received_at',
  'notice_period_status',
  'notice_date',
  'cancellation_figures_amount',
  'cancellation_figures_expiry_date',
  'daily_interest_amount',
  'penalty_notice_risk',
  'guarantee_required_amount',
  'guarantee_beneficiary_and_wording',
  'guarantee_reference',
  'guarantee_acceptance_status',
  'seller_cancellation_signing_requirement',
  'signed_cancellation_document_status',
  'lodgement_reference',
  'lodgement_date',
  'cancellation_registration_reference',
  'cancellation_registration_date',
  'settlement_amount',
  'settlement_payment_reference',
  'closeout_status',
])

export const CANCELLATION_ATTORNEY_PHASE0_BASELINE_METRICS = Object.freeze([
  'time_from_lender_appointment_to_acceptance',
  'time_from_instruction_to_figures_request',
  'time_from_figures_request_to_figures_received',
  'figures_expiry_risk_count',
  'penalty_notice_risk_count',
  'guarantee_request_to_receipt_time',
  'guarantee_variance_count',
  'guarantee_acceptance_rework_count',
  'seller_cancellation_signing_rework_count',
  'days_waiting_for_transfer_or_bond_handoff',
  'lodgement_delay_due_to_cancellation_count',
  'cancellation_lodgement_rejection_count',
  'time_from_registration_to_settlement_proof',
  'time_from_settlement_to_closeout',
])

export const CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS = Object.freeze([
  Object.freeze({
    id: 'cancellation_lane_usability_not_simplified',
    severity: 'high',
    targetPhase: 1,
    exitEvidence: 'Cancellation stages, richer document requirements and next actions are visible in one role-focused cockpit.',
  }),
  Object.freeze({
    id: 'cancellation_data_contract_missing',
    severity: 'critical',
    targetPhase: 2,
    exitEvidence: 'Cancellation facts are canonical, source-bound, verified and fingerprinted before downstream readiness decisions.',
  }),
  Object.freeze({
    id: 'cancellation_pack_workspace_missing',
    severity: 'critical',
    targetPhase: 3,
    exitEvidence: 'Cancellation pack workspace shows source facts, requirements, document state, review state and evidence in one place.',
  }),
  Object.freeze({
    id: 'cancellation_operational_generator_missing',
    severity: 'high',
    targetPhase: 4,
    exitEvidence: 'Approved low-risk cancellation operational documents can be generated as drafts and linked back to the matter.',
  }),
  Object.freeze({
    id: 'cancellation_figures_register_missing',
    severity: 'critical',
    targetPhase: 5,
    exitEvidence: 'Cancellation figures have structured amount, expiry, daily-interest, penalty and validity checks.',
  }),
  Object.freeze({
    id: 'guarantee_coordination_workspace_missing',
    severity: 'high',
    targetPhase: 6,
    exitEvidence: 'Guarantees are reconciled against cancellation figures, wording, beneficiary details and cross-lane handoffs.',
  }),
  Object.freeze({
    id: 'cancellation_document_signing_workspace_missing',
    severity: 'high',
    targetPhase: 7,
    exitEvidence: 'Bank cancellation documents, seller consent, authority and signed evidence are tracked before lodgement.',
  }),
  Object.freeze({
    id: 'cancellation_lodgement_registration_evidence_not_packet_bound',
    severity: 'high',
    targetPhase: 8,
    exitEvidence: 'Lodgement and cancellation registration are evidence-backed, not stage-only.',
  }),
  Object.freeze({
    id: 'settlement_closeout_packet_missing',
    severity: 'high',
    targetPhase: 9,
    exitEvidence: 'Settlement proof is reconciled to figures and unresolved exceptions before close-out.',
  }),
  Object.freeze({
    id: 'cancellation_release_certification_missing',
    severity: 'medium',
    targetPhase: 10,
    exitEvidence: 'All blocker closures and safety boundaries are certified before the cancellation pilot is release-ready.',
  }),
])

const EXPECTED_CANCELLATION_STAGE_KEYS = Object.freeze([
  'cancellation_existing_bond_confirmed',
  'cancellation_bank_captured',
  'cancellation_bond_account_captured',
  'cancellation_instruction_received',
  'notice_period_captured',
  'cancellation_figures_requested',
  'cancellation_figures_received',
  'figures_expiry_captured',
  'notice_penalty_risk_captured',
  'cancellation_guarantees_requested',
  'cancellation_guarantees_received',
  'cancellation_guarantees_accepted',
  'cancellation_documents_prepared',
  'seller_cancellation_documents_signed',
  'cancellation_lodgement_ready',
  'cancellation_lodged',
  'cancellation_registered',
  'settlement_proof_captured',
  'cancellation_close_out_complete',
])

const EXPECTED_CANCELLATION_REQUIREMENT_IDS = Object.freeze([
  'cancellation_instruction',
  'existing_bond_account_details',
  'cancellation_figures',
  'cancellation_guarantees',
  'bank_cancellation_documents',
  'cancellation_consent',
  'proof_of_settlement',
])

const EXPECTED_CANCELLATION_STAGE_DOCUMENT_KEYS = Object.freeze([
  'seller_bond_cancellation_information',
  'cancellation_figures',
  'guarantee_letter',
  'seller_signed_cancellation_documents',
])

const strategyCounts = (items) => items.reduce((acc, item) => {
  acc[item.strategy] = (acc[item.strategy] || 0) + 1
  return acc
}, {})

const generatedCancellationCatalogKeys = () => listLegalDocumentDefinitions()
  .filter((definition) => {
    const haystack = [definition.key, definition.packetType, definition.label, definition.shortLabel]
      .map((value) => String(value || '').toLowerCase())
      .join(' ')
    return haystack.includes('cancellation') || haystack.includes('settlement') || haystack.includes('discharge')
  })
  .map((definition) => definition.key)

export function buildCancellationAttorneyPhase0BaselineReport() {
  const stageKeys = (ATTORNEY_WORKFLOW_STAGE_DEFINITIONS.cancellation || []).map((stage) => stage.key)
  const missingStageKeys = EXPECTED_CANCELLATION_STAGE_KEYS.filter((stageKey) => !stageKeys.includes(stageKey))
  const requirementsReport = resolveLegalDocumentRequirements(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.transaction)
  const cancellationRequirementIds = requirementsReport.requirements
    .filter((requirement) => requirement.laneKey === 'cancellation')
    .map((requirement) => requirement.id)
  const missingRequirementIds = EXPECTED_CANCELLATION_REQUIREMENT_IDS.filter((id) => !cancellationRequirementIds.includes(id))
  const stageDocumentKeys = getAttorneyDocumentRequirementKeysForLane('cancellation')
  const missingStageDocumentKeys = EXPECTED_CANCELLATION_STAGE_DOCUMENT_KEYS.filter((id) => !stageDocumentKeys.includes(id))
  const richRequirementIdsNotOnStages = cancellationRequirementIds.filter((id) => !stageDocumentKeys.includes(id))
  const cancellationCatalogKeys = generatedCancellationCatalogKeys()
  const automationCounts = strategyCounts(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION)

  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE0_VERSION,
    laneKey: CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.laneKey,
    stageCount: stageKeys.length,
    missingStageKeys,
    cancellationRequirementIds,
    missingRequirementIds,
    stageDocumentKeys,
    missingStageDocumentKeys,
    richRequirementIdsNotOnStages,
    signingRequirementIds: requirementsReport.signingRequirements
      .filter((requirement) => requirement.laneKey === 'cancellation')
      .map((requirement) => requirement.id),
    generatedCancellationCatalogKeys: cancellationCatalogKeys,
    generatorCoverageStatus: cancellationCatalogKeys.length ? 'started' : 'not_started',
    automationCounts,
    dataContractFieldCount: CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.length,
    baselineMetricCount: CANCELLATION_ATTORNEY_PHASE0_BASELINE_METRICS.length,
    releaseBlockerCount: CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.length,
    readyForPhase1: missingStageKeys.length === 0 && missingRequirementIds.length === 0 && missingStageDocumentKeys.length === 0,
  })
}

export function listCancellationAttorneyPhase0ExitGateFailures() {
  const report = buildCancellationAttorneyPhase0BaselineReport()
  const failures = []
  if (report.missingStageKeys.length) failures.push({ id: 'missing_cancellation_stages', detail: report.missingStageKeys })
  if (report.missingRequirementIds.length) failures.push({ id: 'missing_cancellation_document_requirements', detail: report.missingRequirementIds })
  if (report.missingStageDocumentKeys.length) failures.push({ id: 'missing_cancellation_stage_document_keys', detail: report.missingStageDocumentKeys })
  if (!report.automationCounts.generate_now) failures.push({ id: 'missing_generate_now_document_candidates' })
  if (!report.automationCounts.template_controlled) failures.push({ id: 'missing_template_controlled_document_candidates' })
  if (!report.automationCounts.ingest_only) failures.push({ id: 'missing_ingest_only_document_candidates' })
  if (report.dataContractFieldCount < 12) failures.push({ id: 'data_contract_too_thin', detail: report.dataContractFieldCount })
  if (report.baselineMetricCount < 10) failures.push({ id: 'baseline_metrics_too_thin', detail: report.baselineMetricCount })
  return failures
}
