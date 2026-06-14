import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  deriveOnboardingConfiguration,
  normalizePurchaserType,
} from '../../lib/purchaserPersonas'
import { resolveBuyerOnboardingFlow } from '../../lib/buyerOnboardingFlow.js'
import {
  getMainStageFromDetailedStage,
  getMainStageIndex,
} from '../../lib/stages'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { resolveSalesWorkflowSnapshot } from '../../core/transactions/salesWorkflow'
import { resolveFinanceWorkflowSnapshot } from '../../core/transactions/financeWorkflow'
import {
  legacyRequirementKeyToCanonicalKey,
  syncCanonicalToTransactionRequiredDocuments,
} from './canonicalDocumentAdapterService'
import {
  DOCUMENT_ROLLOUT_MODES,
  getCanonicalDocumentRolloutMode,
  isLegacyDocumentAdapterWritebackEnabled,
} from './canonicalDocumentConsolidationService'
import {
  REQUIREMENT_LEVELS,
  REQUIREMENT_STATUSES,
  buildInstanceSignature,
  buildRequirementInstance,
  loadActiveRequirementRules,
  loadDocumentDefinitionsForRules,
  normalizeRule,
  resolveRequirementCandidates,
  syncRequirementInstances,
} from './canonicalDocumentResolverService'
import { resolveTransactionFacts } from '../attorneyWorkflow/transactionFactsResolver'
import { resolveLegalDocumentRequirements } from '../attorneyWorkflow/attorneyDocumentRequirementsResolver'

export const TRANSACTION_CANONICAL_DOCUMENT_ENGINE_SOURCE = 'transaction_canonical_document_requirement_engine'
export const TRANSACTION_CANONICAL_DOCUMENT_ENGINE_VERSION = 'transaction_canonical_document_requirement_engine_v1'
export const TRANSACTION_DOCUMENT_REQUIREMENT_TABLE = 'transaction_document_requirements'

const TRANSACTION_DOCUMENT_SECTION_LABELS = Object.freeze({
  buyer_documents: 'Buyer Documents',
  seller_documents: 'Seller Documents',
  finance_documents: 'Finance Documents',
  transfer_documents: 'Transfer Documents',
  bond_registration_documents: 'Bond Registration Documents',
  bond_cancellation_documents: 'Bond Cancellation Documents',
  registration_documents: 'Registration Documents',
})

const SECTION_TO_GROUP_KEY = Object.freeze({
  buyer_documents: 'buyer_fica',
  seller_documents: 'seller_documents',
  finance_documents: 'finance',
  transfer_documents: 'transfer',
  bond_registration_documents: 'bond_registration',
  bond_cancellation_documents: 'cancellation_documents',
  registration_documents: 'registration',
})

