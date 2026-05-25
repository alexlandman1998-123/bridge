import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  REQUIREMENT_LEVELS,
  REQUIREMENT_STATUSES,
  WORKFLOW_GATES,
  getRequirementSatisfactionState,
  isRequirementSatisfied,
} from './canonicalDocumentResolverService'
import { isRequirementExpired } from './canonicalDocumentLifecycleService'

export const CANONICAL_WORKFLOW_GATES_FLAG = 'VITE_CANONICAL_WORKFLOW_GATES_ENABLED'
export const CANONICAL_WORKFLOW_GATE_WARNINGS_FLAG = 'VITE_CANONICAL_WORKFLOW_GATE_WARNINGS_ENABLED'
export const CANONICAL_WORKFLOW_GATE_HARD_BLOCKS_FLAG = 'VITE_CANONICAL_WORKFLOW_GATE_HARD_BLOCKS_ENABLED'
export const CANONICAL_WORKFLOW_GATE_SOURCE = 'canonical_workflow_gate_service'

export const GATE_ENFORCEMENT_MODES = Object.freeze({
  off: 'off',
  warning: 'warning',
  hardBlock: 'hard_block',
})

export const GATE_STATUSES = Object.freeze({
  blocked: 'blocked',
  warning: 'warning',
  ready: 'ready',
  notApplicable: 'not_applicable',
})

export const CANONICAL_GATE_EVENT_TYPES = Object.freeze({
  evaluated: 'gate_evaluated',
  warningShown: 'gate_warning_shown',
  blocked: 'gate_blocked',
  overrideUsed: 'gate_override_used',
  passed: 'gate_passed',
})

export const CANONICAL_WORKFLOW_GATES = Object.freeze({
  mandateReady: 'mandate_ready',
  listingReady: 'listing_ready',
  otpReady: 'otp_ready',
  attorneyInstructionReady: 'attorney_instruction_ready',
  financeReady: 'finance_ready',
  lodgementReady: 'lodgement_ready',
  registrationReady: 'registration_ready',
  handoverReady: 'handover_ready',
})

export const CANONICAL_GATE_DEFINITIONS = Object.freeze({
  mandate_ready: {
    displayLabel: 'Mandate Ready',
    explanation: 'Seller authority, FICA and mandate documents are ready enough for mandate reliance or signing.',
    typicalPacks: ['seller_identity_fica', 'seller_authority', 'attorney_generated_documents'],
  },
  listing_ready: {
    displayLabel: 'Listing Ready',
    explanation: 'The property can be listed with enough seller, authority, ownership, marketing and occupancy confidence.',
    typicalPacks: ['seller_identity_fica', 'seller_authority', 'property_ownership', 'marketing_assets', 'tenant_occupancy'],
  },
  otp_ready: {
    displayLabel: 'OTP Ready',
    explanation: 'Enough buyer, seller, property and finance information exists to proceed with the offer workflow.',
    typicalPacks: ['seller_authority', 'property_ownership', 'property_compliance', 'buyer_identity_fica', 'buyer_finance', 'tenant_occupancy'],
  },
  attorney_instruction_ready: {
    displayLabel: 'Attorney Instruction Ready',
    explanation: 'The transfer attorney can be instructed with a clean transaction document pack.',
    typicalPacks: ['attorney_transfer_readiness', 'seller_identity_fica', 'buyer_identity_fica', 'property_ownership', 'property_finance_existing_bond', 'sectional_title_body_corporate', 'estate_hoa', 'tenant_occupancy'],
  },
  finance_ready: {
    displayLabel: 'Finance Ready',
    explanation: 'The buyer finance route is ready or progressing with the required supporting finance documents.',
    typicalPacks: ['buyer_finance', 'bond_originator'],
  },
  lodgement_ready: {
    displayLabel: 'Lodgement Ready',
    explanation: 'Compliance, clearance, guarantees and transfer documents are ready or close to ready for lodgement.',
    typicalPacks: ['property_compliance', 'sectional_title_body_corporate', 'estate_hoa', 'attorney_transfer_readiness'],
  },
  registration_ready: {
    displayLabel: 'Registration Ready',
    explanation: 'Final registration dependencies are satisfied or waived.',
    typicalPacks: ['property_compliance', 'attorney_transfer_readiness'],
  },
  handover_ready: {
    displayLabel: 'Handover Ready',
    explanation: 'Occupation, handover and final signed document requirements are satisfied.',
    typicalPacks: ['tenant_occupancy', 'attorney_transfer_readiness', 'attorney_generated_documents'],
  },
})

