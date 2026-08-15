import {
  getAttorneyJourneyPhaseForStage,
  getAttorneyJourneyPhasesForLane,
  getAttorneyStageDefinitionsForLane,
  normalizeAttorneyStageKey,
} from '../../constants/attorneyWorkflowStages.js'
import {
  buildAttorneyWorkflowActionCommand,
  buildAttorneyWorkflowFollowUpCommand,
} from '../../constants/attorneyWorkflowUsability.js'
import {
  normalizeDealFinanceType,
  normalizeDocumentMaritalRegime,
  normalizeDocumentPartyEntityType,
} from '../../core/documents/documentPartyClassification.js'

export const TRANSFER_WORKSPACE_PHASES = Object.freeze(getAttorneyJourneyPhasesForLane('transfer'))

export const TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'waiting',
  'blocked',
  'completed',
])

const DISPLAY_STATUS_META = Object.freeze({
  not_started: 'Not Started',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  delayed: 'Delayed',
  completed: 'Completed',
})

const UNSUPPORTED_ACTIONS = Object.freeze([
  {
    id: 'mark_delayed',
    label: 'Mark Delayed',
    status: 'delayed',
    disabled: true,
    reason: 'Workflow step persistence does not currently support delayed as a canonical status.',
  },
  {
    id: 'mark_not_applicable',
    label: 'Not Applicable',
    status: 'not_applicable',
    disabled: true,
    reason: 'Workflow step persistence does not currently support not_applicable as a canonical status.',
  },
])

const TRANSFER_ROLLOUT_REQUIRED_WORK_ACTIONS = Object.freeze([
  'request_document',
  'upload_document',
  'open_documents',
  'open_parties',
  'open_finance',
  'schedule_signing',
  'add_note',
])

const TRANSFER_ROLLOUT_REQUIRED_STATUS_ACTIONS = Object.freeze([
  'mark_complete',
  'mark_in_progress',
  'mark_blocked',
  'mark_waiting',
])

const TRANSFER_ROLLOUT_ACTION_MODES = Object.freeze({
  request_document: 'command',
  upload_document: 'workspace_callback',
  open_documents: 'workspace_callback',
  open_parties: 'workspace_callback',
  open_finance: 'workspace_callback',
  schedule_signing: 'command',
  add_note: 'command',
  mark_complete: 'status_update',
  mark_in_progress: 'status_update',
  mark_blocked: 'status_update',
  mark_waiting: 'status_update',
})

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase()
}

function titleize(value = '') {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function asObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function readPath(source = {}, path = '') {
  if (!source || typeof source !== 'object') return undefined
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

function firstScenarioValue(sources = [], paths = []) {
  for (const path of paths) {
    for (const source of sources) {
      const value = readPath(source, path)
      if (value !== null && value !== undefined && text(value) !== '') return value
    }
  }
  return ''
}

function normalizeScenarioBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const normalized = key(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) return null
  if (['true', 'yes', 'y', '1', 'required', 'applicable', 'has_bond', 'bond_registered'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'not_required', 'not_applicable', 'none', 'no_bond', 'cash'].includes(normalized)) return false
  return null
}

function normalizeScenarioEntityType(value = '') {
  const raw = text(value)
  if (!raw) return 'unknown'
  const normalized = normalizeDocumentPartyEntityType(raw)
  if (normalized === 'close_corporation') return 'company'
  return normalized || 'unknown'
}

function normalizeScenarioFinanceType(value = '', facts = {}) {
  const raw = text(value)
  if (raw) return normalizeDealFinanceType(raw) || 'unknown'
  if (facts?.isCashDeal === true) return 'cash'
  return 'unknown'
}

function scenarioDataRequirement({ id = '', label = '', fields = [], description = '', owner = 'transfer_attorney', severity = 'medium' } = {}) {
  return {
    id,
    label: label || titleize(id),
    fields,
    description,
    owner,
    severity,
  }
}

function mergeUniqueValues(...groups) {
  const seen = new Set()
  const merged = []
  groups.flat().forEach((item) => {
    const value = text(item)
    if (!value || seen.has(value)) return
    seen.add(value)
    merged.push(value)
  })
  return merged
}

function mergeUniqueRequirements(...groups) {
  const seen = new Set()
  const merged = []
  groups.flat().forEach((item) => {
    if (!item) return
    const id = text(item.id || item.label || JSON.stringify(item))
    if (!id || seen.has(id)) return
    seen.add(id)
    merged.push(item)
  })
  return merged
}

function normalizeDisplayStatus(value, fallback = 'not_started') {
  const normalized = key(value)
  if (normalized === 'complete') return 'completed'
  if (['pending', 'requested', 'under_review', 'waiting_on_party'].includes(normalized)) return 'waiting'
  if (normalized === 'at_risk') return 'delayed'
  return DISPLAY_STATUS_META[normalized] ? normalized : fallback
}

function normalizePersistedStatus(value, fallback = 'not_started') {
  const normalized = normalizeDisplayStatus(value, fallback)
  return TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES.includes(normalized) ? normalized : fallback
}

function getStoredStepKey(step = {}, workflowKey = 'transfer') {
  return normalizeAttorneyStageKey(step.stepKey || step.step_key || step.key || '', workflowKey)
}

function getCurrentStepKey(lane = {}, workflowKey = 'transfer') {
  const steps = Array.isArray(lane?.steps) ? lane.steps : []
  const explicit = normalizeAttorneyStageKey(lane?.currentStage || lane?.summary?.currentStage || '', workflowKey)
  if (explicit) return explicit

  const current =
    steps.find((step) => ['blocked', 'waiting', 'in_progress'].includes(normalizePersistedStatus(step.status))) ||
    steps.find((step) => normalizePersistedStatus(step.status) !== 'completed') ||
    steps.at(-1)

  return getStoredStepKey(current, workflowKey)
}

function findPhaseForTask(taskKey = '') {
  return getAttorneyJourneyPhaseForStage(taskKey, 'transfer') || TRANSFER_WORKSPACE_PHASES[TRANSFER_WORKSPACE_PHASES.length - 1]
}

function buildTaskSearchText(task = {}) {
  return [
    task.key,
    task.label,
    task.description,
    task.displayStatus,
    task.ownerLabel,
    task.phaseLabel,
    ...(task.requiredDocumentKeys || []),
    ...(task.evidenceRequirements || []),
    ...(task.scenarioRequirements?.documents || []),
    ...(task.scenarioRequirements?.evidence || []),
  ]
    .map(key)
    .filter(Boolean)
    .join(' ')
}

function resolveAssignedToMe({ storedStep = null, definition = {}, lane = null, workflow = null } = {}) {
  const explicit = storedStep?.assignedToMe ?? storedStep?.assigned_to_me ?? definition.assignedToMe ?? definition.assigned_to_me
  if (typeof explicit === 'boolean') return explicit
  const currentUserId = text(workflow?.currentUserId || workflow?.userId || workflow?.facts?.currentUserId || lane?.currentUserId || lane?.userId)
  const ownerId = text(storedStep?.ownerId || storedStep?.owner_id || storedStep?.assignedTo || storedStep?.assigned_to || definition.ownerId)
  if (currentUserId && ownerId) return currentUserId === ownerId
  const currentRole = key(workflow?.currentUserRole || workflow?.role || lane?.currentUserRole || lane?.role)
  const ownerRole = key(definition.ownerRole || storedStep?.ownerRole || storedStep?.owner_type || 'transfer_attorney')
  return Boolean(currentRole && ownerRole && currentRole === ownerRole)
}

function normalizeDocumentKey(value) {
  return key(value).replace(/\s+/g, '_')
}

function documentMatchesRequiredKey(document = {}, requiredKey = '') {
  const expected = normalizeDocumentKey(requiredKey)
  if (!expected) return false
  const values = [
    document.id,
    document.key,
    document.requirementId,
    document.requirement_id,
    document.requiredDocumentKey,
    document.required_document_key,
    document.documentType,
    document.document_type,
    document.category,
    document.categoryLabel,
    document.displayName,
    document.name,
    document.label,
    document.relatedWorkflow,
  ]
  return values.some((value) => {
    const candidate = normalizeDocumentKey(value)
    return Boolean(candidate) && (candidate.includes(expected) || expected.includes(candidate))
  })
}

function getDocumentStatus(document = {}) {
  const normalized = key(document.status || document.reviewStatus || document.review_status || (document.complete ? 'completed' : 'missing'))
  if (['missing', 'requested', 'uploaded', 'under_review', 'pending_review', 'approved', 'accepted', 'verified', 'rejected', 'completed', 'ready'].includes(normalized)) {
    return normalized
  }
  return 'missing'
}

function isDocumentReady(document = {}) {
  const status = getDocumentStatus(document)
  return ['uploaded', 'under_review', 'pending_review', 'approved', 'accepted', 'verified', 'completed', 'ready'].includes(status) || document.complete === true
}

const FICA_RECEIVED_STATUSES = new Set(['uploaded', 'under_review', 'pending_review', 'approved', 'accepted', 'verified', 'completed', 'ready'])
const FICA_ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'verified', 'completed', 'ready'])
const GUARANTEE_STAGE_KEYS = new Set(['guarantees_requested', 'guarantees_received', 'transfer_guarantees_accepted'])
const PARTY_DOCUMENT_KEYS = Object.freeze({
  buyer: Object.freeze([
    'buyer_id_document',
    'buyer_proof_of_address',
    'buyer_company_registration_documents',
    'buyer_company_resolution',
    'buyer_director_ids',
    'buyer_authorised_signatory_id',
    'buyer_trust_deed',
    'buyer_letters_of_authority',
    'buyer_trustee_ids',
    'buyer_trustee_resolution',
    'buyer_marital_status_documents',
    'buyer_marital_capacity_documents',
    'buyer_marriage_certificate',
    'buyer_antenuptial_contract',
    'buyer_spouse_consent',
    'buyer_spousal_consent_if_required',
  ]),
  seller: Object.freeze([
    'seller_id_document',
    'seller_proof_of_address',
    'seller_company_registration_documents',
    'seller_company_resolution',
    'seller_director_ids',
    'seller_authorised_signatory_id',
    'seller_trust_deed',
    'seller_letters_of_authority',
    'seller_trustee_ids',
    'seller_trustee_resolution',
    'seller_marital_status_documents',
    'seller_marital_capacity_documents',
    'seller_marriage_certificate',
    'seller_antenuptial_contract',
    'seller_spouse_consent',
    'seller_spousal_consent_if_required',
  ]),
})

