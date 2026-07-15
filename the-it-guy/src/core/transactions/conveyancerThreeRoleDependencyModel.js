import { MATTER_PLAN_DEPENDENCY_TYPES, MATTER_PLAN_EVIDENCE_TYPES, MATTER_PLAN_OWNER_ROLES as R, normalizeMatterPlanOwnerRole } from './conveyancerMatterPlanContract.js'
import { LEGAL_ROLE_TYPES } from './legalRoleCoordinationContract.js'
import {
  CONVEYANCER_COORDINATION_CONTRACT_VERSION,
  CONVEYANCER_COORDINATION_LANES as L,
  CONVEYANCER_COORDINATION_PRIORITY_POLICY,
  CONVEYANCER_COORDINATION_STATUSES,
  buildConveyancerCoordinationContract,
  normalizeConveyancerCoordination,
  validateConveyancerCoordination,
} from './conveyancerCoordinationContract.js'
import { resolveLegalRequirements } from '../../services/attorneyWorkflow/attorneyWorkflowResolver.js'

export const CONVEYANCER_THREE_ROLE_DEPENDENCY_MODEL_VERSION = 'conveyancer_three_role_dependency_model_v1'

export const CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS = Object.freeze({
  bondInstructionAndConditions: 'bond_instruction_and_conditions',
  bondGuaranteeIssued: 'bond_guarantee_issued',
  transferGuaranteeWordingDecision: 'transfer_guarantee_wording_decision',
  bondLodgementReadiness: 'bond_lodgement_readiness',
  bondRegistrationConfirmation: 'bond_registration_confirmation',
  cancellationFigures: 'cancellation_figures',
  cancellationGuaranteeProvided: 'cancellation_guarantee_provided',
  cancellationGuaranteeAcceptance: 'cancellation_guarantee_acceptance',
  cancellationLodgementReadiness: 'cancellation_lodgement_readiness',
  cancellationRegistrationConfirmation: 'cancellation_registration_confirmation',
})

const K = CONVEYANCER_THREE_ROLE_DEPENDENCY_KEYS
const ROLE_TO_LANE = Object.freeze({
  [LEGAL_ROLE_TYPES.transferAttorney]: L.transfer,
  [LEGAL_ROLE_TYPES.bondAttorney]: L.bond,
  [LEGAL_ROLE_TYPES.cancellationAttorney]: L.cancellation,
})
const LANE_TO_ROLE = Object.freeze({
  [L.transfer]: R.transferAttorney,
  [L.bond]: R.bondAttorney,
  [L.cancellation]: R.cancellationAttorney,
})

function evidence(key, label, type, requiresApproval = false) { return Object.freeze({ key, label, type, required: true, requiresApproval }) }
function dependency(definition) { return Object.freeze({ priority: 'high', visibility: 'professional_shared', prerequisiteKeys: Object.freeze([]), prerequisiteMilestones: Object.freeze([]), requiredForMilestones: Object.freeze([]), evidenceRequirements: Object.freeze([]), ...definition }) }