export const DEFAULT_STAGE_GATE_MAPPING = Object.freeze({
  publish_listing: 'listing_ready',
  listing_publish: 'listing_ready',
  published: 'listing_ready',
  active: 'listing_ready',
  active_listing: 'listing_ready',
  mandate_sent: 'mandate_ready',
  mandate_ready: 'mandate_ready',
  mandate_complete: 'mandate_ready',
  mandate_completed: 'mandate_ready',
  mandate_signed: 'mandate_ready',
  otp: 'otp_ready',
  offer: 'otp_ready',
  offer_draft: 'otp_ready',
  offer_submitted: 'otp_ready',
  offer_accepted: 'otp_ready',
  attorney_instruction: 'attorney_instruction_ready',
  attorney_instruction_ready: 'attorney_instruction_ready',
  transfer_instruction: 'attorney_instruction_ready',
  transfer: 'attorney_instruction_ready',
  finance: 'finance_ready',
  bond: 'finance_ready',
  bond_approval: 'finance_ready',
  finance_ready: 'finance_ready',
  bond_instruction_received: 'finance_ready',
  bank_requirements_confirmed: 'finance_ready',
  bond_documents_prepared: 'finance_ready',
  buyer_signed_bond_documents: 'finance_ready',
  guarantees_issued: 'finance_ready',
  lodgement: 'lodgement_ready',
  lodged: 'lodgement_ready',
  lodgement_submitted: 'lodgement_ready',
  pre_lodgement: 'lodgement_ready',
  lodgement_ready: 'lodgement_ready',
  bond_lodgement_ready: 'lodgement_ready',
  bond_lodged: 'lodgement_ready',
  cancellation_lodged: 'lodgement_ready',
  registration: 'registration_ready',
  registered: 'registration_ready',
  registration_confirmed: 'registration_ready',
  bond_registered: 'registration_ready',
  cancellation_registered: 'registration_ready',
  handover: 'handover_ready',
  occupation: 'handover_ready',
  handover_ready: 'handover_ready',
})

const PROVISIONAL_STATUSES = new Set([
  REQUIREMENT_STATUSES.uploaded,
  REQUIREMENT_STATUSES.underReview,
])

const PROBLEM_STATUSES = new Set([
  REQUIREMENT_STATUSES.pending,
  REQUIREMENT_STATUSES.requested,
  REQUIREMENT_STATUSES.rejected,
  REQUIREMENT_STATUSES.expired,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

function isTruthyFlag(value, fallback = false) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return fallback
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(text)) return true
  if (['0', 'false', 'no', 'off', 'disabled'].includes(text)) return false
  return fallback
}

function getEnvFlag(name) {
  try {
    return import.meta.env?.[name]
  } catch {
    return undefined
  }
}

function requireClient(client = supabase) {
  if (!client || !isSupabaseConfigured) throw new Error('Supabase is required for canonical workflow gate evaluation.')
  return client
}

function normalizeUuid(value) {
  const normalized = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null
}

export function areCanonicalWorkflowGatesEnabled(options = {}) {
  if (typeof options.enabled === 'boolean') return options.enabled
  if (typeof options.force === 'boolean' && options.force) return true
  return isTruthyFlag(getEnvFlag(CANONICAL_WORKFLOW_GATES_FLAG), true)
}

export function areCanonicalWorkflowGateWarningsEnabled(options = {}) {
  if (typeof options.warningsEnabled === 'boolean') return options.warningsEnabled
  return isTruthyFlag(getEnvFlag(CANONICAL_WORKFLOW_GATE_WARNINGS_FLAG), false)
}

export function areCanonicalWorkflowGateHardBlocksEnabled(options = {}) {
  if (typeof options.hardBlocksEnabled === 'boolean') return options.hardBlocksEnabled
  return isTruthyFlag(getEnvFlag(CANONICAL_WORKFLOW_GATE_HARD_BLOCKS_FLAG), false)
}