function buildTransferScenarioSources({ workflow = null, lane = null, facts = {} } = {}) {
  const routingProfile = asObject(
    facts?.routingProfile ||
      facts?.routing_profile ||
      facts?.routing_profile_json ||
      workflow?.routingProfile ||
      workflow?.routing_profile ||
      workflow?.routing_profile_json ||
      workflow?.transaction?.routing_profile_json,
  )
  const onboarding = asObject(
    workflow?.onboardingFormData ||
      workflow?.onboarding_form_data ||
      workflow?.transaction?.onboarding_form_data ||
      workflow?.transaction?.onboardingFormData,
  )
  return [
    facts,
    routingProfile,
    onboarding,
    workflow?.transaction || {},
    workflow || {},
    lane || {},
  ]
}

function buildPartyScenarioProfile(role = 'buyer', sources = []) {
  const normalizedRole = role === 'seller' ? 'seller' : 'buyer'
  const aliasRole = normalizedRole === 'buyer' ? 'purchaser' : 'seller'
  const capitalizedRole = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)
  const entityType = normalizeScenarioEntityType(firstScenarioValue(sources, [
    `${normalizedRole}EntityType`,
    `${normalizedRole}_entity_type`,
    `${aliasRole}EntityType`,
    `${aliasRole}_entity_type`,
    `${normalizedRole}Type`,
    `${normalizedRole}_type`,
    `${normalizedRole}.entityType`,
    `${normalizedRole}.entity_type`,
    `${normalizedRole}.type`,
    `${normalizedRole}.legal_type`,
    `routingProfile.${normalizedRole}EntityType`,
    `routing_profile.${normalizedRole}EntityType`,
  ]))
  const maritalRegime = normalizeDocumentMaritalRegime(firstScenarioValue(sources, [
    `${normalizedRole}MaritalStatus`,
    `${normalizedRole}_marital_status`,
    `${normalizedRole}MaritalRegime`,
    `${normalizedRole}_marital_regime`,
    `${aliasRole}MaritalStatus`,
    `${aliasRole}_marital_status`,
    `${normalizedRole}.maritalStatus`,
    `${normalizedRole}.marital_status`,
    `${normalizedRole}.maritalRegime`,
    `${normalizedRole}.marital_regime`,
    `${normalizedRole}.person.marital_status`,
    `${normalizedRole}.person.marital_regime`,
  ]))
  const explicitSpouseConsent = normalizeScenarioBoolean(firstScenarioValue(sources, [
    `${normalizedRole}SpouseConsentRequired`,
    `${normalizedRole}_spouse_consent_required`,
    `${normalizedRole}.spouseConsentRequired`,
    `${normalizedRole}.spouse_consent_required`,
    `${normalizedRole}.person.spouse_consent_required`,
  ]))
  const isCompany = entityType === 'company'
  const isTrust = entityType === 'trust'
  const isIndividual = entityType === 'individual'
  const isKnownEntity = entityType !== 'unknown'
  const spouseConsentRequired = explicitSpouseConsent ?? (isIndividual && maritalRegime === 'in_community')
  const maritalStatusKnown = !isIndividual || Boolean(maritalRegime)
  const authorityRequired = isCompany || isTrust || (isIndividual && Boolean(maritalRegime) && maritalRegime !== 'single')
  const authorityLabel = isCompany
    ? 'Company authority'
    : isTrust
      ? 'Trust authority'
      : isIndividual && maritalRegime === 'single'
        ? 'Individual capacity'
        : isIndividual && maritalRegime
          ? 'Marital capacity'
          : isIndividual
            ? 'Individual capacity to confirm'
            : 'Capacity to confirm'

  return {
    role: normalizedRole,
    roleLabel: capitalizedRole,
    entityType,
    entityTypeLabel: entityType === 'unknown' ? 'Entity type to confirm' : titleize(entityType),
    maritalRegime,
    maritalRegimeLabel: maritalRegime ? titleize(maritalRegime) : isIndividual ? 'Marital status to confirm' : '',
    isCompany,
    isTrust,
    isIndividual,
    isKnownEntity,
    isLegalEntity: isCompany || isTrust,
    authorityRequired,
    spouseConsentRequired,
    status: !isKnownEntity || !maritalStatusKnown ? 'attention' : 'covered',
    coverageLabel: isIndividual
      ? `${titleize(entityType)}${maritalRegime ? `, ${titleize(maritalRegime)}` : ''}`
      : entityType === 'unknown'
        ? 'Entity type to confirm'
        : titleize(entityType),
    detail: spouseConsentRequired
      ? 'Spousal consent evidence applies.'
      : authorityRequired
        ? `${authorityLabel} evidence applies.`
        : isKnownEntity
          ? `${authorityLabel} applies.`
          : 'Capture party type before closing authority checks.',
  }
}

function buildPartyScenarioRequirements(profile = {}) {
  const role = profile.role === 'seller' ? 'seller' : 'buyer'
  const capitalizedRole = role.charAt(0).toUpperCase() + role.slice(1)
  const data = []
  const documents = []
  const evidence = []

  data.push(scenarioDataRequirement({
    id: `${role}_entity_type`,
    label: `${capitalizedRole} Entity Type`,
    fields: [`${role}_entity_type`, `${role}EntityType`, `${role}.entity_type`, `${role}.legal_type`],
    description: `Determines ${role} FICA and authority requirements.`,
    owner: 'agent',
    severity: 'high',
  }))

  if (profile.isIndividual || profile.entityType === 'unknown') {
    data.push(scenarioDataRequirement({
      id: `${role}_marital_status`,
      label: `${capitalizedRole} Marital Status`,
      fields: [`${role}_marital_status`, `${role}MaritalStatus`, `${role}.marital_status`, `${role}.person.marital_status`],
      description: `Confirms ${role} signing capacity and spouse consent requirements.`,
      owner: role,
      severity: 'high',
    }))
  }

  if (profile.isIndividual) {
    documents.push(`${role}_id_document`, `${role}_proof_of_address`)
    if (profile.maritalRegime && profile.maritalRegime !== 'single') {
      documents.push(`${role}_marital_status_documents`)
      evidence.push(`${capitalizedRole} marital capacity evidence is reviewed.`)
    }
    if (profile.maritalRegime === 'out_of_community') {
      documents.push(`${role}_antenuptial_contract`)
    }
    if (profile.maritalRegime === 'in_community' || profile.spouseConsentRequired) {
      documents.push(`${role}_spouse_consent`)
      evidence.push(`${capitalizedRole} spousal consent route is confirmed.`)
    }
  } else if (profile.isCompany) {
    data.push(scenarioDataRequirement({
      id: `${role}_representative_capacity`,
      label: `${capitalizedRole} Representative Capacity`,
      fields: [`${role}_representative_capacity`, `${role}.company.authorised_signatory.capacity`, `${role}.representative_capacity`],
      description: `Confirms the authorised ${role} company signer.`,
      owner: role,
      severity: 'high',
    }))
    documents.push(`${role}_company_registration_documents`, `${role}_company_resolution`, `${role}_director_ids`)
    evidence.push(`${capitalizedRole} company registration, resolution, and signatory authority are reviewed.`)
  } else if (profile.isTrust) {
    data.push(scenarioDataRequirement({
      id: `${role}_trustee_authority`,
      label: `${capitalizedRole} Trustee Authority`,
      fields: [`${role}_trustee_names`, `${role}.trust.trustees`, `${role}.trust.authorised_trustee.capacity`, `${role}_authority_basis`],
      description: `Confirms the authorised ${role} trustee and authority basis.`,
      owner: role,
      severity: 'high',
    }))
    documents.push(`${role}_trust_deed`, `${role}_letters_of_authority`, `${role}_trustee_ids`, `${role}_trustee_resolution`)
    evidence.push(`${capitalizedRole} trust deed, letters of authority, trustees, and resolution are reviewed.`)
  }

  return {
    data,
    documents: mergeUniqueValues(documents),
    evidence,
  }
}