export const CONVEYANCER_THREE_ROLE_DEPENDENCY_LIBRARY = Object.freeze([
  dependency({ key: K.bondInstructionAndConditions, appliesWhen: 'bond', sourceLane: L.transfer, targetLane: L.bond, deliverable: Object.freeze({ key: 'bond_instruction_summary', type: 'information', label: 'Bond instruction and bank-condition summary', description: 'Confirm the bank instruction, approved amount and outstanding conditions affecting transfer.', format: 'structured_data' }), prerequisiteMilestones: Object.freeze(['bond_instruction_accepted']), requiredForMilestones: Object.freeze(['guarantees_requested']), evidenceRequirements: Object.freeze([evidence('bank_instruction_confirmation', 'Accepted bank instruction confirmation', MATTER_PLAN_EVIDENCE_TYPES.confirmation)]) }),
  dependency({ key: K.bondGuaranteeIssued, appliesWhen: 'bond', sourceLane: L.transfer, targetLane: L.bond, priority: 'critical', deliverable: Object.freeze({ key: 'issued_guarantee', type: 'guarantee', label: 'Issued bank guarantee', description: 'Provide the issued guarantee and wording for transfer and cancellation coordination.', format: 'pdf' }), prerequisiteMilestones: Object.freeze(['bank_conditions_satisfied']), requiredForMilestones: Object.freeze(['transfer_guarantees_accepted']), evidenceRequirements: Object.freeze([evidence('guarantee_document', 'Issued guarantee', MATTER_PLAN_EVIDENCE_TYPES.document, true)]) }),
  dependency({ key: K.transferGuaranteeWordingDecision, appliesWhen: 'bond', sourceLane: L.bond, targetLane: L.transfer, deliverable: Object.freeze({ key: 'guarantee_wording_decision', type: 'approval', label: 'Transfer guarantee-wording decision', description: 'Confirm acceptance or return reasoned wording changes to the bond attorney.', format: 'decision' }), prerequisiteKeys: Object.freeze([K.bondGuaranteeIssued]), prerequisiteMilestones: Object.freeze(['guarantees_issued']), requiredForMilestones: Object.freeze(['guarantee_wording_accepted']), evidenceRequirements: Object.freeze([evidence('wording_decision', 'Guarantee-wording decision', MATTER_PLAN_EVIDENCE_TYPES.decision, true)]) }),
  dependency({ key: K.bondLodgementReadiness, appliesWhen: 'bond', sourceLane: L.transfer, targetLane: L.bond, priority: 'critical', deliverable: Object.freeze({ key: 'bond_lodgement_readiness', type: 'lodgement', label: 'Bond lodgement readiness', description: 'Confirm that the bond pack can lodge simultaneously with transfer.', format: 'confirmation' }), prerequisiteKeys: Object.freeze([K.transferGuaranteeWordingDecision]), prerequisiteMilestones: Object.freeze(['guarantee_wording_accepted']), requiredForMilestones: Object.freeze(['lodgement_ready']), evidenceRequirements: Object.freeze([evidence('bond_lodgement_ready', 'Bond lodgement readiness confirmation', MATTER_PLAN_EVIDENCE_TYPES.confirmation, true)]) }),
  dependency({ key: K.bondRegistrationConfirmation, appliesWhen: 'bond', sourceLane: L.transfer, targetLane: L.bond, priority: 'normal', deliverable: Object.freeze({ key: 'bond_registration_confirmation', type: 'registration', label: 'Bond registration confirmation', description: 'Confirm bond registration date and reference for matter close-out.', format: 'confirmation' }), prerequisiteMilestones: Object.freeze(['registration_confirmed']), requiredForMilestones: Object.freeze(['final_accounts_prepared']), evidenceRequirements: Object.freeze([evidence('bond_registration_evidence', 'Bond registration evidence', MATTER_PLAN_EVIDENCE_TYPES.externalReference)]) }),
  dependency({ key: K.cancellationFigures, appliesWhen: 'cancellation', sourceLane: L.transfer, targetLane: L.cancellation, priority: 'critical', deliverable: Object.freeze({ key: 'cancellation_figures', type: 'financial', label: 'Current cancellation figures', description: 'Provide lender-issued cancellation figures with expiry and guarantee requirements.', format: 'pdf' }), prerequisiteMilestones: Object.freeze(['cancellation_instruction_accepted']), requiredForMilestones: Object.freeze(['guarantees_requested']), evidenceRequirements: Object.freeze([evidence('cancellation_figures_document', 'Current cancellation figures', MATTER_PLAN_EVIDENCE_TYPES.document, true), evidence('figures_expiry', 'Figures expiry date', MATTER_PLAN_EVIDENCE_TYPES.data)]) }),
  dependency({ key: K.cancellationGuaranteeProvided, appliesWhen: 'cancellation', sourceLane: L.cancellation, targetLane: L.transfer, priority: 'critical', deliverable: Object.freeze({ key: 'cancellation_guarantee', type: 'guarantee', label: 'Guarantee provided for cancellation', description: 'Provide the guarantee required by the existing lender and cancellation figures.', format: 'pdf' }), prerequisiteKeys: Object.freeze([]), prerequisiteMilestones: Object.freeze(['cancellation_figures_received']), requiredForMilestones: Object.freeze(['cancellation_guarantees_received']), evidenceRequirements: Object.freeze([evidence('cancellation_guarantee_document', 'Cancellation guarantee', MATTER_PLAN_EVIDENCE_TYPES.document, true)]) }),
  dependency({ key: K.cancellationGuaranteeAcceptance, appliesWhen: 'cancellation', sourceLane: L.transfer, targetLane: L.cancellation, priority: 'critical', deliverable: Object.freeze({ key: 'cancellation_guarantee_acceptance', type: 'approval', label: 'Cancellation guarantee acceptance', description: 'Confirm that guarantee amount, wording and bank details satisfy the cancellation instruction.', format: 'decision' }), prerequisiteKeys: Object.freeze([K.cancellationGuaranteeProvided]), prerequisiteMilestones: Object.freeze(['cancellation_guarantees_received']), requiredForMilestones: Object.freeze(['transfer_guarantees_accepted']), evidenceRequirements: Object.freeze([evidence('cancellation_guarantee_decision', 'Cancellation guarantee decision', MATTER_PLAN_EVIDENCE_TYPES.decision, true)]) }),
  dependency({ key: K.cancellationLodgementReadiness, appliesWhen: 'cancellation', sourceLane: L.transfer, targetLane: L.cancellation, priority: 'critical', deliverable: Object.freeze({ key: 'cancellation_lodgement_readiness', type: 'lodgement', label: 'Cancellation lodgement readiness', description: 'Confirm cancellation can lodge simultaneously with transfer and any bond.', format: 'confirmation' }), prerequisiteKeys: Object.freeze([K.cancellationGuaranteeAcceptance]), prerequisiteMilestones: Object.freeze(['cancellation_guarantees_accepted']), requiredForMilestones: Object.freeze(['lodgement_ready']), evidenceRequirements: Object.freeze([evidence('cancellation_lodgement_ready', 'Cancellation lodgement readiness confirmation', MATTER_PLAN_EVIDENCE_TYPES.confirmation, true)]) }),
  dependency({ key: K.cancellationRegistrationConfirmation, appliesWhen: 'cancellation', sourceLane: L.transfer, targetLane: L.cancellation, priority: 'normal', deliverable: Object.freeze({ key: 'cancellation_registration_confirmation', type: 'registration', label: 'Cancellation registration confirmation', description: 'Confirm cancellation registration and discharge evidence for close-out.', format: 'confirmation' }), prerequisiteMilestones: Object.freeze(['registration_confirmed']), requiredForMilestones: Object.freeze(['final_accounts_prepared']), evidenceRequirements: Object.freeze([evidence('cancellation_registration_evidence', 'Cancellation registration evidence', MATTER_PLAN_EVIDENCE_TYPES.externalReference)]) }),
])

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '') }
function validDate(value) { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, itemKey) => { result[itemKey] = stable(value[itemKey]); return result }, {})
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function addHours(iso, hours) { return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString() }
function normalizeActor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null, teamId: text(input.teamId || input.team_id) || null, lane: key(input.lane) || null } }
function roleBinding(input = {}, lane) {
  const owner = normalizeActor(input.owner || input)
  return { lane, firmId: text(input.firmId || input.firm_id) || null, owner: { ...owner, role: owner.role || LANE_TO_ROLE[lane], lane: owner.lane || null } }
}
function readBinding(bindings = {}, lane) {
  const aliases = lane === L.transfer ? ['transfer', 'transferAttorney', 'transfer_attorney'] : lane === L.bond ? ['bond', 'bondAttorney', 'bond_attorney'] : ['cancellation', 'cancellationAttorney', 'cancellation_attorney']
  return roleBinding(aliases.map((alias) => bindings[alias]).find(Boolean) || {}, lane)
}
function requiredLanes(requirements) { return requirements.requiredAttorneyRoles.map((role) => ROLE_TO_LANE[role]).filter(Boolean) }
function applicable(definition, lanes) { return definition.appliesWhen === 'bond' ? lanes.includes(L.bond) : lanes.includes(L.cancellation) }
function sourceFactsSnapshot(facts = {}) {
  return stable({ financeType: facts.financeType || '', transactionType: facts.transactionType || '', propertyTenure: facts.propertyTenure || '', requiresTransferAttorney: facts.requiresTransferAttorney === true, requiresBondAttorney: facts.requiresBondAttorney === true, requiresCancellationAttorney: facts.requiresCancellationAttorney === true, sellerHasExistingBond: facts.sellerHasExistingBond === true, cancellationRequired: facts.cancellationRequired === true })
}