export function resolveGateEnforcementMode(options = {}) {
  if (options.enforcementMode && Object.values(GATE_ENFORCEMENT_MODES).includes(options.enforcementMode)) return options.enforcementMode
  if (areCanonicalWorkflowGateHardBlocksEnabled(options)) return GATE_ENFORCEMENT_MODES.hardBlock
  if (areCanonicalWorkflowGateWarningsEnabled(options)) return GATE_ENFORCEMENT_MODES.warning
  return GATE_ENFORCEMENT_MODES.off
}

export function getGateDefinition(gateKey = '') {
  const gate = normalizeKey(gateKey)
  return CANONICAL_GATE_DEFINITIONS[gate] || {
    displayLabel: gate ? gate.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Workflow Gate',
    explanation: 'Canonical document readiness for this workflow gate.',
    typicalPacks: [],
  }
}

export function mapWorkflowStageToCanonicalGate(stage = '', mapping = DEFAULT_STAGE_GATE_MAPPING) {
  const key = normalizeKey(stage)
  return mapping[key] || ''
}

function getDefinition(requirement = {}) {
  return requirement.document_definitions || requirement.document_definition || requirement.definition || {}
}

function getRequirementLabel(requirement = {}) {
  const definition = getDefinition(requirement)
  return normalizeText(definition.display_label || requirement.display_label || requirement.document_label || requirement.document_definition_key) || 'Document'
}

function requirementAppliesToGate(requirement = {}, gateKey = '') {
  const gate = normalizeKey(gateKey)
  if (!gate) return false
  if (normalizeKey(requirement.status) === REQUIREMENT_STATUSES.notApplicable) return false
  return normalizeArray(requirement.stage_gates || requirement.stageGates).map(normalizeKey).includes(gate)
}

function normalizeRequirementForGate(requirement = {}, gateKey = '', now = new Date()) {
  const expired = isRequirementExpired(requirement, now)
  const status = expired && isRequirementSatisfied(requirement) ? REQUIREMENT_STATUSES.expired : normalizeKey(requirement.status || REQUIREMENT_STATUSES.pending)
  const reviewRequired = Boolean(getDefinition(requirement).review_required)
  const state = getRequirementSatisfactionState({ ...requirement, status })
  const problem = PROBLEM_STATUSES.has(status)
  const provisional = PROVISIONAL_STATUSES.has(status)
  const blocker = requirement.requirement_level === REQUIREMENT_LEVELS.blocker
  const blocks = blocker && (
    problem ||
    expired ||
    (status === REQUIREMENT_STATUSES.underReview && reviewRequired)
  )

  return {
    id: requirement.id || null,
    document_definition_key: requirement.document_definition_key || '',
    display_label: getRequirementLabel(requirement),
    pack_key: requirement.pack_key || getDefinition(requirement).pack_key || '',
    requirement_level: requirement.requirement_level || REQUIREMENT_LEVELS.required,
    status,
    raw_status: requirement.status || null,
    stage_gates: normalizeArray(requirement.stage_gates || requirement.stageGates),
    expiry_date: requirement.expiry_date || null,
    review_required: reviewRequired,
    reviewer_role: requirement.reviewer_role || null,
    rejection_reason: requirement.rejection_reason || null,
    waiver_reason: requirement.waiver_reason || null,
    satisfaction_state: expired ? 'blocking' : state,
    expired,
    provisional,
    satisfied: !expired && isRequirementSatisfied({ ...requirement, status }),
    blocks_gate: blocks,
    gate_key: normalizeKey(gateKey),
  }
}

function gateExplanation(gateKey, status, counts = {}) {
  const definition = getGateDefinition(gateKey)
  if (status === GATE_STATUSES.notApplicable) return `No active canonical document requirements currently apply to ${definition.displayLabel}.`
  if (status === GATE_STATUSES.blocked) return `${definition.displayLabel} is blocked by ${counts.blockerCount} unresolved blocker document${counts.blockerCount === 1 ? '' : 's'}.`
  if (status === GATE_STATUSES.warning) return `${definition.displayLabel} has no missing blockers, but some required or recommended documents still need completion or review.`
  return `${definition.displayLabel} has no unresolved blocker documents.`
}