function buildTransferScenarioProfile({ workflow = null, lane = null, facts = {} } = {}) {
  const sources = buildTransferScenarioSources({ workflow, lane, facts })
  const buyer = buildPartyScenarioProfile('buyer', sources)
  const seller = buildPartyScenarioProfile('seller', sources)
  const rawFinanceType = firstScenarioValue(sources, [
    'financeType',
    'finance_type',
    'transaction_finance_type',
    'purchase_finance_type',
    'finance.financeType',
    'finance.finance_type',
    'routingProfile.financeType',
    'routing_profile.financeType',
  ])
  const financeType = normalizeScenarioFinanceType(rawFinanceType, facts)
  const explicitGuaranteesRequired = normalizeScenarioBoolean(firstScenarioValue(sources, [
    'requiresGuarantees',
    'requires_guarantees',
    'guaranteesRequired',
    'guarantees_required',
  ]))
  const requiresGuarantees = explicitGuaranteesRequired ?? (financeType === 'cash' ? false : financeType === 'unknown' ? true : ['bond', 'combination', 'hybrid', 'developer'].includes(financeType))
  const isCashDeal = facts?.isCashDeal === true || (financeType === 'cash' && requiresGuarantees === false)
  const sellerExistingBond = normalizeScenarioBoolean(firstScenarioValue(sources, [
    'sellerHasExistingBond',
    'seller_has_existing_bond',
    'sellerHasBond',
    'seller_has_bond',
    'existingBond',
    'existing_bond',
    'bond_status',
    'seller.bond_status',
    'routingProfile.sellerHasExistingBond',
    'routing_profile.sellerHasExistingBond',
  ]))
  const explicitCancellationRequired = normalizeScenarioBoolean(firstScenarioValue(sources, [
    'cancellationRequired',
    'cancellation_required',
    'requiresCancellation',
    'requires_cancellation',
    'routingProfile.cancellationRequired',
    'routing_profile.cancellationRequired',
  ]))
  const requiresCancellation = explicitCancellationRequired ?? sellerExistingBond ?? false
  const financeLabel = financeType === 'unknown'
    ? 'Finance route to confirm'
    : financeType === 'combination'
      ? 'Hybrid finance'
      : titleize(financeType)
  const cancellationLabel = sellerExistingBond === null && explicitCancellationRequired === null
    ? 'Existing bond to confirm'
    : requiresCancellation
      ? 'Cancellation lane required'
      : 'No cancellation lane required'

  return {
    laneKey: 'transfer',
    buyer,
    seller,
    finance: {
      type: financeType,
      label: financeLabel,
      isCashDeal,
      requiresGuarantees,
      status: financeType === 'unknown' ? 'attention' : 'covered',
      detail: requiresGuarantees ? 'Guarantee and bond coordination tasks apply.' : 'Cash route; bond guarantee tasks are not required.',
    },
    cancellation: {
      sellerHasExistingBond: sellerExistingBond,
      required: requiresCancellation,
      status: sellerExistingBond === null && explicitCancellationRequired === null ? 'attention' : 'covered',
      label: cancellationLabel,
      detail: requiresCancellation ? 'Transfer must coordinate with cancellation where applicable.' : 'Transfer still confirms the seller bond position.',
    },
    coverageItems: [
      {
        key: 'buyer_capacity',
        label: 'Buyer Capacity',
        value: buyer.coverageLabel,
        detail: buyer.detail,
        status: buyer.status,
      },
      {
        key: 'seller_capacity',
        label: 'Seller Capacity',
        value: seller.coverageLabel,
        detail: seller.detail,
        status: seller.status,
      },
      {
        key: 'finance_route',
        label: 'Finance Route',
        value: financeLabel,
        detail: requiresGuarantees ? 'Guarantees tracked.' : 'Cash route tracked.',
        status: financeType === 'unknown' ? 'attention' : 'covered',
      },
      {
        key: 'cancellation_route',
        label: 'Cancellation Route',
        value: cancellationLabel,
        detail: requiresCancellation ? 'Cancellation dependency tracked.' : 'Existing bond position tracked.',
        status: sellerExistingBond === null && explicitCancellationRequired === null ? 'attention' : 'covered',
      },
    ],
  }
}

function applyTransferScenarioToTask(definition = {}, scenario = null) {
  if (!scenario) return definition
  const taskKey = definition.key
  const isBuyerFicaTask = /^buyer_fica/.test(taskKey)
  const isSellerFicaTask = /^seller_fica/.test(taskKey)
  const isAuthorityTask = taskKey === 'entity_authority_checked'
  if (!isBuyerFicaTask && !isSellerFicaTask && !isAuthorityTask) return definition

  const roles = isBuyerFicaTask ? ['buyer'] : isSellerFicaTask ? ['seller'] : ['buyer', 'seller']
  const requirementGroups = roles.map((role) => buildPartyScenarioRequirements(scenario[role]))
  const scopedPartyKeys = new Set(roles.flatMap((role) => PARTY_DOCUMENT_KEYS[role] || []))
  const knownPartyTypes = roles.every((role) => scenario[role]?.entityType && scenario[role].entityType !== 'unknown')
  const existingDocuments = Array.isArray(definition.requiredDocuments) ? definition.requiredDocuments : []
  const baseDocuments = knownPartyTypes
    ? existingDocuments.filter((documentKey) => !scopedPartyKeys.has(documentKey))
    : existingDocuments
  const scenarioDocuments = requirementGroups.flatMap((group) => group.documents)
  const scenarioEvidence = requirementGroups.flatMap((group) => group.evidence)

  return {
    ...definition,
    requiredData: mergeUniqueRequirements(definition.requiredData || [], requirementGroups.flatMap((group) => group.data)),
    requiredDocuments: mergeUniqueValues(baseDocuments, scenarioDocuments),
    evidenceRequirements: mergeUniqueValues(definition.evidenceRequirements || [], scenarioEvidence),
    scenarioRequirements: {
      roles,
      documents: mergeUniqueValues(scenarioDocuments),
      evidence: mergeUniqueValues(scenarioEvidence),
    },
  }
}

function rowMatchesPartyFica(document = {}, party = '') {
  const normalizedParty = key(party)
  if (!normalizedParty) return false
  const category = key(document.canonicalCategory || document.category)
  const owner = key(document.requiredParty || document.ownerLabel || document.uploadedByRole || document.uploaded_by_role)
  if (category && category !== normalizedParty && owner && owner !== normalizedParty) return false
  if (!category && owner !== normalizedParty) return false
  const haystack = [
    document.categoryGroup,
    document.categoryGroupLabel,
    document.displayName,
    document.documentType,
    document.documentTypeLabel,
    document.requiredDocumentKey,
    document.label,
    document.name,
    document.key,
    document.sourceRequirementKey,
  ].map(key).join(' ')
  return (
    document.categoryGroup === 'identity_fica' ||
    haystack.includes('fica') ||
    haystack.includes('identity') ||
    haystack.includes(' id') ||
    haystack.includes('_id') ||
    haystack.includes('proof of address') ||
    haystack.includes('proof_of_address') ||
    haystack.includes('proof of residence') ||
    haystack.includes('proof_of_residence')
  )
}

function dedupeFicaRows(rows = []) {
  const seen = new Set()
  return rows.filter((row) => {
    const keyValue = text(
      row.canonicalRequirementInstanceId ||
        row.requiredDocumentCanonicalId ||
        row.requiredDocumentId ||
        row.requiredDocumentKey ||
        row.id ||
        row.key ||
        row.displayName,
    )
    if (!keyValue || seen.has(keyValue)) return false
    seen.add(keyValue)
    return true
  })
}

function buildFicaTaskDerivedCompletion(taskKey = '', documents = []) {
  const normalizedTaskKey = key(taskKey)
  const party = normalizedTaskKey.startsWith('buyer_fica') ? 'buyer' : normalizedTaskKey.startsWith('seller_fica') ? 'seller' : ''
  if (!party) return null
  const acceptedStage = normalizedTaskKey.includes('approved')
  const matchingRows = dedupeFicaRows((Array.isArray(documents) ? documents : []).filter((document) => rowMatchesPartyFica(document, party)))
  if (!matchingRows.length) return null
  const requirementRows = matchingRows.filter((row) => row.source === 'transaction_required_documents' || row.requirement || row.requiredDocument)
  const basisRows = requirementRows.length ? requirementRows : matchingRows
  const statusSet = acceptedStage ? FICA_ACCEPTED_STATUSES : FICA_RECEIVED_STATUSES
  const completeRows = basisRows.filter((row) => statusSet.has(getDocumentStatus(row)))
  const relatedDocuments = basisRows.map((row) => ({
    ...row,
    status: getDocumentStatus(row),
    ready: statusSet.has(getDocumentStatus(row)),
    sourceRequirementKey: row.requiredDocumentKey || row.key || row.sourceRequirementKey || taskKey,
  }))
  return {
    type: acceptedStage ? 'fica_accepted' : 'fica_received',
    party,
    complete: basisRows.length > 0 && completeRows.length === basisRows.length,
    relatedDocuments,
    completedCount: completeRows.length,
    totalCount: basisRows.length,
  }
}

function isTaskDueWithin(task = {}, days = 7, now = new Date()) {
  if (!task.dueDate || task.displayStatus === 'completed') return false
  const dueTime = new Date(task.dueDate).getTime()
  if (!Number.isFinite(dueTime)) return false
  const start = new Date(now).getTime()
  const end = start + days * 24 * 60 * 60 * 1000
  return dueTime >= start && dueTime <= end
}

function isTaskOverdue(task = {}, now = new Date()) {
  if (!task.dueDate || task.displayStatus === 'completed') return false
  const dueTime = new Date(task.dueDate).getTime()
  return Number.isFinite(dueTime) && dueTime < new Date(now).getTime()
}