const PACK_WORKFLOW_META = Object.freeze({
  seller_identity_fica: {
    owningWorkflow: 'OTP / Seller Onboarding',
    workflowStage: 'OTP',
    visibleSection: 'seller_documents',
    blockingStage: 'OTP',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  seller_authority: {
    owningWorkflow: 'OTP / Seller Onboarding',
    workflowStage: 'OTP',
    visibleSection: 'seller_documents',
    blockingStage: 'OTP',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  property_ownership: {
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  property_finance_existing_bond: {
    owningWorkflow: 'Bond Cancellation',
    workflowStage: 'Transfer',
    visibleSection: 'bond_cancellation_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  property_compliance: {
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  sectional_title_body_corporate: {
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  estate_hoa: {
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  tenant_occupancy: {
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'seller',
    responsibleRole: 'seller',
  },
  buyer_identity_fica: {
    owningWorkflow: 'OTP / Buyer Onboarding',
    workflowStage: 'OTP',
    visibleSection: 'buyer_documents',
    blockingStage: 'OTP',
    requestedFrom: 'buyer',
    responsibleRole: 'buyer',
  },
  buyer_finance: {
    owningWorkflow: 'Finance',
    workflowStage: 'Finance',
    visibleSection: 'finance_documents',
    blockingStage: 'FIN',
    requestedFrom: 'buyer',
    responsibleRole: 'buyer',
  },
  bond_originator: {
    owningWorkflow: 'Bond Registration',
    workflowStage: 'Finance',
    visibleSection: 'bond_registration_documents',
    blockingStage: 'FIN',
    requestedFrom: 'bond_originator',
    responsibleRole: 'bond_originator',
  },
  attorney_transfer_readiness: {
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'transferring_attorney',
    responsibleRole: 'transferring_attorney',
  },
  attorney_generated_documents: {
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    visibleSection: 'transfer_documents',
    blockingStage: 'ATTY',
    requestedFrom: 'transferring_attorney',
    responsibleRole: 'transferring_attorney',
  },
})

const GROUP_KEY_TO_PACK_KEY = Object.freeze({
  buyer_fica: 'buyer_identity_fica',
  sale: 'buyer_identity_fica',
  finance: 'buyer_finance',
  seller_documents: 'seller_identity_fica',
  seller_identity: 'seller_identity_fica',
  seller_authority: 'seller_authority',
  seller_fica: 'seller_identity_fica',
  transfer: 'attorney_transfer_readiness',
  cancellation_documents: 'property_finance_existing_bond',
  bond_registration: 'bond_originator',
  registration: 'attorney_transfer_readiness',
})

const CATEGORY_TO_PACK_KEY = Object.freeze({
  buyer_entity: 'buyer_identity_fica',
  seller_entity: 'seller_identity_fica',
  property_compliance: 'property_compliance',
  bond: 'bond_originator',
  bond_documents: 'bond_originator',
  cancellation: 'property_finance_existing_bond',
  cancellation_documents: 'property_finance_existing_bond',
  transfer: 'attorney_transfer_readiness',
  transfer_documents: 'attorney_transfer_readiness',
  transaction_type: 'attorney_transfer_readiness',
})

const GATE_TO_MAIN_STAGE = Object.freeze({
  listing_ready: 'DEP',
  mandate_ready: 'DEP',
  otp_ready: 'OTP',
  finance_ready: 'FIN',
  attorney_instruction_ready: 'ATTY',
  lodgement_ready: 'XFER',
  registration_ready: 'REG',
  handover_ready: 'REG',
})

const PRE_COLLECTION_ALLOWED_KEYS = new Set([
  'bond_preapproval',
  'bond_application_form',
  'affordability_assessment',
  'bank_submission_confirmation',
  'bank_feedback',
  'bank_statements',
  'payslips',
  'proof_of_income',
])

const BUYER_ADAPTER_CANONICAL_KEY_OVERRIDES = Object.freeze({
  id_document: 'buyer_id_document',
  purchaser_id: 'buyer_id_document',
  purchaser_1_id: 'buyer_id_document',
  passport_copy: 'buyer_id_document',
  proof_of_address: 'buyer_proof_of_address',
  purchaser_proof_of_address: 'buyer_proof_of_address',
  purchaser_1_proof_of_address: 'buyer_proof_of_address',
  cipc_registration: 'buyer_company_registration_documents',
  company_resolution: 'buyer_company_resolution',
  director_id: 'buyer_director_ids',
  director_proof_of_address: 'buyer_business_address',
  trust_deed: 'buyer_trust_deed',
  letters_of_authority: 'buyer_letters_of_authority',
  trust_resolution: 'buyer_trustee_resolution',
  trustee_id: 'buyer_trustee_ids',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function buyerAdapterCanonicalKey(key = '') {
  const normalized = normalizeKey(key)
  return BUYER_ADAPTER_CANONICAL_KEY_OVERRIDES[normalized] || legacyRequirementKeyToCanonicalKey(normalized)
}

function attorneyFallbackPackKey(requirement = {}, definition = {}) {
  if (definition.pack_key) return definition.pack_key
  const category = normalizeKey(requirement.category)
  const appliesTo = normalizeKey(requirement.appliesTo)
  if (category === 'fica' || category === 'entity_documents') {
    return appliesTo === 'seller' ? 'seller_identity_fica' : 'buyer_identity_fica'
  }
  return CATEGORY_TO_PACK_KEY[category] || 'attorney_transfer_readiness'
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

function normalizeMainStage(mainStage, detailedStage = 'Available') {
  const normalized = normalizeText(mainStage).toUpperCase()
  if (normalized) return normalized
  return getMainStageFromDetailedStage(detailedStage)
}

function hybridFinanceType(value) {
  const normalized = normalizeFinanceType(value || 'cash', { allowUnknown: true })
  if (normalized === 'combination') return 'hybrid'
  return normalized
}

function inferPropertyFacts(transaction = {}, transactionFacts = {}) {
  const propertyType = normalizeKey(
    transaction.property_type ||
    transaction.propertyType ||
    transaction.unit?.property_type ||
    transaction.unit?.propertyType,
  )
  const propertyTenure = normalizeKey(transactionFacts.propertyTenure || transaction.property_tenure || transaction.propertyTenure)
  return {
    type: propertyType || 'unknown',
    tenure: propertyTenure || 'unknown',
    sectional_title: transactionFacts.isSectionalTitle || propertyTenure === 'sectional_title' || propertyType.includes('sectional') || propertyType.includes('body_corporate'),
    hoa: transactionFacts.isEstateHoa || propertyTenure === 'estate_hoa' || propertyType.includes('estate') || propertyType.includes('hoa'),
    freehold: transactionFacts.isFreehold || propertyTenure === 'freehold' || propertyType.includes('freehold'),
  }
}

async function loadTransactionSubprocesses(client, transactionId) {
  const subprocessQuery = await client
    .from('transaction_subprocesses')
    .select('id, process_type, status')
    .eq('transaction_id', transactionId)

  if (subprocessQuery.error) return []
  const subprocesses = subprocessQuery.data || []
  if (!subprocesses.length) return []

  const subprocessIds = subprocesses.map((item) => item.id).filter(Boolean)
  const stepsQuery = await client
    .from('transaction_subprocess_steps')
    .select('id, subprocess_id, step_key, status, completed_at, comment')
    .in('subprocess_id', subprocessIds)

  const steps = stepsQuery.error ? [] : stepsQuery.data || []
  const stepsBySubprocessId = steps.reduce((accumulator, step) => {
    if (!accumulator[step.subprocess_id]) accumulator[step.subprocess_id] = []
    accumulator[step.subprocess_id].push(step)
    return accumulator
  }, {})

  return subprocesses.map((item) => ({
    ...item,
    steps: stepsBySubprocessId[item.id] || [],
  }))
}

async function loadTransactionDocuments(client, transactionId) {
  const query = await client
    .from('documents')
    .select('id, transaction_id, name, category, document_type, file_path, canonical_requirement_instance_id, created_at, updated_at')
    .eq('transaction_id', transactionId)

  return query.error ? [] : query.data || []
}

async function loadOnboardingFormData(client, transactionId) {
  const query = await client
    .from('onboarding_form_data')
    .select('transaction_id, purchaser_type, form_data')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (query.error) return null
  return query.data || null
}

async function loadTransactionRow(client, transactionId) {
  const query = await client
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle()

  if (query.error) throw query.error
  return query.data || null
}

function requireClient(client = supabase) {
  if (!client || !isSupabaseConfigured) throw new Error('Supabase is required for transaction canonical document resolution.')
  return client
}

export function buildTransactionDocumentFacts({
  transaction = {},
  formData = {},
  documents = [],
  subprocesses = [],
} = {}) {
  const detailedStage = normalizeText(transaction?.stage || 'Available') || 'Available'
  const currentMainStage = normalizeMainStage(transaction?.current_main_stage, detailedStage)
  const currentMainStageIndex = getMainStageIndex(currentMainStage)
  const purchaserType = normalizePurchaserType(
    formData?.purchaser_type || transaction?.purchaser_type || transaction?.buyer_entity_type || transaction?.buyerEntityType || 'individual',
  )
  const financeType = hybridFinanceType(
    formData?.purchase_finance_type ||
    transaction?.finance_type ||
    transaction?.funding_type ||
    'cash',
  )
  const buyerOnboardingFlow = resolveBuyerOnboardingFlow(formData, transaction, {
    purchaserType,
    financeType,
  })
  const transactionFacts = resolveTransactionFacts({
    ...transaction,
    onboardingFormData: formData,
    buyer_onboarding_flow: buyerOnboardingFlow,
  })
  const salesSnapshot = resolveSalesWorkflowSnapshot({
    onboardingStatus: transaction?.onboarding_status || '',
    onboardingCompletedAt: transaction?.onboarding_completed_at || null,
    externalOnboardingSubmittedAt: transaction?.external_onboarding_submitted_at || null,
    documents,
    requiredDocuments: [],
  })
  const financeSnapshot = resolveFinanceWorkflowSnapshot({
    financeType,
    subprocesses,
    salesReadyForFinance: salesSnapshot.readyForFinance || currentMainStageIndex >= getMainStageIndex('FIN'),
    salesBlockers: salesSnapshot.blockers || [],
  })
  const property = inferPropertyFacts(transaction, transactionFacts)

  return {
    buyer: {
      legal_type: transactionFacts.buyerEntityType,
      type: transactionFacts.buyerEntityType,
      branch: transactionFacts.buyerBranch || buyerOnboardingFlow.buyer_branch || purchaserType,
      purchase_mode: transactionFacts.buyerPurchaseMode || buyerOnboardingFlow.buyer_purchase_mode || null,
      finance_support_mode:
        transactionFacts.buyerFinanceSupportMode || buyerOnboardingFlow.buyer_finance_support_mode || null,
      onboarding_flow_version:
        transactionFacts.buyerOnboardingFlowVersion || buyerOnboardingFlow.version || null,
      onboarding_flow: transactionFacts.buyerOnboardingFlow || buyerOnboardingFlow || null,
      nationality:
        purchaserType === 'foreign_purchaser' || normalizeKey(formData?.buyer_type) === 'foreign_purchaser'
          ? 'foreign'
          : 'local',
      purchaser_type: purchaserType,
    },
    seller: {
      legal_type: transactionFacts.sellerEntityType,
      type: transactionFacts.sellerEntityType,
      existing_bond: Boolean(transactionFacts.sellerHasExistingBond),
    },
    property,
    purchase: {
      finance_type: financeType,
      vat_treatment: transactionFacts.vatTreatment,
    },
    finance: {
      type: financeType,
      has_bond_component: ['bond', 'hybrid'].includes(financeType),
      has_cash_component: ['cash', 'hybrid'].includes(financeType),
    },
    workflow: {
      current_main_stage: currentMainStage,
      current_main_stage_index: currentMainStageIndex,
      readyForFinance: salesSnapshot.readyForFinance || currentMainStageIndex >= getMainStageIndex('FIN'),
      readyForTransfer: financeSnapshot.readyForTransfer || currentMainStageIndex >= getMainStageIndex('ATTY'),
    },
    transaction: {
      id: transaction?.id || null,
      stage: detailedStage,
      current_main_stage: currentMainStage,
      transaction_type: transactionFacts.transactionType,
      seller_has_existing_bond: Boolean(transactionFacts.sellerHasExistingBond),
      workflow_template_key: transactionFacts.workflowTemplateKey || '',
    },
    context: {
      type: 'transaction',
      id: transaction?.id || null,
      transaction_id: transaction?.id || null,
      facts_version: TRANSACTION_CANONICAL_DOCUMENT_ENGINE_VERSION,
    },
  }
}

function stageGateActivationIndex(stageGates = []) {
  const indexes = normalizeArray(stageGates)
    .map((gate) => GATE_TO_MAIN_STAGE[normalizeKey(gate)] || null)
    .filter(Boolean)
    .map((stage) => getMainStageIndex(stage))
  if (!indexes.length) return 0
  return Math.min(...indexes)
}

export function shouldDisplayRequirementAtStage({
  stageGates = [],
  preCollectionAllowed = false,
  facts = {},
} = {}) {
  const currentStageIndex = Number(facts?.workflow?.current_main_stage_index || 0)
  const activationIndex = stageGateActivationIndex(stageGates)
  const visible = currentStageIndex >= activationIndex || preCollectionAllowed
  const blocking = currentStageIndex >= activationIndex
  return {
    visible,
    blocking,
    activationIndex,
  }
}

function requirementLevelFromFlags({ required = true, blocking = false } = {}) {
  if (!required) return REQUIREMENT_LEVELS.optional
  return blocking ? REQUIREMENT_LEVELS.blocker : REQUIREMENT_LEVELS.required
}

function workflowMetaFromPack(packKey = '', definitionKey = '') {
  const normalizedPackKey = normalizeKey(packKey)
  const normalizedDefinitionKey = normalizeKey(definitionKey)
  const packMeta = PACK_WORKFLOW_META[normalizedPackKey] || PACK_WORKFLOW_META.attorney_transfer_readiness

  if (normalizedDefinitionKey === 'registration_confirmation') {
    return {
      owningWorkflow: 'Registration',
      workflowStage: 'Registration',
      visibleSection: 'registration_documents',
      blockingStage: 'REG',
      requestedFrom: 'transferring_attorney',
      responsibleRole: 'transferring_attorney',
    }
  }

  if (['bond_approval', 'grant_letter'].includes(normalizedDefinitionKey)) {
    return {
      ...packMeta,
      owningWorkflow: 'Finance',
      workflowStage: 'Finance',
      visibleSection: 'finance_documents',
      blockingStage: 'FIN',
      requestedFrom: 'bond_originator',
      responsibleRole: 'bond_originator',
    }
  }

  return packMeta
}

function buildProjectionRow({
  generated = {},
  instance = null,
  definition = {},
  rule = null,
  trace = [],
  facts = {},
  source = 'canonical_rule',
  explicitMeta = {},
} = {}) {
  const definitionKey = generated.document_definition_key || definition.key
  const packKey = generated.pack_key || definition.pack_key
  const baseMeta = workflowMetaFromPack(packKey, definitionKey)
  const ruleRequestedFrom = normalizeText(rule?.requested_from_role || rule?.requested_from)
  const ruleResponsibleRole = normalizeText(rule?.responsible_role)
  const preCollectionAllowed = rule?.pre_collection_allowed === true || PRE_COLLECTION_ALLOWED_KEYS.has(normalizeKey(definitionKey))
  const displayGate = shouldDisplayRequirementAtStage({
    stageGates: generated.stage_gates || rule?.stage_gates,
    preCollectionAllowed,
    facts,
  })

  if (!displayGate.visible) return null

  const requirementLevel = normalizeText(generated.requirement_level || definition.default_requirement_level || REQUIREMENT_LEVELS.required)
  const required = ![REQUIREMENT_LEVELS.optional, REQUIREMENT_LEVELS.notApplicable].includes(requirementLevel)
  const blocking = requirementLevel === REQUIREMENT_LEVELS.blocker
    ? displayGate.blocking
    : explicitMeta.blocking === true
      ? displayGate.blocking
      : false

  const requestedFrom = explicitMeta.requestedFrom || ruleRequestedFrom || generated.requested_from_role || baseMeta.requestedFrom
  const responsibleRole = explicitMeta.responsibleRole || ruleResponsibleRole || requestedFrom || baseMeta.responsibleRole
  const visibleSection = explicitMeta.visibleSection || normalizeKey(rule?.visible_section) || baseMeta.visibleSection
  const groupKey = SECTION_TO_GROUP_KEY[visibleSection] || normalizeKey(packKey) || 'transfer'
  const status = instance?.status || REQUIREMENT_STATUSES.pending

  return {
    transaction_id: generated.transaction_id || facts?.transaction?.id || null,
    rule_id: normalizeText(rule?.id) || explicitMeta.ruleId || `adapter:${source}:${definitionKey}`,
    rule_version: Number(rule?.rule_version || explicitMeta.ruleVersion || 1),
    document_key: definitionKey,
    document_name: definition.display_label || explicitMeta.documentName || definitionKey,
    document_category: definition.category || explicitMeta.documentCategory || packKey || null,
    owning_workflow: explicitMeta.owningWorkflow || normalizeText(rule?.owning_workflow) || baseMeta.owningWorkflow,
    workflow_stage: explicitMeta.workflowStage || normalizeText(rule?.workflow_stage) || baseMeta.workflowStage,
    requested_from: requestedFrom || null,
    responsible_role: responsibleRole || null,
    visible_section: visibleSection,
    required,
    blocking,
    blocking_stage: explicitMeta.blockingStage || normalizeText(rule?.blocking_stage) || baseMeta.blockingStage,
    status,
    source,
    trigger_snapshot: {
      stage_gates: normalizeArray(generated.stage_gates || rule?.stage_gates),
      pre_collection_allowed: preCollectionAllowed,
      trace,
      facts: {
        finance_type: facts?.purchase?.finance_type || null,
        buyer_type: facts?.buyer?.legal_type || null,
        seller_type: facts?.seller?.legal_type || null,
        seller_has_existing_bond: Boolean(facts?.seller?.existing_bond),
        property_type: facts?.property?.type || null,
        current_main_stage: facts?.transaction?.current_main_stage || null,
        ready_for_finance: Boolean(facts?.workflow?.readyForFinance),
        ready_for_transfer: Boolean(facts?.workflow?.readyForTransfer),
      },
    },
    stage_at_generation: facts?.transaction?.current_main_stage || null,
    pre_collection_allowed: preCollectionAllowed,
    canonical_requirement_instance_id: instance?.id || null,
    uploaded_document_id: instance?.satisfied_by_document_id || null,
    created_at: null,
    updated_at: null,
    last_resolved_at: new Date().toISOString(),
    superseded_at: null,
    superseded_reason: null,
    debug_group_key: groupKey,
  }
}

function buildBuyerAdapterCandidates({
  transaction = {},
  facts = {},
  formData = {},
  definitionsByKey = new Map(),
} = {}) {
  const purchaserType = normalizePurchaserType(
    formData?.purchaser_type || transaction?.purchaser_type || facts?.buyer?.purchaser_type || 'individual',
  )
  const financeType = facts?.purchase?.finance_type || 'cash'
  const derived = deriveOnboardingConfiguration(
    {
      ...(formData || {}),
      purchaser_type: purchaserType,
      purchase_finance_type: financeType,
    },
    {
      transaction,
      purchaserType,
      financeType,
    },
  )

  return normalizeArray(derived.requiredDocuments).map((template) => {
    const definitionKey = buyerAdapterCanonicalKey(template.key)
    const definition = definitionsByKey.get(definitionKey)
    if (!definition) return null
    const packKey = definition.pack_key || GROUP_KEY_TO_PACK_KEY[normalizeKey(template.groupKey)] || 'buyer_identity_fica'
    const preCollectionAllowed = PRE_COLLECTION_ALLOWED_KEYS.has(normalizeKey(definitionKey))
    const generated = buildRequirementInstance({
      document_definition_key: definitionKey,
      pack_key: packKey,
      requirement_level: template.requirementLevel || requirementLevelFromFlags({
        required: template.required !== false,
        blocking: normalizeKey(template.groupKey) === 'finance' && !preCollectionAllowed,
      }),
      stage_gates: normalizeKey(template.groupKey) === 'finance' ? ['finance_ready'] : ['otp_ready'],
      requested_from_role: template.expectedFromRole || 'buyer',
      reviewer_role: 'agent',
      visible_to_roles: definition.default_visibility,
      uploadable_by_roles: definition.default_upload_roles,
    }, {
      contextType: 'transaction',
      contextId: transaction.id,
      transactionId: transaction.id,
      options: {
        sourceSystem: TRANSACTION_CANONICAL_DOCUMENT_ENGINE_SOURCE,
        resolverVersion: TRANSACTION_CANONICAL_DOCUMENT_ENGINE_VERSION,
      },
    })

    return {
      generated,
      definition,
      trace: [{ adapter: 'buyer_requirement_engine', template_key: template.key }],
      source: 'buyer_requirement_engine_adapter',
      explicitMeta: {
        ruleId: `adapter:buyer_requirement_engine:${template.key}`,
        visibleSection: normalizeKey(template.groupKey) === 'finance' ? 'finance_documents' : 'buyer_documents',
        owningWorkflow: normalizeKey(template.groupKey) === 'finance' ? 'Finance' : 'OTP / Buyer Onboarding',
        workflowStage: normalizeKey(template.groupKey) === 'finance' ? 'Finance' : 'OTP',
        blockingStage: normalizeKey(template.groupKey) === 'finance' ? 'FIN' : 'OTP',
        requestedFrom: template.expectedFromRole || 'buyer',
        responsibleRole: template.expectedFromRole || 'buyer',
      },
    }
  }).filter(Boolean)
}

function buildAttorneyAdapterCandidates({
  transaction = {},
  facts = {},
  definitionsByKey = new Map(),
} = {}) {
  const resolved = resolveLegalDocumentRequirements(transaction || {})
  return normalizeArray(resolved.requirements).map((requirement) => {
    const definitionKey = legacyRequirementKeyToCanonicalKey(requirement.id)
    const definition = definitionsByKey.get(definitionKey)
    if (!definition) return null

    const packKey = attorneyFallbackPackKey(requirement, definition)
    const laneKey = normalizeKey(requirement.laneKey)
    const stageGates =
      laneKey === 'bond'
        ? ['finance_ready']
        : laneKey === 'cancellation' || laneKey === 'transfer'
          ? ['attorney_instruction_ready']
          : ['otp_ready']

    const generated = buildRequirementInstance({
      document_definition_key: definitionKey,
      pack_key: packKey,
      requirement_level: requirement.required === false
        ? REQUIREMENT_LEVELS.optional
        : laneKey === 'bond' || laneKey === 'cancellation' || laneKey === 'transfer'
          ? REQUIREMENT_LEVELS.blocker
          : REQUIREMENT_LEVELS.required,
      stage_gates: stageGates,
      requested_from_role: requirement.requiredFrom || baseRequestedFromRole(packKey),
      reviewer_role: laneKey === 'bond' ? 'bond_originator' : 'transferring_attorney',
      visible_to_roles: definition.default_visibility,
      uploadable_by_roles: definition.default_upload_roles,
    }, {
      contextType: 'transaction',
      contextId: transaction.id,
      transactionId: transaction.id,
      options: {
        sourceSystem: TRANSACTION_CANONICAL_DOCUMENT_ENGINE_SOURCE,
        resolverVersion: TRANSACTION_CANONICAL_DOCUMENT_ENGINE_VERSION,
      },
    })

    return {
      generated,
      definition,
      trace: [{ adapter: 'attorney_document_requirements_resolver', requirement_id: requirement.id }],
      source: 'attorney_document_requirements_adapter',
      explicitMeta: attorneyRequirementMeta(requirement, definition, facts),
    }
  }).filter(Boolean)
}

function baseRequestedFromRole(packKey = '') {
  return workflowMetaFromPack(packKey).requestedFrom || 'buyer'
}

function attorneyRequirementMeta(requirement = {}, definition = {}, facts = {}) {
  const laneKey = normalizeKey(requirement.laneKey)
  if (laneKey === 'bond') {
    return {
      ruleId: `adapter:attorney_document_requirements:${requirement.id}`,
      visibleSection: 'bond_registration_documents',
      owningWorkflow: 'Bond Registration',
      workflowStage: 'Finance',
      blockingStage: 'FIN',
      requestedFrom: requirement.requiredFrom || 'bond_originator',
      responsibleRole: requirement.requiredFrom || 'bond_originator',
    }
  }
  if (laneKey === 'cancellation' || normalizeKey(definition.pack_key) === 'property_finance_existing_bond') {
    return {
      ruleId: `adapter:attorney_document_requirements:${requirement.id}`,
      visibleSection: 'bond_cancellation_documents',
      owningWorkflow: 'Bond Cancellation',
      workflowStage: 'Transfer',
      blockingStage: 'ATTY',
      requestedFrom: requirement.requiredFrom || 'seller',
      responsibleRole: requirement.requiredFrom || 'seller',
    }
  }
  if (normalizeKey(requirement.id) === 'registration_confirmation') {
    return {
      ruleId: `adapter:attorney_document_requirements:${requirement.id}`,
      visibleSection: 'registration_documents',
      owningWorkflow: 'Registration',
      workflowStage: 'Registration',
      blockingStage: 'REG',
      requestedFrom: requirement.requiredFrom || 'transferring_attorney',
      responsibleRole: requirement.requiredFrom || 'transferring_attorney',
    }
  }
  if (facts?.seller?.existing_bond && normalizeKey(definition.pack_key) === 'property_finance_existing_bond') {
    return {
      ruleId: `adapter:attorney_document_requirements:${requirement.id}`,
      visibleSection: 'bond_cancellation_documents',
      owningWorkflow: 'Bond Cancellation',
      workflowStage: 'Transfer',
      blockingStage: 'ATTY',
      requestedFrom: requirement.requiredFrom || 'seller',
      responsibleRole: requirement.requiredFrom || 'seller',
    }
  }
  return {
    ruleId: `adapter:attorney_document_requirements:${requirement.id}`,
    visibleSection: 'transfer_documents',
    owningWorkflow: 'Transfer of Property',
    workflowStage: 'Transfer',
    blockingStage: 'ATTY',
    requestedFrom: requirement.requiredFrom || 'transferring_attorney',
    responsibleRole: requirement.requiredFrom || 'transferring_attorney',
  }
}

function dedupeCandidateRows(candidates = []) {
  const bySignature = new Map()
  for (const candidate of candidates) {
    const signature = buildInstanceSignature(candidate.generated)
    if (!bySignature.has(signature) || candidate.source === 'canonical_rule') {
      bySignature.set(signature, candidate)
    }
  }
  return [...bySignature.values()]
}

function mapProjectionRowToRequirement(row = {}) {
  const required = row.required !== false
  const status = normalizeKey(row.status || REQUIREMENT_STATUSES.pending)
  const visibilityScope = row.visible_section === 'seller_documents' || row.visible_section === 'buyer_documents'
    ? 'client'
    : 'shared'

  return {
    id: row.id,
    transactionId: row.transaction_id,
    key: row.document_key,
    label: row.document_name,
    groupKey: SECTION_TO_GROUP_KEY[row.visible_section] || row.debug_group_key || 'transfer',
    groupLabel: TRANSACTION_DOCUMENT_SECTION_LABELS[row.visible_section] || row.visible_section,
    group: TRANSACTION_DOCUMENT_SECTION_LABELS[row.visible_section] || row.visible_section,
    description: row.document_category || '',
    requirementLevel: required ? (row.blocking ? 'required' : 'required') : 'optional',
    isRequired: required,
    isUploaded: [REQUIREMENT_STATUSES.uploaded, REQUIREMENT_STATUSES.underReview, REQUIREMENT_STATUSES.approved, REQUIREMENT_STATUSES.completed].includes(status),
    status,
    isEnabled: !row.superseded_at,
    expectedFromRole: row.requested_from || row.responsible_role || 'buyer',
    visibilityScope,
    allowMultiple: false,
    uploadedDocumentId: row.uploaded_document_id || null,
    uploadedAt: null,
    verifiedAt: [REQUIREMENT_STATUSES.approved, REQUIREMENT_STATUSES.completed].includes(status) ? row.updated_at || row.last_resolved_at || null : null,
    rejectedAt: status === REQUIREMENT_STATUSES.rejected ? row.updated_at || row.last_resolved_at || null : null,
    notes: '',
    rejectionReason: '',
    rejection_reason: '',
    sortOrder: Number(row.sort_order || 999),
    canonicalRequirementInstanceId: row.canonical_requirement_instance_id || null,
    canonical_requirement_instance_id: row.canonical_requirement_instance_id || null,
    owningWorkflow: row.owning_workflow,
    visibleSection: row.visible_section,
    blockingStage: row.blocking_stage,
    preCollectionAllowed: row.pre_collection_allowed === true,
    isBlocking: row.blocking === true,
    sourceEngine: row.source,
    sourceRuleOrLegacyPath: row.rule_id || null,
    triggeringCondition: row.trigger_snapshot?.trace?.length ? 'canonical rule evaluation' : row.source,
    currentMainStageAtGeneration: row.stage_at_generation || null,
    lastRecalculatedAt: row.last_resolved_at || null,
    requestedFromLabel: row.requested_from || row.responsible_role || 'buyer',
    debugTrace: {
      documentName: row.document_name,
      owningWorkflow: row.owning_workflow,
      requestedFrom: row.requested_from,
      visibleSection: row.visible_section,
      sourceEngine: row.source,
      sourceRuleOrLegacyPath: row.rule_id || null,
      currentMainStageAtGeneration: row.stage_at_generation || null,
      blockingStage: row.blocking_stage,
      preCollectionAllowed: row.pre_collection_allowed === true,
      createdAt: row.created_at || null,
      lastRecalculatedAt: row.last_resolved_at || null,
    },
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function sortProjectionRows(rows = []) {
  return [...rows].sort((left, right) => {
    const sectionCompare = normalizeText(left.visible_section).localeCompare(normalizeText(right.visible_section))
    if (sectionCompare !== 0) return sectionCompare
    return normalizeText(left.document_name).localeCompare(normalizeText(right.document_name))
  })
}

async function syncProjectionRows({
  client,
  transactionId,
  projectionRows = [],
} = {}) {
  const db = requireClient(client)
  const nowIso = new Date().toISOString()
  const currentQuery = await db
    .from(TRANSACTION_DOCUMENT_REQUIREMENT_TABLE)
    .select('*')
    .eq('transaction_id', transactionId)
    .is('superseded_at', null)

  if (currentQuery.error) throw currentQuery.error

  const existingRows = currentQuery.data || []
  const existingBySignature = new Map(existingRows.map((row) => [
    `${row.document_key}::${row.requested_from || ''}::${row.visible_section || ''}`,
    row,
  ]))

  const seenSignatures = new Set()
  const toUpsert = []
  for (const row of sortProjectionRows(projectionRows)) {
    const signature = `${row.document_key}::${row.requested_from || ''}::${row.visible_section || ''}`
    seenSignatures.add(signature)
    const existing = existingBySignature.get(signature)
    toUpsert.push({
      id: existing?.id,
      ...row,
      created_at: existing?.created_at || nowIso,
      updated_at: nowIso,
      last_resolved_at: nowIso,
      superseded_at: null,
      superseded_reason: null,
    })
  }

  if (toUpsert.length) {
    const upsert = await db
      .from(TRANSACTION_DOCUMENT_REQUIREMENT_TABLE)
      .upsert(toUpsert, { onConflict: 'id' })
    if (upsert.error) throw upsert.error
  }

  const stale = existingRows
    .filter((row) => !seenSignatures.has(`${row.document_key}::${row.requested_from || ''}::${row.visible_section || ''}`))
    .map((row) => row.id)
    .filter(Boolean)

  if (stale.length) {
    const staleUpdate = await db
      .from(TRANSACTION_DOCUMENT_REQUIREMENT_TABLE)
      .update({
        superseded_at: nowIso,
        superseded_reason: 'rule_unmatched',
        updated_at: nowIso,
        last_resolved_at: nowIso,
      })
      .in('id', stale)

    if (staleUpdate.error) throw staleUpdate.error
  }

  const refreshed = await db
    .from(TRANSACTION_DOCUMENT_REQUIREMENT_TABLE)
    .select('*')
    .eq('transaction_id', transactionId)
    .is('superseded_at', null)

  if (refreshed.error) throw refreshed.error
  return refreshed.data || []
}

export function buildProjectedTransactionRequirementCandidates({
  transaction = {},
  formData = {},
  documents = [],
  subprocesses = [],
  rules = [],
  definitions = [],
} = {}) {
  const facts = buildTransactionDocumentFacts({
    transaction,
    formData,
    documents,
    subprocesses,
  })
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const resolverInput = {
    contextType: 'transaction',
    contextId: transaction.id,
    transactionId: transaction.id,
    facts,
    options: {
      regenerate: true,
      sourceSystem: TRANSACTION_CANONICAL_DOCUMENT_ENGINE_SOURCE,
      resolverVersion: TRANSACTION_CANONICAL_DOCUMENT_ENGINE_VERSION,
      dryRun: true,
    },
  }

  const normalizedRules = rules.map((rule) => normalizeRule(rule, definitionsByKey))
  const ruleCandidates = resolveRequirementCandidates({
    input: resolverInput,
    rules: normalizedRules,
    definitions,
  })

  const canonicalCandidates = ruleCandidates.matchedRules.map((match) => ({
    generated: match.generated,
    definition: definitionsByKey.get(match.generated.document_definition_key),
    rule: match.rule,
    trace: match.trace,
    source: 'canonical_rule',
    explicitMeta: {},
  }))

  const adapterCandidates = [
    ...buildBuyerAdapterCandidates({ transaction, facts, formData, definitionsByKey }),
    ...buildAttorneyAdapterCandidates({ transaction, facts, definitionsByKey }),
  ]

  const candidates = dedupeCandidateRows([
    ...canonicalCandidates,
    ...adapterCandidates.filter((candidate) => !canonicalCandidates.some((ruleCandidate) => (
      buildInstanceSignature(ruleCandidate.generated) === buildInstanceSignature(candidate.generated)
    ))),
  ])

  return {
    facts,
    resolverInput,
    candidates,
    definitionsByKey,
    ruleCandidates,
  }
}

export async function resolveTransactionDocumentRequirements({
  transactionId,
  transaction = null,
  formData = null,
  documents = null,
  subprocesses = null,
  client = supabase,
  writeLegacyProjection = false,
} = {}) {
  const db = requireClient(client)
  if (!transactionId && !transaction?.id) throw new Error('transactionId is required.')
  const resolvedTransactionId = transactionId || transaction?.id

  const transactionRow = transaction || await loadTransactionRow(db, resolvedTransactionId)
  if (!transactionRow?.id) {
    return {
      transactionId: resolvedTransactionId,
      facts: null,
      requirements: [],
      rolloutMode: DOCUMENT_ROLLOUT_MODES.legacyPrimary,
      skipped: true,
      reason: 'transaction_not_found',
    }
  }

  const [onboardingRow, loadedDocuments, loadedSubprocesses] = await Promise.all([
    formData ? { form_data: formData } : loadOnboardingFormData(db, transactionRow.id),
    Array.isArray(documents) ? documents : loadTransactionDocuments(db, transactionRow.id),
    Array.isArray(subprocesses) ? subprocesses : loadTransactionSubprocesses(db, transactionRow.id),
  ])

  const loadedRules = await loadActiveRequirementRules(db, {
    contextType: 'transaction',
  })
  const definitionsQuery = await db
    .from('document_definitions')
    .select('*')
    .eq('is_active', true)
  if (definitionsQuery.error) throw definitionsQuery.error
  const loadedDefinitions = definitionsQuery.data || await loadDocumentDefinitionsForRules(db, loadedRules)
  const {
    facts,
    resolverInput,
    candidates,
  } = buildProjectedTransactionRequirementCandidates({
    transaction: transactionRow,
    formData: onboardingRow?.form_data || {},
    documents: loadedDocuments,
    subprocesses: loadedSubprocesses,
    rules: loadedRules,
    definitions: loadedDefinitions,
  })

  const generatedInstances = candidates.map((candidate) => candidate.generated)
  const canonicalSync = await syncRequirementInstances({
    input: {
      ...resolverInput,
      options: {
        ...resolverInput.options,
        dryRun: false,
      },
    },
    generatedInstances,
    client: db,
  })

  const instancesBySignature = new Map(
    normalizeArray(canonicalSync.instances).map((instance) => [buildInstanceSignature(instance), instance]),
  )

  const projectionRows = candidates
    .map((candidate) => {
      const signature = buildInstanceSignature(candidate.generated)
      const instance = instancesBySignature.get(signature) || null
      return buildProjectionRow({
        ...candidate,
        instance,
        facts,
      })
    })
    .filter(Boolean)

  const syncedProjectionRows = await syncProjectionRows({
    client: db,
    transactionId: transactionRow.id,
    projectionRows,
  })

  if (writeLegacyProjection) {
    await syncCanonicalToTransactionRequiredDocuments({
      transactionId: transactionRow.id,
      client: db,
      force: true,
    })
  }

  return {
    transactionId: transactionRow.id,
    transaction: transactionRow,
    facts,
    canonicalSync,
    projectionRows: syncedProjectionRows,
    requirements: syncedProjectionRows.map(mapProjectionRowToRequirement),
  }
}

export async function fetchTransactionDocumentRequirementsByTransactionIds({
  transactionIds = [],
  client = supabase,
} = {}) {
  const db = requireClient(client)
  const ids = normalizeArray(transactionIds).map(normalizeText).filter(Boolean)
  if (!ids.length) return {}

  const query = await db
    .from(TRANSACTION_DOCUMENT_REQUIREMENT_TABLE)
    .select('*')
    .in('transaction_id', ids)
    .is('superseded_at', null)

  if (query.error) throw query.error

  const grouped = {}
  for (const row of sortProjectionRows(query.data || [])) {
    if (!grouped[row.transaction_id]) grouped[row.transaction_id] = []
    grouped[row.transaction_id].push(mapProjectionRowToRequirement(row))
  }
  return grouped
}

export async function maybeResolveTransactionDocumentRequirements({
  transactionId,
  transaction = null,
  formData = null,
  documents = null,
  subprocesses = null,
  client = supabase,
  rolloutOptions = {},
} = {}) {
  const rolloutMode = getCanonicalDocumentRolloutMode({
    transactionId,
    organisationId: transaction?.organisation_id,
    ...rolloutOptions,
  })

  if (![DOCUMENT_ROLLOUT_MODES.parity, DOCUMENT_ROLLOUT_MODES.canonicalPrimary, DOCUMENT_ROLLOUT_MODES.canonicalOnly].includes(rolloutMode)) {
    return {
      rolloutMode,
      skipped: true,
      reason: 'legacy_primary_mode',
      requirements: [],
    }
  }

  const writeLegacyProjection = rolloutMode !== DOCUMENT_ROLLOUT_MODES.canonicalOnly || isLegacyDocumentAdapterWritebackEnabled(rolloutOptions)
  const resolution = await resolveTransactionDocumentRequirements({
    transactionId,
    transaction,
    formData,
    documents,
    subprocesses,
    client,
    writeLegacyProjection,
  })

  return {
    ...resolution,
    rolloutMode,
  }
}