export function evaluateGateReadinessFromRequirements(requirements = [], gateKey = '', options = {}) {
  const gate = normalizeKey(gateKey)
  if (!WORKFLOW_GATES.includes(gate)) throw new Error(`Unsupported canonical workflow gate "${gateKey}".`)
  const enforcementMode = resolveGateEnforcementMode(options)
  const scoped = requirements
    .filter((requirement) => requirementAppliesToGate(requirement, gate))
    .map((requirement) => normalizeRequirementForGate(requirement, gate, options.now || new Date()))

  const active = scoped.filter((item) => item.status !== REQUIREMENT_STATUSES.notApplicable)
  const blockers = active.filter((item) => item.blocks_gate)
  const missingRequired = active.filter((item) =>
    [REQUIREMENT_LEVELS.blocker, REQUIREMENT_LEVELS.required].includes(item.requirement_level) &&
    !item.satisfied &&
    !item.provisional &&
    !item.blocks_gate
  )
  const provisionallySatisfied = active.filter((item) => item.provisional)
  const approved = active.filter((item) => item.status === REQUIREMENT_STATUSES.approved || item.status === REQUIREMENT_STATUSES.completed)
  const waived = active.filter((item) => item.status === REQUIREMENT_STATUSES.waived)
  const expired = active.filter((item) => item.expired || item.status === REQUIREMENT_STATUSES.expired)
  const incompleteNonBlockers = active.filter((item) =>
    !item.blocks_gate &&
    !item.satisfied &&
    [REQUIREMENT_LEVELS.blocker, REQUIREMENT_LEVELS.required, REQUIREMENT_LEVELS.recommended].includes(item.requirement_level) &&
    (item.provisional || [REQUIREMENT_LEVELS.required, REQUIREMENT_LEVELS.recommended].includes(item.requirement_level))
  )
  const satisfiedCount = active.filter((item) => item.satisfied).length
  const provisionalCount = provisionallySatisfied.length
  const readinessPercentage = active.length ? Math.round(((satisfiedCount + provisionalCount) / active.length) * 100) : 100

  let status = GATE_STATUSES.ready
  if (!active.length) status = GATE_STATUSES.notApplicable
  else if (blockers.length) status = GATE_STATUSES.blocked
  else if (incompleteNonBlockers.length) status = GATE_STATUSES.warning

  const definition = getGateDefinition(gate)
  const affectedPacks = [...new Set(active.map((item) => item.pack_key).filter(Boolean))].sort()
  const canAdvance = enforcementMode !== GATE_ENFORCEMENT_MODES.hardBlock || blockers.length === 0

  return {
    gate_key: gate,
    gate,
    display_label: definition.displayLabel,
    label: definition.displayLabel,
    readiness_percentage: readinessPercentage,
    percentReady: readinessPercentage,
    status,
    blocker_count: blockers.length,
    blockingCount: blockers.length,
    missing_required_count: missingRequired.length,
    provisionally_satisfied_count: provisionallySatisfied.length,
    approved_count: approved.length,
    waived_count: waived.length,
    expired_count: expired.length,
    total_count: active.length,
    totalCount: active.length,
    satisfiedCount,
    missingCount: active.filter((item) => !item.satisfied && !item.provisional).length,
    blockers,
    missing_required: missingRequired,
    missingRequired,
    provisionally_satisfied: provisionallySatisfied,
    provisionallySatisfied,
    expired,
    waived,
    affected_packs: affectedPacks,
    affectedPacks,
    explanation: gateExplanation(gate, status, { blockerCount: blockers.length }),
    ready: status !== GATE_STATUSES.blocked && status !== GATE_STATUSES.notApplicable,
    can_advance: canAdvance,
    canAdvance,
    enforcement_mode: enforcementMode,
    enforcementMode,
    typical_packs: definition.typicalPacks,
  }
}

export function evaluateAllGateReadinessFromRequirements(requirements = [], options = {}) {
  return WORKFLOW_GATES.map((gate) => evaluateGateReadinessFromRequirements(requirements, gate, options))
}