function buildWorkflowTasks({ workflowKey = 'transfer', lane = null, workflow = null, documents = [], scenario = null } = {}) {
  const definitions = getAttorneyStageDefinitionsForLane(workflowKey)
    .filter((definition) => scenario?.finance?.requiresGuarantees === false ? !GUARANTEE_STAGE_KEYS.has(definition.key) : true)
    .map((definition) => applyTransferScenarioToTask(definition, scenario))
  const laneSteps = Array.isArray(lane?.steps) ? lane.steps : []
  const storedStepMap = new Map(
    laneSteps.map((step) => [getStoredStepKey(step, workflowKey), step]),
  )
  const currentKey = getCurrentStepKey(lane || {}, workflowKey)
  let currentIndex = definitions.findIndex((definition) => definition.key === currentKey)

  if (currentIndex < 0) {
    currentIndex = definitions.findIndex((definition) => {
      const storedStep = storedStepMap.get(definition.key)
      return normalizePersistedStatus(storedStep?.status) !== 'completed'
    })
  }
  if (currentIndex < 0 && definitions.length) currentIndex = definitions.length - 1

  return definitions.map((definition, index) => {
    const storedStep = storedStepMap.get(definition.key) || null
    const persistedStatus = normalizePersistedStatus(storedStep?.status)
    let displayStatus = normalizeDisplayStatus(storedStep?.status)

    if (!storedStep) {
      displayStatus = index < currentIndex ? 'completed' : index === currentIndex ? 'in_progress' : 'not_started'
    } else if (index === currentIndex && !['completed', 'blocked', 'waiting', 'delayed'].includes(displayStatus)) {
      displayStatus = 'in_progress'
    }

    const phase = findPhaseForTask(definition.key)

    const derivedCompletion = buildFicaTaskDerivedCompletion(definition.key, documents)
    if (derivedCompletion?.complete && displayStatus !== 'completed') {
      displayStatus = 'completed'
    }

    return {
      id: storedStep?.id || definition.key,
      key: definition.key,
      stepKey: definition.key,
      label: definition.label,
      description: definition.description || '',
      actionLabel: definition.actionLabel || definition.label,
      phaseKey: phase.key,
      phaseLabel: phase.label,
      status: persistedStatus,
      displayStatus,
      derivedCompletion,
      statusLabel: DISPLAY_STATUS_META[displayStatus] || DISPLAY_STATUS_META.not_started,
      isCurrent: index === currentIndex,
      completedAt: storedStep?.completedAt || storedStep?.completed_at || null,
      updatedAt: storedStep?.updatedAt || storedStep?.updated_at || null,
      comment: storedStep?.comment || '',
      dueDate: storedStep?.dueDate || storedStep?.due_date || null,
      ownerRole: definition.ownerRole || storedStep?.ownerRole || storedStep?.owner_type || 'transfer_attorney',
      ownerLabel: definition.ownerLabel || 'Transfer Attorney',
      assignedToMe: resolveAssignedToMe({ storedStep, definition, lane, workflow }),
      readinessGate: definition.readinessGate || null,
      evidenceRequirements: [...(definition.evidenceRequirements || [])],
      requiredData: [...(definition.requiredData || [])],
      requiredDocumentKeys: [...(definition.requiredDocuments || [])],
      scenarioRequirements: definition.scenarioRequirements || null,
      defaultVisibility: definition.defaultVisibility || 'professional_shared',
      clientVisibleAllowed: definition.clientVisibleAllowed !== false,
      requiresNote: Boolean(definition.requiresNote),
      sortOrder: storedStep?.sortOrder || storedStep?.sort_order || index + 1,
      storedStep,
      searchText: '',
    }
  }).map((task) => ({ ...task, searchText: buildTaskSearchText(task) }))
}

function buildPhases(tasks = []) {
  return TRANSFER_WORKSPACE_PHASES.map((phase, index) => {
    const phaseTasks = tasks.filter((task) => task.phaseKey === phase.key)
    const completed = phaseTasks.filter((task) => task.displayStatus === 'completed').length
    const blocked = phaseTasks.filter((task) => task.displayStatus === 'blocked').length
    const waiting = phaseTasks.filter((task) => task.displayStatus === 'waiting').length
    const overdue = phaseTasks.filter((task) => task.isOverdue).length
    const missingDocuments = phaseTasks.filter((task) => task.missingDocumentCount > 0).length
    const active = phaseTasks.filter((task) => task.isCurrent || task.displayStatus === 'in_progress').length
    const total = phaseTasks.length
    const currentTask = phaseTasks.find((task) => task.isCurrent) || phaseTasks.find((task) => task.displayStatus !== 'completed') || phaseTasks.at(-1) || null
    const status = !total
      ? 'not_started'
      : completed === total
        ? 'completed'
        : blocked
          ? 'blocked'
          : active
            ? 'in_progress'
            : waiting
              ? 'waiting'
              : 'not_started'

    return {
      ...phase,
      sequence: index + 1,
      tasks: phaseTasks,
      completed,
      blocked,
      waiting,
      overdue,
      missingDocuments,
      warningCount: blocked + overdue + missingDocuments,
      active,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      status,
      statusLabel: DISPLAY_STATUS_META[status] || DISPLAY_STATUS_META.not_started,
      currentTask,
      hasCurrentTask: phaseTasks.some((task) => task.isCurrent),
    }
  }).filter((phase) => phase.total > 0)
}

function resolveSelectedTask(tasks = [], selectedTaskKey = '') {
  const normalized = normalizeAttorneyStageKey(selectedTaskKey, 'transfer')
  const selected = normalized
    ? tasks.find((task) => task.key === normalized || task.id === selectedTaskKey)
    : null

  return (
    selected ||
    tasks.find((task) => task.displayStatus === 'blocked') ||
    tasks.find((task) => task.displayStatus === 'waiting') ||
    tasks.find((task) => task.displayStatus === 'in_progress') ||
    tasks.find((task) => task.displayStatus !== 'completed') ||
    tasks[0] ||
    null
  )
}

function filterTasks(tasks = [], { search = '', status = '', phaseKey = '', attention = '' } = {}) {
  const query = key(search)
  return tasks.filter((task) => {
    if (query && !task.searchText.includes(query)) return false
    if (status === 'open' && task.displayStatus === 'completed') return false
    else if (status === 'completed' && task.displayStatus !== 'completed') return false
    else if (status === 'blocked' && task.displayStatus !== 'blocked') return false
    else if (status === 'delayed' && task.displayStatus !== 'delayed') return false
    else if (status === 'overdue' && !task.isOverdue) return false
    else if (status === 'due_this_week' && !task.isDueThisWeek) return false
    else if (status === 'assigned_to_me' && !task.assignedToMe) return false
    else if (status === 'missing_documents' && task.missingDocumentCount <= 0) return false
    else if (status && !['open', 'completed', 'blocked', 'delayed', 'overdue', 'due_this_week', 'assigned_to_me', 'missing_documents'].includes(status) && task.displayStatus !== status) return false
    if (phaseKey && task.phaseKey !== phaseKey) return false
    if (attention === 'blocked' && task.displayStatus !== 'blocked') return false
    if (attention === 'overdue' && !task.isOverdue) return false
    if (attention === 'due_this_week' && !task.isDueThisWeek) return false
    if (attention === 'missing_documents' && task.missingDocumentCount <= 0) return false
    return true
  })
}

function buildRelatedDocuments(task = null, lane = null, documents = []) {
  if (!task) return []
  const requirements = Array.isArray(lane?.documentRequirements) ? lane.documentRequirements : []
  const rows = [...requirements, ...(Array.isArray(documents) ? documents : [])]
  const requiredKeys = task.requiredDocumentKeys || []
  const matched = requiredKeys.flatMap((requiredKey) => {
    const matches = rows.filter((row) => documentMatchesRequiredKey(row, requiredKey))
    if (matches.length) {
      return matches.map((row) => ({
        ...row,
        sourceRequirementKey: requiredKey,
        status: row.status || row.reviewStatus || row.review_status || 'missing',
        ready: isDocumentReady(row),
      }))
    }
    return [{
      id: `missing:${requiredKey}`,
      key: requiredKey,
      label: requiredKey.split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
      sourceRequirementKey: requiredKey,
      status: 'missing',
      ready: false,
      missing: true,
    }]
  })

  const seen = new Set()
  return matched.filter((row) => {
    const rowKey = text(row.id || row.requestId || row.key || row.label || row.sourceRequirementKey)
    if (!rowKey || seen.has(rowKey)) return false
    seen.add(rowKey)
    return true
  })
}

function buildCompletionReadiness(task = null) {
  if (!task) {
    return {
      canComplete: false,
      missingRequiredDocuments: [],
      warnings: ['Select a workflow task before updating status.'],
    }
  }

  const missingRequiredDocuments = (task.relatedDocuments || []).filter((document) => document.missing || document.ready === false)
  const warnings = [
    ...missingRequiredDocuments.map((document) => `${document.displayName || document.label || document.name || document.sourceRequirementKey} is not ready.`),
  ]

  return {
    canComplete: missingRequiredDocuments.length === 0,
    missingRequiredDocuments,
    warnings,
  }
}

function buildDependencySummary(tasks = [], task = null) {
  if (!task) {
    return {
      status: 'not_started',
      label: 'No task selected',
      blockers: [],
      advisory: false,
      blocksWork: false,
    }
  }

  const taskIndex = tasks.findIndex((item) => item.key === task.key)
  const earlierTasks = taskIndex > 0 ? tasks.slice(0, taskIndex) : []
  const blockers = earlierTasks.filter((item) => item.displayStatus !== 'completed')
  const advisory = blockers.length > 0
  return {
    status: advisory ? 'waiting' : 'completed',
    label: advisory ? `${blockers.length} earlier task${blockers.length === 1 ? '' : 's'} still open` : 'Dependencies clear',
    blockers: blockers.slice(-3),
    advisory,
    blocksWork: false,
    helper: advisory ? 'You can work ahead, but review these before completion.' : 'No earlier open tasks.',
  }
}

function buildChecklistItems(task = null) {
  if (!task) return []
  const evidenceItems = (task.evidenceRequirements || []).map((label, index) => ({
    id: `evidence:${task.key}:${index}`,
    label,
    type: 'evidence',
    required: true,
    complete: task.displayStatus === 'completed',
    persisted: false,
  }))
  const dataItems = (task.requiredData || []).map((requirement) => ({
    id: `data:${requirement.id || requirement.label}`,
    label: requirement.label || requirement.id,
    description: requirement.description || '',
    type: 'data',
    required: requirement.required !== false,
    complete: task.displayStatus === 'completed',
    persisted: false,
  }))
  const documentItems = (task.relatedDocuments || []).map((document) => ({
    id: `document:${document.id || document.key || document.sourceRequirementKey}`,
    label: document.displayName || document.label || document.name || document.sourceRequirementKey,
    description: document.sourceRequirementKey || '',
    type: 'document',
    required: true,
    complete: document.ready === true,
    persisted: Boolean(document.id && !document.missing),
  }))

  return [...evidenceItems, ...dataItems, ...documentItems]
}