function topologicalOrder(nodes = []) {
  const byKey = new Map(nodes.map((node) => [node.key, node]))
  const visiting = new Set(); const visited = new Set(); const order = []; const cyclic = new Set()
  function visit(nodeKey, path = []) {
    if (visiting.has(nodeKey)) { path.slice(path.indexOf(nodeKey)).forEach((item) => cyclic.add(item)); cyclic.add(nodeKey); return }
    if (visited.has(nodeKey)) return
    visiting.add(nodeKey)
    for (const prerequisite of byKey.get(nodeKey)?.prerequisiteKeys || []) if (byKey.has(prerequisite)) visit(prerequisite, [...path, nodeKey])
    visiting.delete(nodeKey); visited.add(nodeKey); order.push(nodeKey)
  }
  for (const node of nodes) visit(node.key)
  return { order, cyclic: [...cyclic].sort() }
}

function generatedByForLane(inputActor, lane) {
  const actor = normalizeActor(inputActor)
  if (actor.role === R.firmManager) return { ...actor, lane }
  return actor
}

function buildCoordination({ definition, plan, transactionId, organisationId, source, target, generatedAt, generatedBy, actionKeyMap, prerequisiteKeys }) {
  const policy = CONVEYANCER_COORDINATION_PRIORITY_POLICY[definition.priority]
  const dependencies = [
    ...definition.prerequisiteMilestones.map((milestone) => ({ key: milestone, type: MATTER_PLAN_DEPENDENCY_TYPES.event, required: true })),
    ...prerequisiteKeys.map((prerequisite) => ({ key: `coordination_accepted:${prerequisite}`, type: MATTER_PLAN_DEPENDENCY_TYPES.event, required: true })),
    { key: `${target.lane}_attorney_active`, type: MATTER_PLAN_DEPENDENCY_TYPES.legalRole, required: true },
  ]
  const requiredForActionKeys = unique(definition.requiredForMilestones.map((milestone) => key(actionKeyMap[milestone])).filter(Boolean))
  return buildConveyancerCoordinationContract({
    contractVersion: CONVEYANCER_COORDINATION_CONTRACT_VERSION,
    coordinationId: `coordination:${transactionId}:e2:${definition.key}:r1`, revision: 1,
    planId: plan.planId, planVersion: plan.planVersion, transactionId, organisationId,
    deduplicationKey: `${transactionId}.${definition.key}`, status: CONVEYANCER_COORDINATION_STATUSES.draft,
    priority: definition.priority, visibility: definition.visibility, source, target,
    deliverable: definition.deliverable, dependencies, requiredForActionKeys,
    evidenceRequirements: definition.evidenceRequirements,
    sla: { acknowledgeBy: addHours(generatedAt, policy.acknowledgeHours), deliverBy: addHours(generatedAt, policy.deliverHours) },
    createdAt: generatedAt, createdBy: generatedByForLane(generatedBy, definition.sourceLane), updatedAt: generatedAt, runtimeRevision: 0,
  }, { actionKeys: Object.values(actionKeyMap).map(key).filter(Boolean) })
}