export function getGateStatusSummaryFromRequirements(requirements = [], options = {}) {
  const gates = evaluateAllGateReadinessFromRequirements(requirements, options)
  return {
    gates,
    blocked: gates.filter((gate) => gate.status === GATE_STATUSES.blocked),
    warnings: gates.filter((gate) => gate.status === GATE_STATUSES.warning),
    ready: gates.filter((gate) => gate.status === GATE_STATUSES.ready),
    notApplicable: gates.filter((gate) => gate.status === GATE_STATUSES.notApplicable),
  }
}

async function loadCanonicalRequirementsForContext(client, { contextType, contextId } = {}) {
  if (!contextType || !contextId) return []
  const result = await client
    .from('document_requirement_instances')
    .select('*, document_definitions(*)')
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .neq('status', REQUIREMENT_STATUSES.notApplicable)
  if (result.error) throw result.error
  return result.data || []
}

export async function evaluateGateReadiness({ contextType, contextId, gateKey, client = supabase, force = false, ...options } = {}) {
  if (!areCanonicalWorkflowGatesEnabled({ force, ...options })) {
    const definition = getGateDefinition(gateKey)
    return {
      gate_key: normalizeKey(gateKey),
      gate: normalizeKey(gateKey),
      display_label: definition.displayLabel,
      label: definition.displayLabel,
      readiness_percentage: 100,
      percentReady: 100,
      status: GATE_STATUSES.notApplicable,
      blockers: [],
      missing_required: [],
      provisionally_satisfied: [],
      expired: [],
      waived: [],
      affected_packs: [],
      explanation: 'Canonical workflow gates are disabled.',
      can_advance: true,
      canAdvance: true,
      enforcement_mode: GATE_ENFORCEMENT_MODES.off,
      enforcementMode: GATE_ENFORCEMENT_MODES.off,
      skipped: true,
    }
  }
  const db = requireClient(client)
  const requirements = await loadCanonicalRequirementsForContext(db, { contextType, contextId })
  return evaluateGateReadinessFromRequirements(requirements, gateKey, options)
}

export async function evaluateAllGateReadiness({ contextType, contextId, client = supabase, force = false, ...options } = {}) {
  if (!areCanonicalWorkflowGatesEnabled({ force, ...options })) return []
  const db = requireClient(client)
  const requirements = await loadCanonicalRequirementsForContext(db, { contextType, contextId })
  return evaluateAllGateReadinessFromRequirements(requirements, options)
}

export async function getMissingGateBlockers({ contextType, contextId, gateKey, client = supabase, ...options } = {}) {
  const gate = await evaluateGateReadiness({ contextType, contextId, gateKey, client, ...options })
  return gate.blockers || []
}

async function insertGateEvents(client, gateResult = {}, {
  contextType = '',
  contextId = '',
  actorRole = 'system',
  actorUserId = null,
  attemptedStageTransition = '',
  eventType = CANONICAL_GATE_EVENT_TYPES.evaluated,
  metadata = {},
} = {}) {
  const targetRequirements = [
    ...(gateResult.blockers || []),
    ...(gateResult.missing_required || []),
    ...(gateResult.provisionally_satisfied || []),
  ].filter((item) => item.id)
  const unique = Array.from(new Map(targetRequirements.map((item) => [item.id, item])).values())
  if (!unique.length) return { inserted: 0, skipped: true }

  const rows = unique.map((requirement) => ({
    requirement_instance_id: requirement.id,
    event_type: eventType,
    actor_role: actorRole || 'system',
    actor_user_id: normalizeUuid(actorUserId),
    message: gateResult.explanation || null,
    metadata_json: {
      source_system: CANONICAL_WORKFLOW_GATE_SOURCE,
      gate_key: gateResult.gate_key,
      enforcement_mode: gateResult.enforcement_mode,
      blocker_count: gateResult.blocker_count,
      missing_required_count: gateResult.missing_required_count,
      attempted_stage_transition: attemptedStageTransition || null,
      can_advance: gateResult.can_advance,
      context_type: contextType || null,
      context_id: contextId || null,
      ...metadata,
    },
  }))

  const result = await client.from('document_requirement_events').insert(rows)
  if (result.error) throw result.error
  return { inserted: rows.length }
}