function normalizeVisibilityLabel(value = '') {
  const normalized = key(value)
  if (normalized === 'internal') return 'Internal'
  if (normalized === 'client_visible' || normalized === 'client_safe') return 'Client Visible'
  if (normalized === 'professional_shared' || normalized === 'shared') return 'Professional Shared'
  if (normalized === 'system') return 'System'
  return normalized ? normalized.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Shared'
}

function buildTaskNotes(activityFeed = []) {
  return activityFeed.filter((entry) => {
    const category = key(entry?.category)
    const kind = key(entry?.kind)
    const messageType = key(entry?.messageType || entry?.type)
    const title = key(entry?.title)
    return (
      kind === 'comment' ||
      category === 'notes' ||
      category === 'internal' ||
      messageType === 'comment' ||
      title.includes('note')
    )
  }).map((entry) => ({
    ...entry,
    visibilityLabel: normalizeVisibilityLabel(entry.visibility),
    internal: key(entry.visibility) === 'internal' || key(entry.category) === 'internal',
  }))
}

function buildTaskTabs({ checklistItems = [], relatedDocuments = [], notes = [], activityFeed = [], canAddNotes = true } = {}) {
  return [
    { key: 'overview', label: 'Overview', count: null },
    checklistItems.length ? { key: 'checklist', label: 'Checklist', count: checklistItems.length, readOnly: true } : null,
    relatedDocuments.length ? { key: 'documents', label: 'Documents', count: relatedDocuments.length } : null,
    notes.length || canAddNotes ? { key: 'notes', label: 'Notes', count: notes.length } : null,
    activityFeed.length ? { key: 'activity', label: 'Activity', count: activityFeed.length } : null,
  ].filter(Boolean)
}

function normalizeKeyDateRows(keyDates = []) {
  const preferredOrder = [
    'instruction date',
    'agreement date',
    'obligation date',
    'transfer duty due',
    'lodgement date',
    'expected registration',
  ]
  const rows = (Array.isArray(keyDates) ? keyDates : []).map((row) => {
    if (Array.isArray(row)) {
      return {
        key: key(row[0]),
        label: text(row[0]) || 'Date',
        value: normalizeEmptyDateValue(row[1]),
      }
    }
    return {
      key: key(row.key || row.label || row.name),
      label: text(row.label || row.name || row.key) || 'Date',
      value: normalizeEmptyDateValue(row.value || row.date || row.dueDate),
    }
  })

  return rows
    .sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(key(left.label))
      const rightIndex = preferredOrder.indexOf(key(right.label))
      return (leftIndex === -1 ? preferredOrder.length : leftIndex) - (rightIndex === -1 ? preferredOrder.length : rightIndex)
    })
    .slice(0, 6)
}

function normalizeEmptyDateValue(value) {
  const cleaned = text(value)
  if (!cleaned || ['tbd', 'null', 'undefined', 'n/a', '-'].includes(key(cleaned))) return 'Not set'
  return cleaned
}

function normalizePartyRows({ parties = [], workflow = null, selectedTask = null } = {}) {
  const rows = (Array.isArray(parties) ? parties : []).map((item) => ({
    key: key(item.key || item.role || item.label || item.name),
    label: text(item.label || item.role || item.key) || 'Party',
    value: text(item.value || item.name || item.displayName) || 'Not assigned',
    role: key(item.role || item.key || item.label),
  }))

  const hasRole = (role) => rows.some((item) => item.role === role || item.key === role)
  if (!hasRole('buyer')) {
    rows.unshift({ key: 'buyer', label: 'Buyer', value: 'Not assigned', role: 'buyer' })
  }
  if (!hasRole('seller')) {
    rows.splice(1, 0, { key: 'seller', label: 'Seller', value: 'Not assigned', role: 'seller' })
  }

  const assignedLabel = text(workflow?.assignedDisplay || selectedTask?.ownerLabel) || 'Matter team'
  if (!hasRole('assigned_attorney')) {
    rows.push({ key: 'assigned_attorney', label: 'Assigned Attorney', value: assignedLabel, role: 'assigned_attorney' })
  }
  if (!hasRole('matter_team')) {
    rows.push({ key: 'matter_team', label: 'Matter Team', value: assignedLabel, role: 'matter_team' })
  }

  const seen = new Set()
  return rows.filter((item) => {
    if (!item.key || seen.has(item.key)) return false
    seen.add(item.key)
    return true
  }).slice(0, 6)
}

function buildDocumentSummary(relatedDocuments = []) {
  const required = relatedDocuments.length
  const received = relatedDocuments.filter((document) => document.ready === true).length
  const missing = relatedDocuments.filter((document) => document.missing || document.ready === false).length
  return {
    required,
    received,
    missing,
    label: required ? `${received} / ${required} received` : 'No required documents',
  }
}

function buildAvailableActions(task = null, permissions = {}) {
  const canUpdate = Boolean(permissions.canUpdateStage ?? permissions.canUpdateSteps ?? permissions.canUpdate ?? true)
  if (!task || !canUpdate) {
    return {
      primary: [],
      unsupported: UNSUPPORTED_ACTIONS,
      readOnlyReason: permissions.readOnlyReason || 'view_only',
    }
  }

  const primary = [
    task.displayStatus !== 'completed'
      ? {
          id: 'mark_complete',
          label: 'Mark Complete',
          status: 'completed',
          disabled: task.completionReadiness?.canComplete === false,
          reason: task.completionReadiness?.warnings?.[0] || '',
          command: buildTransferStatusActionCommand(task, 'completed'),
        }
      : null,
    task.displayStatus !== 'in_progress'
      ? { id: 'mark_in_progress', label: 'Mark In Progress', status: 'in_progress', disabled: false }
      : null,
    task.displayStatus !== 'blocked'
      ? {
          id: 'mark_blocked',
          label: 'Mark Blocked',
          status: 'blocked',
          requiresNote: true,
          disabled: false,
          command: buildTransferStatusActionCommand(task, 'blocked'),
        }
      : null,
    task.displayStatus !== 'waiting'
      ? {
          id: 'mark_waiting',
          label: 'Mark Waiting',
          status: 'waiting',
          requiresNote: true,
          disabled: false,
          command: buildTransferStatusActionCommand(task, 'waiting'),
        }
      : null,
  ].filter(Boolean)

  return {
    primary,
    unsupported: UNSUPPORTED_ACTIONS,
    readOnlyReason: '',
  }
}

function documentDisplayName(document = null, fallback = 'Required Document') {
  return text(document?.displayName || document?.label || document?.name || document?.sourceRequirementKey || document?.key || fallback)
}

function inferTaskAudience(task = {}, document = null) {
  const explicit = text(document?.requiredFrom || document?.required_from || document?.requiredParty || document?.uploadedByRole || document?.ownerLabel)
  if (explicit) return explicit
  const taskKey = key(task.key)
  if (taskKey.includes('buyer')) return 'buyer'
  if (taskKey.includes('seller')) return 'seller'
  if (taskKey.includes('guarantee') || taskKey.includes('bond')) return 'bank'
  if (taskKey.includes('rates') || taskKey.includes('levy') || taskKey.includes('clearance') || taskKey.includes('compliance')) return 'agent'
  return 'attorney'
}

function buildTransferWorkflowActionForTask(task = {}, action = {}) {
  const missingDocument =
    task.completionReadiness?.missingRequiredDocuments?.[0] ||
    (task.relatedDocuments || []).find((document) => document.missing || document.ready === false) ||
    null
  const documentName = documentDisplayName(missingDocument, task.label || 'Required Document')
  const taskLabel = text(task.label || task.key || 'Transfer task')
  const taskKey = key(task.key)
  const target = inferTaskAudience(task, missingDocument)
  const base = {
    id: `${task.key}_${action.id}`,
    laneKey: 'transfer',
    stageKey: task.key,
    relatedId: missingDocument?.id || missingDocument?.requestId || missingDocument?.sourceRequirementKey || '',
    target,
  }

  if (action.id === 'request_document') {
    return {
      ...base,
      type: 'request_document',
      label: `Request ${documentName}`,
      description: missingDocument?.reason || `Request the evidence needed for ${taskLabel}.`,
      priority: task.missingDocumentCount > 0 ? 'high' : 'medium',
    }
  }

  if (action.id === 'schedule_signing') {
    return {
      ...base,
      type: 'manage_signing',
      label: `Follow up ${taskLabel}`,
      description: `Confirm the signing appointment, signer, and transfer document pack for ${taskLabel}.`,
      priority: task.displayStatus === 'waiting' ? 'high' : 'medium',
      target: taskKey.includes('seller') ? 'seller' : taskKey.includes('buyer') ? 'buyer' : 'client',
    }
  }

  if (action.id === 'add_note') {
    return {
      ...base,
      type: task.displayStatus === 'blocked' ? 'resolve_blocker' : 'update_matter_data',
      label: task.displayStatus === 'blocked' ? `Resolve ${taskLabel} blocker` : `Capture ${taskLabel} update`,
      description: task.displayStatus === 'blocked'
        ? `Record what is blocking ${taskLabel} and the next follow-up.`
        : `Record the current outcome or data point for ${taskLabel}.`,
      priority: task.displayStatus === 'blocked' ? 'high' : 'medium',
      target: 'attorney',
    }
  }

  if (action.id === 'open_finance') {
    return {
      ...base,
      type: 'update_matter_data',
      label: `Review ${taskLabel} financials`,
      description: `Check the financial dependency and record any update needed for ${taskLabel}.`,
      priority: task.displayStatus === 'blocked' ? 'high' : 'medium',
      target: 'attorney',
    }
  }

  return null
}

function buildTransferActionCommand(task = {}, action = {}) {
  const workflowAction = buildTransferWorkflowActionForTask(task, action)
  if (!workflowAction) return { workflowAction: null, command: null }
  return {
    workflowAction,
    command: buildAttorneyWorkflowActionCommand(workflowAction, {
      laneKey: 'transfer',
      stageKey: task.key,
    }),
  }
}