function modelFingerprint(value = {}) {
  return fnv({ version: value.version, modelId: value.modelId, plan: value.plan, transactionId: value.transactionId, organisationId: value.organisationId, generatedAt: value.generatedAt, generatedBy: value.generatedBy, sourceFacts: value.sourceFacts, sourceFactsFingerprint: value.sourceFactsFingerprint, requiredLanes: value.requiredLanes, roleBindings: value.roleBindings, missingTransactionFields: value.missingTransactionFields, actionKeyMap: value.actionKeyMap, nodes: value.nodes.map((node) => ({ key: node.key, sourceLane: node.sourceLane, targetLane: node.targetLane, prerequisiteKeys: node.prerequisiteKeys, prerequisiteMilestones: node.prerequisiteMilestones, requiredForMilestones: node.requiredForMilestones, coordinationId: node.coordination.coordinationId, definitionFingerprint: node.coordination.definitionFingerprint })), topologicalOrder: value.topologicalOrder })
}

export function buildConveyancerThreeRoleDependencyModel({ modelId = '', plan = {}, transaction = {}, transactionId = '', organisationId = '', roleBindings = {}, actionKeyMap = {}, generatedAt = '', generatedBy = {} } = {}) {
  const resolvedTransactionId = text(transactionId || transaction.id || transaction.transactionId || transaction.transaction_id)
  const resolvedOrganisationId = text(organisationId || transaction.organisationId || transaction.organisation_id)
  const requirements = resolveLegalRequirements(transaction)
  const sourceFacts = sourceFactsSnapshot(requirements.facts)
  const lanes = requiredLanes(requirements)
  const bindings = Object.fromEntries(lanes.map((lane) => [lane, readBinding(roleBindings, lane)]))
  const definitions = CONVEYANCER_THREE_ROLE_DEPENDENCY_LIBRARY.filter((item) => applicable(item, lanes))
  const definitionKeys = new Set(definitions.map((item) => item.key))
  const nodes = definitions.map((definition) => {
    const prerequisiteKeys = definition.key === K.cancellationGuaranteeProvided && lanes.includes(L.bond) ? [K.bondGuaranteeIssued] : definition.prerequisiteKeys.filter((item) => definitionKeys.has(item))
    const source = bindings[definition.sourceLane] || readBinding(roleBindings, definition.sourceLane)
    const target = bindings[definition.targetLane] || readBinding(roleBindings, definition.targetLane)
    const result = validDate(generatedAt) && resolvedTransactionId && resolvedOrganisationId && plan.planId && Number(plan.planVersion) > 0
      ? buildCoordination({ definition, plan: { planId: text(plan.planId), planVersion: Number(plan.planVersion) }, transactionId: resolvedTransactionId, organisationId: resolvedOrganisationId, source, target, generatedAt: new Date(generatedAt).toISOString(), generatedBy, actionKeyMap, prerequisiteKeys })
      : { ok: false, errors: ['dependency_model_identity_invalid'], coordination: normalizeConveyancerCoordination({}) }
    return { key: definition.key, sourceLane: definition.sourceLane, targetLane: definition.targetLane, prerequisiteKeys, prerequisiteMilestones: [...definition.prerequisiteMilestones], requiredForMilestones: [...definition.requiredForMilestones], coordination: result.coordination, contractErrors: result.errors }
  })
  const graph = topologicalOrder(nodes)
  const value = {
    version: CONVEYANCER_THREE_ROLE_DEPENDENCY_MODEL_VERSION,
    modelId: text(modelId) || `three_role_dependencies:${resolvedTransactionId}:${text(plan.planId)}:v${Number(plan.planVersion) || 0}`,
    plan: { planId: text(plan.planId), planVersion: Number(plan.planVersion || 0) },
    transactionId: resolvedTransactionId, organisationId: resolvedOrganisationId,
    generatedAt: validDate(generatedAt) ? new Date(generatedAt).toISOString() : generatedAt || null,
    generatedBy: normalizeActor(generatedBy),
    sourceFacts,
    sourceFactsFingerprint: fnv(sourceFacts),
    requiredLanes: lanes,
    roleBindings: bindings,
    missingTransactionFields: [...requirements.facts.missingFields],
    warnings: [...requirements.warnings],
    actionKeyMap: Object.fromEntries(Object.entries(actionKeyMap).map(([milestone, action]) => [key(milestone), key(action)]).filter(([, action]) => action)),
    nodes,
    topologicalOrder: graph.order,
    fingerprint: null,
    persistencePerformed: false,
    notificationsSent: false,
    workflowsMutated: false,
  }
  value.fingerprint = modelFingerprint(value)
  const validation = validateConveyancerThreeRoleDependencyModel(value)
  return deepFreeze({ ok: validation.valid, code: validation.valid ? 'three_role_dependency_model_valid' : 'three_role_dependency_model_invalid', errors: validation.errors, warnings: unique([...value.warnings, ...validation.warnings]), model: validation.model })
}