export async function logGateEvaluation(gateResult = {}, {
  contextType = '',
  contextId = '',
  actorRole = 'system',
  actorUserId = null,
  attemptedStageTransition = '',
  eventType = '',
  client = supabase,
  metadata = {},
} = {}) {
  const db = requireClient(client)
  const resolvedEventType = eventType ||
    (gateResult.status === GATE_STATUSES.blocked && gateResult.enforcement_mode === GATE_ENFORCEMENT_MODES.hardBlock
      ? CANONICAL_GATE_EVENT_TYPES.blocked
      : gateResult.status === GATE_STATUSES.warning
        ? CANONICAL_GATE_EVENT_TYPES.warningShown
        : gateResult.status === GATE_STATUSES.ready
          ? CANONICAL_GATE_EVENT_TYPES.passed
          : CANONICAL_GATE_EVENT_TYPES.evaluated)
  return insertGateEvents(db, gateResult, {
    contextType,
    contextId,
    actorRole,
    actorUserId,
    attemptedStageTransition,
    eventType: resolvedEventType,
    metadata,
  })
}

export async function canAdvanceWorkflowStage({
  contextType,
  contextId,
  targetStage = '',
  gateKey = '',
  actorRole = 'system',
  actorUserId = null,
  client = supabase,
  logEvent = true,
  override = false,
  ...options
} = {}) {
  const mappedGate = gateKey || mapWorkflowStageToCanonicalGate(targetStage, options.stageGateMapping || DEFAULT_STAGE_GATE_MAPPING)
  if (!mappedGate) {
    return {
      allowed: true,
      can_advance: true,
      gate: null,
      gate_key: '',
      reason: null,
      enforcement_mode: resolveGateEnforcementMode(options),
      skipped: true,
      warning: null,
    }
  }

  const gate = await evaluateGateReadiness({ contextType, contextId, gateKey: mappedGate, client, ...options })
  const hardBlocked = gate.enforcement_mode === GATE_ENFORCEMENT_MODES.hardBlock && gate.status === GATE_STATUSES.blocked && !override
  const warning = gate.enforcement_mode === GATE_ENFORCEMENT_MODES.warning && [GATE_STATUSES.blocked, GATE_STATUSES.warning].includes(gate.status)
  if (logEvent && !gate.skipped && [GATE_STATUSES.blocked, GATE_STATUSES.warning, GATE_STATUSES.ready].includes(gate.status)) {
    await logGateEvaluation(gate, {
      contextType,
      contextId,
      actorRole,
      actorUserId,
      attemptedStageTransition: targetStage,
      client,
      eventType: override && gate.status === GATE_STATUSES.blocked
        ? CANONICAL_GATE_EVENT_TYPES.overrideUsed
        : hardBlocked
          ? CANONICAL_GATE_EVENT_TYPES.blocked
          : warning
            ? CANONICAL_GATE_EVENT_TYPES.warningShown
            : CANONICAL_GATE_EVENT_TYPES.evaluated,
      metadata: { override: Boolean(override) },
    }).catch(() => null)
  }

  return {
    allowed: !hardBlocked,
    can_advance: !hardBlocked,
    gate,
    gate_key: mappedGate,
    reason: hardBlocked ? gate.explanation : null,
    warning: warning ? gate.explanation : null,
    blockers: gate.blockers || [],
    enforcement_mode: gate.enforcement_mode,
    status: gate.status,
  }
}

export async function getGateStatusSummary({ contextType, contextId, client = supabase, ...options } = {}) {
  const gates = await evaluateAllGateReadiness({ contextType, contextId, client, ...options })
  return {
    gates,
    blocked: gates.filter((gate) => gate.status === GATE_STATUSES.blocked),
    warnings: gates.filter((gate) => gate.status === GATE_STATUSES.warning),
    ready: gates.filter((gate) => gate.status === GATE_STATUSES.ready),
    notApplicable: gates.filter((gate) => gate.status === GATE_STATUSES.notApplicable),
  }
}