function buildTransferStatusActionCommand(task = {}, status = 'completed') {
  const taskLabel = text(task.label || task.key || 'Transfer task')
  const statusKey = key(status)
  const action = statusKey === 'completed'
    ? {
        id: `${task.key}_complete_evidence`,
        type: 'complete_stage_evidence',
        label: `Complete ${taskLabel}`,
        description: (task.evidenceRequirements || []).slice(0, 2).join(' ') || `Capture completion evidence for ${taskLabel}.`,
        target: 'attorney',
        priority: 'medium',
        laneKey: 'transfer',
        stageKey: task.key,
      }
    : {
        id: `${task.key}_${statusKey}_status`,
        type: 'resolve_blocker',
        label: `${statusKey === 'blocked' ? 'Blocker' : 'Waiting'} update for ${taskLabel}`,
        description: `Record why ${taskLabel} is ${statusKey === 'blocked' ? 'blocked' : 'waiting'} and what must happen next.`,
        target: 'attorney',
        priority: statusKey === 'blocked' ? 'high' : 'medium',
        laneKey: 'transfer',
        stageKey: task.key,
      }

  return buildAttorneyWorkflowActionCommand(action, {
    laneKey: 'transfer',
    stageKey: task.key,
  })
}

export function buildTransferTaskWorkActions(task = null, permissions = {}) {
  if (!task) return []
  const canRequestDocuments = Boolean(permissions.canRequestDocuments ?? permissions.canUpdateStage ?? permissions.canUpdate ?? true)
  const canUploadDocuments = Boolean(permissions.canUploadDocuments ?? permissions.canUpdateStage ?? permissions.canUpdate ?? true)
  const canAddNote = Boolean(
    permissions.canAddInternalNote ??
      permissions.canAddSharedUpdate ??
      permissions.canPublishClientVisibleUpdate ??
      permissions.canAddNotes ??
      permissions.canUpdateStage ??
      true,
  )
  const hasDocumentRequirements = (task.requiredDocumentKeys || []).length > 0 || task.missingDocumentCount > 0
  const phaseKey = key(task.phaseKey)
  const taskKey = key(task.key)
  const actions = []

  if (hasDocumentRequirements) {
    actions.push({
      id: 'request_document',
      label: 'Request Document',
      description: 'Ask the responsible party for evidence linked to this task.',
      target: 'document_request',
      disabled: !canRequestDocuments,
      reason: canRequestDocuments ? '' : 'You do not have permission to request documents on this lane.',
      primary: task.missingDocumentCount > 0,
    })
    actions.push({
      id: 'upload_document',
      label: 'Upload Evidence',
      description: 'Upload a file against this transfer task or requirement.',
      target: 'document_upload',
      disabled: !canUploadDocuments,
      reason: canUploadDocuments ? '' : 'You do not have permission to upload documents on this lane.',
    })
    actions.push({
      id: 'open_documents',
      label: 'Open Documents',
      description: 'Review the full document register for this matter.',
      target: 'documents',
      disabled: false,
      reason: '',
    })
  }

  if (
    phaseKey === 'instruction' ||
    phaseKey === 'fica_authority' ||
    /buyer|seller|entity|authority|title|ownership|existing_bond|matter_opened/.test(taskKey)
  ) {
    actions.push({
      id: 'open_parties',
      label: 'Open Roleplayers',
      description: 'Check parties, representatives, and legal roleplayers for this task.',
      target: 'parties',
      disabled: false,
      reason: '',
    })
  }

  if (
    phaseKey === 'financial_preparation' ||
    /transfer_duty|rates|levy|clearance|compliance|guarantee/.test(taskKey)
  ) {
    actions.push({
      id: 'open_finance',
      label: 'Open Financials',
      description: 'Review transfer duty, clearances, guarantees, and finance dependencies.',
      target: 'finance',
      disabled: false,
      reason: '',
    })
  }

  if (/signing|signed/.test(taskKey)) {
    actions.push({
      id: 'open_documents',
      label: 'Open Signing Docs',
      description: 'Review or upload the signed transfer document pack.',
      target: 'documents',
      disabled: false,
      reason: '',
    })
    actions.push({
      id: 'schedule_signing',
      label: 'Schedule Signing',
      description: 'Prepare a signing follow-up with the appointment checklist.',
      target: 'signing',
      disabled: !canAddNote,
      reason: canAddNote ? '' : 'You do not have permission to add signing updates on this lane.',
      primary: task.displayStatus !== 'completed',
    })
  }

  actions.push({
    id: 'add_note',
    label: 'Add Note',
    description: 'Record context or a professional update for this task.',
    target: 'notes',
    disabled: !canAddNote,
    reason: canAddNote ? '' : 'You do not have permission to add updates on this lane.',
  })

  const seen = new Set()
  return actions.filter((action) => {
    if (!action.id || seen.has(action.id)) return false
    seen.add(action.id)
    return true
  }).map((action) => {
    const { workflowAction, command } = buildTransferActionCommand(task, action)
    return {
      ...action,
      workflowAction,
      command,
      workPacket: command?.workPacket || null,
    }
  })
}

function buildTaskOutcomeSummary(task = null) {
  if (!task) {
    return {
      label: 'No task selected',
      tone: 'waiting',
      canWorkAhead: true,
      completionBlocked: true,
      message: 'Select a transfer task to see the expected outcome.',
      items: [],
    }
  }

  const missingDocuments = task.completionReadiness?.missingRequiredDocuments || []
  const dependencyBlockers = task.dependencySummary?.blockers || []
  const completionBlocked = task.completionReadiness?.canComplete === false
  const canWorkAhead = task.dependencySummary?.blocksWork !== true
  const tone = task.displayStatus === 'blocked'
    ? 'blocked'
    : completionBlocked
      ? 'waiting'
      : task.displayStatus === 'completed'
        ? 'completed'
        : 'in_progress'
  const items = [
    {
      key: 'work_ahead',
      label: canWorkAhead ? 'Concurrent work allowed' : 'Sequence locked',
      value: canWorkAhead ? 'Work can continue before earlier tasks are closed.' : 'Earlier task completion is required first.',
      status: canWorkAhead ? 'ready' : 'blocked',
    },
    {
      key: 'completion',
      label: completionBlocked ? 'Completion evidence missing' : 'Completion evidence ready',
      value: completionBlocked
        ? `${missingDocuments.length} document${missingDocuments.length === 1 ? '' : 's'} still need evidence.`
        : 'The task can be completed from the status actions.',
      status: completionBlocked ? 'waiting' : 'ready',
    },
    dependencyBlockers.length
      ? {
          key: 'earlier_tasks',
          label: 'Earlier open tasks',
          value: `${dependencyBlockers.length} earlier task${dependencyBlockers.length === 1 ? '' : 's'} need review, but do not block work.`,
          status: 'waiting',
        }
      : null,
  ].filter(Boolean)

  return {
    label: completionBlocked ? 'Workable, not complete-ready' : 'Ready for outcome update',
    tone,
    canWorkAhead,
    completionBlocked,
    missingDocumentCount: missingDocuments.length,
    dependencyBlockerCount: dependencyBlockers.length,
    message: completionBlocked
      ? 'The attorney can keep working this task, but must capture the missing evidence before marking it complete.'
      : 'The expected evidence is present for this task.',
    items,
  }
}

function commandQueueStatusForTask(task = {}, action = {}) {
  if (task.displayStatus === 'blocked') return 'blocked'
  if (task.displayStatus === 'waiting') return 'waiting'
  if (action.id === 'request_document' && task.missingDocumentCount > 0) return 'missing_documents'
  if (action.id === 'schedule_signing') return 'signing'
  if (action.id === 'complete_evidence') return 'complete_ready'
  return 'open'
}

function rankCommandQueueItem(item = {}) {
  const statusOrder = {
    needs_correction: 0,
    overdue: 1,
    blocked: 2,
    due_today: 3,
    review_pending: 4,
    due_soon: 5,
    missing_documents: 6,
    waiting: 7,
    urgent: 8,
    signing: 9,
    complete_ready: 10,
    open: 11,
    unscheduled: 12,
  }
  const kindOrder = {
    document: 0,
    signing: 1,
    evidence: 2,
    finance: 3,
    note: 4,
    workflow: 5,
  }
  return (statusOrder[item.status] ?? 9) * 10 + (kindOrder[item.kind] ?? 9)
}

function selectCommandQueueItems(sorted = [], limit = 12) {
  const selected = []
  const selectedIds = new Set()

  function add(item = null) {
    if (!item?.id || selectedIds.has(item.id) || selected.length >= limit) return
    selectedIds.add(item.id)
    selected.push(item)
  }

  sorted.slice(0, Math.min(8, limit)).forEach(add)
  add(sorted.find((item) => item.source === 'lane_follow_up'))
  ;['document', 'signing', 'evidence', 'note'].forEach((kind) => {
    add(sorted.find((item) => item.kind === kind))
  })
  sorted.forEach(add)

  return selected.sort((left, right) => rankCommandQueueItem(left) - rankCommandQueueItem(right))
}