export function validateConveyancerThreeRoleDependencyModel(input = {}) {
  const value = JSON.parse(JSON.stringify(input || {}))
  const errors = []
  const warnings = []
  if (value.version !== CONVEYANCER_THREE_ROLE_DEPENDENCY_MODEL_VERSION) errors.push('dependency_model_version_invalid')
  if (!value.modelId) errors.push('dependency_model_id_required')
  if (!value.plan?.planId || !Number.isInteger(value.plan?.planVersion) || value.plan.planVersion < 1) errors.push('dependency_model_plan_binding_required')
  if (!value.transactionId || !value.organisationId) errors.push('dependency_model_matter_binding_required')
  if (!validDate(value.generatedAt) || !value.generatedBy?.userId || ![R.system, R.firmManager].includes(normalizeMatterPlanOwnerRole(value.generatedBy?.role))) errors.push('dependency_model_generation_provenance_invalid')
  if (!value.sourceFacts || value.sourceFactsFingerprint !== fnv(sourceFactsSnapshot(value.sourceFacts))) errors.push('dependency_model_source_facts_invalid')
  if (Array.isArray(value.missingTransactionFields) && value.missingTransactionFields.length) errors.push(`dependency_model_facts_incomplete:${value.missingTransactionFields.join(',')}`)
  const requiredLanes = Array.isArray(value.requiredLanes) ? value.requiredLanes : []
  const factLanes = [value.sourceFacts?.requiresTransferAttorney ? L.transfer : null, value.sourceFacts?.requiresBondAttorney ? L.bond : null, value.sourceFacts?.requiresCancellationAttorney ? L.cancellation : null].filter(Boolean)
  if (requiredLanes.join('|') !== factLanes.join('|')) errors.push('dependency_model_fact_lane_mismatch')
  if (!requiredLanes.includes(L.transfer)) errors.push('transfer_lane_required')
  if (new Set(requiredLanes).size !== requiredLanes.length || requiredLanes.some((lane) => ![L.transfer, L.bond, L.cancellation].includes(lane))) errors.push('dependency_model_required_lanes_invalid')
  for (const lane of requiredLanes) {
    const binding = value.roleBindings?.[lane]
    if (!binding?.firmId || !binding?.owner?.role || (!binding.owner.userId && !binding.owner.teamId)) errors.push(`dependency_role_binding_required:${lane}`)
  }
  const nodes = Array.isArray(value.nodes) ? value.nodes : []
  const nodeKeys = nodes.map((node) => node.key)
  if (new Set(nodeKeys).size !== nodeKeys.length) errors.push('duplicate_dependency_node')
  const expectedDefinitions = CONVEYANCER_THREE_ROLE_DEPENDENCY_LIBRARY.filter((item) => applicable(item, requiredLanes)).map((item) => item.key).sort()
  if ([...nodeKeys].sort().join('|') !== expectedDefinitions.join('|')) errors.push('dependency_node_coverage_invalid')
  for (const node of nodes) {
    if (![L.transfer, L.bond, L.cancellation].includes(node.sourceLane) || ![L.transfer, L.bond, L.cancellation].includes(node.targetLane) || node.sourceLane === node.targetLane) errors.push(`dependency_node_lanes_invalid:${node.key}`)
    if ((node.sourceLane === L.bond && node.targetLane === L.cancellation) || (node.sourceLane === L.cancellation && node.targetLane === L.bond)) errors.push(`direct_bank_lane_dependency_forbidden:${node.key}`)
    if (!requiredLanes.includes(node.sourceLane) || !requiredLanes.includes(node.targetLane)) errors.push(`dependency_node_uses_non_required_lane:${node.key}`)
    if ((node.prerequisiteKeys || []).some((item) => item === node.key || !nodeKeys.includes(item))) errors.push(`dependency_prerequisite_invalid:${node.key}`)
    const contract = validateConveyancerCoordination(node.coordination || {}, { actionKeys: Object.values(value.actionKeyMap || {}) })
    if (!contract.valid) errors.push(...contract.errors.map((error) => `${node.key}:${error}`))
    if (node.coordination?.source?.lane !== node.sourceLane || node.coordination?.target?.lane !== node.targetLane) errors.push(`dependency_coordination_lane_binding_invalid:${node.key}`)
    if (node.coordination?.transactionId !== value.transactionId || node.coordination?.organisationId !== value.organisationId || node.coordination?.planId !== value.plan?.planId || node.coordination?.planVersion !== value.plan?.planVersion) errors.push(`dependency_coordination_matter_binding_invalid:${node.key}`)
  }
  const graph = topologicalOrder(nodes)
  if (graph.cyclic.length) errors.push(`cyclic_three_role_dependencies:${graph.cyclic.join(',')}`)
  if (JSON.stringify(value.topologicalOrder || []) !== JSON.stringify(graph.order)) errors.push('dependency_topological_order_invalid')
  if (value.persistencePerformed || value.notificationsSent || value.workflowsMutated) errors.push('dependency_model_side_effect_boundary_violated')
  if (!nodes.length) warnings.push('dependency_model_has_no_cross_lane_dependencies')
  const expectedFingerprint = modelFingerprint({ ...value, nodes })
  if (!/^fnv1a_[a-f0-9]{8}$/.test(value.fingerprint || '')) errors.push('dependency_model_fingerprint_required')
  else if (value.fingerprint !== expectedFingerprint) errors.push('dependency_model_fingerprint_invalid')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings), model: value })
}

export function getConveyancerThreeRoleDependency(model = {}, dependencyKey = '') {
  return (Array.isArray(model.nodes) ? model.nodes : []).find((node) => node.key === key(dependencyKey)) || null
}

export function summarizeConveyancerThreeRoleDependencyModel(model = {}) {
  const nodes = Array.isArray(model.nodes) ? model.nodes : []
  return deepFreeze({
    requiredLaneCount: Array.isArray(model.requiredLanes) ? model.requiredLanes.length : 0,
    dependencyCount: nodes.length,
    criticalCount: nodes.filter((node) => node.coordination?.priority === 'critical').length,
    transferToBond: nodes.filter((node) => node.sourceLane === L.transfer && node.targetLane === L.bond).length,
    bondToTransfer: nodes.filter((node) => node.sourceLane === L.bond && node.targetLane === L.transfer).length,
    transferToCancellation: nodes.filter((node) => node.sourceLane === L.transfer && node.targetLane === L.cancellation).length,
    cancellationToTransfer: nodes.filter((node) => node.sourceLane === L.cancellation && node.targetLane === L.transfer).length,
  })
}