function buildTransferCommandQueue({ tasks = [], workActionsByTaskKey = {}, laneFollowUpSummary = null } = {}) {
  const items = []
  const seen = new Set()

  function add(item = null) {
    if (!item?.id || seen.has(item.id)) return
    seen.add(item.id)
    items.push(item)
  }

  const laneFollowUps = Array.isArray(laneFollowUpSummary?.items) ? laneFollowUpSummary.items : []
  laneFollowUps.forEach((followUp) => {
    const command = buildAttorneyWorkflowFollowUpCommand(followUp, {
      laneKey: followUp.laneKey || 'transfer',
      stageKey: followUp.stageKey || '',
    })
    add({
      id: `lane_follow_up:${followUp.id}`,
      source: 'lane_follow_up',
      kind: followUp.commandType === 'schedule_signing' ? 'signing' : followUp.commandType === 'request_document' ? 'document' : 'workflow',
      status: followUp.status || 'open',
      title: followUp.title || 'Workflow follow-up',
      description: followUp.description || followUp.statusLabel || '',
      phaseKey: '',
      phaseLabel: '',
      taskKey: followUp.stageKey || '',
      taskLabel: followUp.stageLabel || '',
      audienceLabel: followUp.audienceLabel || '',
      priority: followUp.priority || 'required',
      dueDate: followUp.dueDate || '',
      workPacket: command.workPacket || null,
      command,
      workflowAction: {
        id: command.actionId || followUp.id || '',
        type: command.actionType || 'review_workflow',
        label: followUp.title || command.workPacket?.title || command.label,
        description: followUp.description || command.description,
        laneKey: followUp.laneKey || 'transfer',
        stageKey: followUp.stageKey || command.stageKey || '',
        target: followUp.audience || command.workPacket?.audience || 'attorney',
        priority: followUp.priority === 'urgent' ? 'high' : followUp.priority === 'optional' ? 'low' : 'medium',
        relatedId: followUp.relatedId || command.relatedId || '',
      },
      followUp,
    })
  })

  tasks
    .filter((task) => task.displayStatus !== 'completed')
    .forEach((task) => {
      const actions = workActionsByTaskKey[task.key] || []
      const requestAction = actions.find((action) => action.id === 'request_document' && task.missingDocumentCount > 0 && action.command)
      if (requestAction) {
        add({
          id: `task:${task.key}:request_document`,
          source: 'task_action',
          kind: 'document',
          status: commandQueueStatusForTask(task, requestAction),
          title: requestAction.command?.workPacket?.title || requestAction.workflowAction?.label || requestAction.label,
          description: requestAction.workflowAction?.description || requestAction.description || task.description,
          phaseKey: task.phaseKey,
          phaseLabel: task.phaseLabel,
          taskKey: task.key,
          taskLabel: task.label,
          audienceLabel: requestAction.command?.workPacket?.audienceLabel || '',
          priority: requestAction.command?.workPacket?.priority || 'required',
          dueDate: requestAction.command?.workPacket?.dueDate || '',
          workPacket: requestAction.workPacket || null,
          command: requestAction.command,
          workflowAction: requestAction.workflowAction,
          action: requestAction,
        })
      }

      if (task.displayStatus === 'blocked' || task.displayStatus === 'waiting') {
        const noteAction = actions.find((action) => action.id === 'add_note' && action.command)
        if (noteAction) {
          add({
            id: `task:${task.key}:status_note`,
            source: 'task_action',
            kind: 'note',
            status: commandQueueStatusForTask(task, noteAction),
            title: noteAction.command?.workPacket?.title || noteAction.workflowAction?.label || noteAction.label,
            description: noteAction.workflowAction?.description || noteAction.description || task.comment || task.description,
            phaseKey: task.phaseKey,
            phaseLabel: task.phaseLabel,
            taskKey: task.key,
            taskLabel: task.label,
            audienceLabel: noteAction.command?.workPacket?.audienceLabel || '',
            priority: noteAction.command?.workPacket?.priority || (task.displayStatus === 'blocked' ? 'urgent' : 'required'),
            dueDate: noteAction.command?.workPacket?.dueDate || '',
            workPacket: noteAction.workPacket || null,
            command: noteAction.command,
            workflowAction: noteAction.workflowAction,
            action: noteAction,
          })
        }
      }

      const signingAction = actions.find((action) => action.id === 'schedule_signing' && action.command)
      if (signingAction) {
        add({
          id: `task:${task.key}:schedule_signing`,
          source: 'task_action',
          kind: 'signing',
          status: commandQueueStatusForTask(task, signingAction),
          title: signingAction.command?.workPacket?.title || signingAction.workflowAction?.label || signingAction.label,
          description: signingAction.workflowAction?.description || signingAction.description || task.description,
          phaseKey: task.phaseKey,
          phaseLabel: task.phaseLabel,
          taskKey: task.key,
          taskLabel: task.label,
          audienceLabel: signingAction.command?.workPacket?.audienceLabel || '',
          priority: signingAction.command?.workPacket?.priority || 'required',
          dueDate: signingAction.command?.workPacket?.dueDate || '',
          workPacket: signingAction.workPacket || null,
          command: signingAction.command,
          workflowAction: signingAction.workflowAction,
          action: signingAction,
        })
      }

      if (task.completionReadiness?.canComplete && task.displayStatus !== 'completed') {
        const command = buildTransferStatusActionCommand(task, 'completed')
        add({
          id: `task:${task.key}:complete_evidence`,
          source: 'status_action',
          kind: 'evidence',
          status: 'complete_ready',
          title: command.workPacket?.title || `Complete ${task.label}`,
          description: command.description || `Capture completion evidence for ${task.label}.`,
          phaseKey: task.phaseKey,
          phaseLabel: task.phaseLabel,
          taskKey: task.key,
          taskLabel: task.label,
          audienceLabel: command.workPacket?.audienceLabel || '',
          priority: command.workPacket?.priority || 'required',
          dueDate: command.workPacket?.dueDate || '',
          workPacket: command.workPacket || null,
          command,
          workflowAction: {
            id: `${task.key}_complete_evidence`,
            type: 'complete_stage_evidence',
            label: `Complete ${task.label}`,
            laneKey: 'transfer',
            stageKey: task.key,
            target: 'attorney',
            priority: 'medium',
          },
          action: { id: 'complete_evidence', label: 'Complete Evidence', command },
        })
      }
    })

  const sorted = items.sort((left, right) => rankCommandQueueItem(left) - rankCommandQueueItem(right))
  const visibleItems = selectCommandQueueItems(sorted, 12)
  const counts = sorted.reduce((accumulator, item) => {
    accumulator.total += 1
    if (item.kind === 'document') accumulator.documents += 1
    if (item.kind === 'signing') accumulator.signing += 1
    if (item.kind === 'evidence') accumulator.evidence += 1
    if (item.status === 'needs_correction') accumulator.needsCorrection += 1
    if (item.status === 'overdue') accumulator.overdue += 1
    if (item.status === 'due_today') accumulator.dueToday += 1
    if (item.status === 'due_soon') accumulator.dueSoon += 1
    if (item.status === 'review_pending') accumulator.reviewPending += 1
    if (item.status === 'blocked') accumulator.blocked += 1
    if (item.status === 'waiting') accumulator.waiting += 1
    if (item.status === 'missing_documents') accumulator.missingDocuments += 1
    if (item.priority === 'urgent') accumulator.urgent += 1
    if (['buyer', 'seller', 'client'].includes(key(item.workPacket?.audience || item.followUp?.audience))) accumulator.clientFacing += 1
    if (['bank', 'agent', 'attorney'].includes(key(item.workPacket?.audience || item.followUp?.audience))) accumulator.professionalFacing += 1
    if (item.source === 'lane_follow_up') accumulator.persistedFollowUps += 1
    return accumulator
  }, {
    total: 0,
    documents: 0,
    signing: 0,
    evidence: 0,
    needsCorrection: 0,
    overdue: 0,
    dueToday: 0,
    dueSoon: 0,
    reviewPending: 0,
    blocked: 0,
    waiting: 0,
    missingDocuments: 0,
    urgent: 0,
    clientFacing: 0,
    professionalFacing: 0,
    persistedFollowUps: 0,
  })

  const health = counts.needsCorrection || counts.overdue || counts.blocked
    ? 'blocked'
    : counts.dueToday || counts.dueSoon || counts.reviewPending || counts.missingDocuments || counts.waiting || counts.urgent
      ? 'attention'
      : counts.total
        ? 'open'
        : 'clear'

  return {
    laneKey: 'transfer',
    health,
    counts,
    primaryItem: sorted[0] || null,
    items: visibleItems,
  }
}

function buildTransferRolloutReadiness({ tasks = [], workActionsByTaskKey = {}, availableActions = {}, permissions = {}, commandQueue = null, scenario = null } = {}) {
  const workActionRows = Object.entries(workActionsByTaskKey || {}).flatMap(([taskKey, actions]) => (
    (Array.isArray(actions) ? actions : []).map((action) => ({
      ...action,
      taskKey,
      executionMode: TRANSFER_ROLLOUT_ACTION_MODES[action.id] || 'workspace_callback',
    }))
  ))
  const taskStatusActionRows = tasks.flatMap((task) => (
    buildAvailableActions(task, permissions).primary.map((action) => ({
      ...action,
      taskKey: task.key,
      executionMode: TRANSFER_ROLLOUT_ACTION_MODES[action.id] || 'status_update',
    }))
  ))
  const selectedStatusActionRows = (Array.isArray(availableActions?.primary) ? availableActions.primary : []).map((action) => ({
    ...action,
    taskKey: 'selected_task',
    executionMode: TRANSFER_ROLLOUT_ACTION_MODES[action.id] || 'status_update',
  }))
  const statusActionRows = taskStatusActionRows.length ? taskStatusActionRows : selectedStatusActionRows
  const presentWorkActionIds = new Set(workActionRows.map((action) => action.id).filter(Boolean))
  const presentStatusActionIds = new Set(statusActionRows.map((action) => action.id).filter(Boolean))
  const missingWorkActions = TRANSFER_ROLLOUT_REQUIRED_WORK_ACTIONS.filter((actionId) => !presentWorkActionIds.has(actionId))
  const missingStatusActions = TRANSFER_ROLLOUT_REQUIRED_STATUS_ACTIONS.filter((actionId) => !presentStatusActionIds.has(actionId))
  const workActionsWithoutExecution = workActionRows.filter((action) => {
    if (action.disabled) return false
    if (action.executionMode === 'command') return !action.command || !action.workflowAction
    return !action.target
  })
  const statusActionsWithoutExecution = statusActionRows.filter((action) => {
    if (action.disabled) return false
    if (action.executionMode === 'status_update') return !action.status
    return false
  })
  const blockedBySequence = tasks.filter((task) => task.dependencySummary?.blocksWork === true)
  const evidenceControlledTasks = tasks.filter((task) => task.relatedDocuments?.length || task.requiredDocumentKeys?.length)
  const completionBlockedTasks = tasks.filter((task) => task.completionReadiness?.canComplete === false)
  const completeReadyTasks = tasks.filter((task) => task.completionReadiness?.canComplete === true && task.displayStatus !== 'completed')
  const coverageItems = Array.isArray(scenario?.coverageItems) ? scenario.coverageItems : []
  const scenarioAttentionItems = coverageItems.filter((item) => item.status === 'attention')
  const blockers = [
    ...missingWorkActions.map((actionId) => `Missing work action: ${actionId}`),
    ...missingStatusActions.map((actionId) => `Missing status action: ${actionId}`),
    ...workActionsWithoutExecution.map((action) => `No execution route for ${action.id} on ${action.taskKey}`),
    ...statusActionsWithoutExecution.map((action) => `No status route for ${action.id}`),
    ...blockedBySequence.map((task) => `Sequence lock still active on ${task.key}`),
  ]
  const warnings = [
    ...scenarioAttentionItems.map((item) => `${item.label}: ${item.value}`),
    commandQueue?.counts?.total ? '' : 'Command queue has no open work items for the current matter state.',
  ].filter(Boolean)

  return {
    status: blockers.length ? 'blocked' : warnings.length ? 'attention' : 'ready',
    blockers,
    warnings,
    actionAudit: {
      requiredWorkActions: TRANSFER_ROLLOUT_REQUIRED_WORK_ACTIONS,
      requiredStatusActions: TRANSFER_ROLLOUT_REQUIRED_STATUS_ACTIONS,
      presentWorkActions: [...presentWorkActionIds],
      presentStatusActions: [...presentStatusActionIds],
      missingWorkActions,
      missingStatusActions,
      executableWorkActions: workActionRows.filter((action) => !action.disabled && (action.executionMode === 'command' ? action.command && action.workflowAction : action.target)).length,
      executableStatusActions: statusActionRows.filter((action) => !action.disabled && action.status).length,
      commandBackedWorkActions: workActionRows.filter((action) => action.executionMode === 'command' && action.command && action.workflowAction).map((action) => action.id),
      callbackBackedWorkActions: workActionRows.filter((action) => action.executionMode === 'workspace_callback' && action.target).map((action) => action.id),
      statusUpdateActions: statusActionRows.filter((action) => action.status).map((action) => action.id),
    },
    workflowProof: {
      concurrentWorkAllowed: blockedBySequence.length === 0,
      sequenceLockCount: blockedBySequence.length,
      evidenceControlledTaskCount: evidenceControlledTasks.length,
      completionBlockedTaskCount: completionBlockedTasks.length,
      completeReadyTaskCount: completeReadyTasks.length,
      commandQueueItemCount: commandQueue?.counts?.total || commandQueue?.items?.length || 0,
    },
    scenarioProof: {
      coverageItemCount: coverageItems.length,
      attentionItemCount: scenarioAttentionItems.length,
      buyerEntityType: scenario?.buyer?.entityType || 'unknown',
      buyerMaritalRegime: scenario?.buyer?.maritalRegime || '',
      sellerEntityType: scenario?.seller?.entityType || 'unknown',
      sellerMaritalRegime: scenario?.seller?.maritalRegime || '',
      financeType: scenario?.finance?.type || 'unknown',
      requiresGuarantees: Boolean(scenario?.finance?.requiresGuarantees),
      requiresCancellation: Boolean(scenario?.cancellation?.required),
    },
    uatChecklist: [
      'Open the authority task and confirm party capacity requirements.',
      'Run a missing-document command from the lane command queue.',
      'Upload or review evidence on a document-backed task.',
      'Move an out-of-sequence task to waiting or blocked without closing earlier work.',
      'Confirm a task cannot be completed until required evidence is ready.',
      'Schedule buyer or seller signing from a signing task.',
      'Confirm finance and cancellation routing match the matter facts.',
    ],
  }
}

export function buildTransferWorkspaceViewModel({
  workflow = null,
  workflowKey = 'transfer',
  documents = [],
  keyDates = [],
  parties = [],
  activityFeed = [],
  selectedTaskKey = '',
  filters = {},
  search = '',
  now = new Date(),
} = {}) {
  const lane = workflow?.lane || null
  const permissions = lane?.permissions || {}
  const scenario = buildTransferScenarioProfile({ workflow, lane, facts: workflow?.facts || {} })
  const tasks = buildWorkflowTasks({ workflowKey, lane, workflow, documents, scenario }).map((task) => {
    const relatedDocuments = task.derivedCompletion?.relatedDocuments?.length
      ? task.derivedCompletion.relatedDocuments
      : buildRelatedDocuments(task, lane, documents)
    const taskWithDocuments = {
      ...task,
      relatedDocuments,
      missingDocumentCount: relatedDocuments.filter((document) => document.missing || document.ready === false).length,
      isOverdue: isTaskOverdue(task, now),
      isDueThisWeek: isTaskDueWithin(task, 7, now),
    }
    return {
      ...taskWithDocuments,
      completionReadiness: buildCompletionReadiness(taskWithDocuments),
    }
  }).map((task, index, allTasks) => ({
    ...task,
    dependencySummary: buildDependencySummary(allTasks, task),
  }))
  const phases = buildPhases(tasks)
  const selectedTask = resolveSelectedTask(tasks, selectedTaskKey)
  const visibleTasks = filterTasks(tasks, { ...filters, search })
  const completed = tasks.filter((task) => task.displayStatus === 'completed').length
  const total = tasks.length
  const currentPhase = phases.find((phase) => phase.tasks.some((task) => task.key === selectedTask?.key)) || phases.find((phase) => phase.status === 'in_progress') || phases[0] || null
  const selectedRelatedDocuments = selectedTask ? selectedTask.relatedDocuments : []
  const selectedChecklistItems = buildChecklistItems(selectedTask)
  const selectedActivityFeed = Array.isArray(activityFeed)
    ? activityFeed.filter((entry) => {
        const haystack = key([
          entry?.stepKey,
          entry?.step_key,
          entry?.title,
          entry?.body,
          entry?.message,
          ...(entry?.filterKeys || []),
        ].join(' '))
        return !selectedTask || haystack.includes(selectedTask.key) || haystack.includes(lane?.laneKey || workflowKey)
      })
    : []
  const selectedNotes = buildTaskNotes(selectedActivityFeed)
  const selectedKeyDates = normalizeKeyDateRows(keyDates)
  const selectedParties = normalizePartyRows({ parties, workflow, selectedTask })
  const selectedDocumentSummary = buildDocumentSummary(selectedRelatedDocuments)
  const selectedOutcomeSummary = buildTaskOutcomeSummary(selectedTask)
  const workActionsByTaskKey = Object.fromEntries(
    tasks.map((task) => [task.key, buildTransferTaskWorkActions(task, permissions)]),
  )
  const commandQueue = buildTransferCommandQueue({
    tasks,
    workActionsByTaskKey,
    laneFollowUpSummary: lane?.followUpSummary,
  })
  const selectedWorkActions = selectedTask ? workActionsByTaskKey[selectedTask.key] || [] : []
  const selectedTabs = buildTaskTabs({
    checklistItems: selectedChecklistItems,
    relatedDocuments: selectedRelatedDocuments,
    notes: selectedNotes,
    activityFeed: selectedActivityFeed,
    canAddNotes: Boolean(permissions.canAddNotes ?? permissions.canUpdateStage ?? true),
  })
  const selectedTaskIndex = tasks.findIndex((task) => task.key === selectedTask?.key)
  const nextActionableTask = selectedTaskIndex >= 0
    ? tasks.slice(selectedTaskIndex + 1).find((task) => task.displayStatus !== 'completed') || null
    : null
  const availableActions = buildAvailableActions(selectedTask, permissions)
  const rolloutReadiness = buildTransferRolloutReadiness({
    tasks,
    workActionsByTaskKey,
    availableActions,
    permissions,
    commandQueue,
    scenario,
  })

  return {
    workflowKey,
    laneKey: lane?.laneKey || workflowKey,
    title: workflow?.title || 'Transfer Progress',
    statusLabel: workflow?.statusLabel || '',
    tasks,
    visibleTasks,
    phases,
    scenario,
    selectedTask,
    nextActionableTask,
    currentPhase,
    progress: {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      label: `${completed} / ${total} tasks completed`,
    },
    attention: {
      blocked: tasks.filter((task) => task.displayStatus === 'blocked').length,
      overdue: tasks.filter((task) => task.isOverdue).length,
      dueThisWeek: tasks.filter((task) => task.isDueThisWeek).length,
      missingDocuments: tasks.filter((task) => task.missingDocumentCount > 0).length,
    },
    selectedTaskContext: {
      relatedDocuments: selectedRelatedDocuments,
      documentSummary: selectedDocumentSummary,
      checklistItems: selectedChecklistItems,
      keyDates: selectedKeyDates,
      parties: selectedParties,
      notes: selectedNotes,
      activityFeed: selectedActivityFeed,
      tabs: selectedTabs,
      workActions: selectedWorkActions,
      outcomeSummary: selectedOutcomeSummary,
      scenarioRequirements: selectedTask?.scenarioRequirements || null,
    },
    permissions,
    availableActions,
    workActionsByTaskKey,
    commandQueue,
    rolloutReadiness,
    unsupportedCapabilities: {
      delayedStatus: true,
      notApplicableStatus: true,
      editableTaskAssignee: true,
      editableTaskDueDate: true,
      persistedChecklistItems: true,
      hardTaskDocumentLinks: true,
    },
  }
}
