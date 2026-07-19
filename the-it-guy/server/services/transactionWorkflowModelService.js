import { requireClient, isMissingColumnError, isMissingTableError } from '../../src/services/attorneyFirmServiceShared.js'
import { resolveRequiredAttorneyLanes } from './attorneyLaneResolver.js'
import { deriveWorkflowBlockers } from './workflowBlockerFactory.js'
import { writeRollupAudit } from './transactionRollupAuditService.js'
import {
  isFinanceWorkflowKey,
  resolveFinanceWorkflowKey,
} from './financeWorkflowResolver.js'
import {
  TRANSACTION_WORKFLOW_VERSION,
  buildWorkflowStepsForKey,
  getTransactionWorkflowDefinition,
  resolveWorkflowKeysForTransaction,
} from '../workflows/transactionWorkflowDefinitions.js'

const INSTANCE_SELECT =
  'id, transaction_id, workflow_key, workflow_version, status, started_at, completed_at, skipped_at, blocked_at, created_at, updated_at'

const STEP_SELECT =
  'id, workflow_instance_id, transaction_id, workflow_key, step_key, step_label, status, required, blocking, owner_role, sort_order, completed_at, completed_by, created_at, updated_at'

const EVIDENCE_SELECT =
  'id, transaction_id, workflow_step_id, workflow_key, step_key, evidence_type, evidence_id, evidence_status, created_at'

const ROLLUP_SELECT =
  'transaction_id, parent_stage, parent_status, progress_percent, active_workflow_key, active_step_key, completed_stages_json, blocked_stages_json, blockers_json, next_action_json, derived_from_json, derived_at, created_at, updated_at'

const TRANSACTION_SELECT =
  'id, finance_type, current_main_stage, stage, onboarding_status, seller_onboarding_status, lifecycle_state, seller_has_existing_bond, existing_bond, cancellation_required, routing_profile_json, routing_profile_version, creation_idempotency_key, updated_at, created_at'

const TRANSACTION_SELECT_FALLBACK =
  'id, finance_type, current_main_stage, stage, onboarding_status, seller_onboarding_status, lifecycle_state, updated_at, created_at'

const LEGACY_WORKFLOW_STEP_KEY_ALIAS = Object.freeze({
  sales_otp: {
    collect_buyer_details: 'buyer_onboarding_complete',
    collect_seller_details: 'seller_onboarding_complete',
    sign_otp: 'signed_otp_received',
    collect_supporting_documents: 'supporting_docs_complete',
  },
  finance_cash: {
    proof_of_funds: 'proof_of_funds_received',
    proof_of_funds_review: 'proof_of_funds_reviewed',
    funds_confirmed: 'cash_confirmation_approved',
  },
  finance_bond: {
    bond_application: 'applications_submitted',
    bond_approval: 'feedback_received',
    guarantees: 'instruction_sent',
  },
  finance_hybrid: {
    bond_documents: 'bond_documents_received',
    bond_review: 'bond_documents_reviewed',
    bond_approval: 'feedback_received',
    quote_approved: 'quote_approved',
    cash_portion_confirmation: 'cash_portion_confirmed',
    guarantees: 'instruction_sent',
  },
  attorney_transfer: {
    transfer_documents_prepared: 'transfer_documents_prepared',
    signed_transfer_documents: 'transfer_documents_signed',
    buyer_signed_transfer_documents: 'transfer_documents_signed',
    seller_signed_transfer_documents: 'transfer_documents_signed',
    rates_clearance_uploaded: 'clearance_figures_received',
    lodgement_submitted: 'lodged',
    lodgement_pack_prepared: 'ready_for_lodgement',
    prep: 'prep_for_registration',
  },
  attorney_bond: {
    bank_requirements_confirmed: 'bank_conditions_received',
    bank_conditions_reviewed: 'bank_conditions_received',
    buyer_signed_bond_documents: 'bond_documents_signed',
    grant_signed: 'bank_conditions_satisfied',
    bond_lodgement_pack_prepared: 'ready_for_lodgement',
    bond_lodgement_submitted: 'lodged',
    bond_lodged: 'lodged',
    bond_registered: 'prep_for_registration',
  },
  seller_bond_cancellation: {
    cancellation_requested: 'cancellation_instruction_received',
    cancellation_documents: 'cancellation_documents_prepared',
    cancellation_ready: 'ready_for_lodgement',
    guarantees_accepted: 'guarantees_received',
    cancellation_lodged: 'lodged',
    cancellation_registered: 'prep_for_registration',
  },
  registration: {
    ready_for_registration: 'all_required_matters_lodged',
    closeout_complete: 'final_accounts_complete',
  },
})

function normalizeText(value) {
  return String(value || '').trim()
}

function toIsoString(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function rowArray(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

function resolveLegacyWorkflowStepKey(workflowKey = '', stepKey = '') {
  const aliasMap = LEGACY_WORKFLOW_STEP_KEY_ALIAS[workflowKey] || {}
  return aliasMap[stepKey] || stepKey
}

async function fetchTransaction(client, transactionId) {
  const primary = await client.from('transactions').select(TRANSACTION_SELECT).eq('id', transactionId).maybeSingle()
  if (!primary.error) return primary.data || null

  if (isMissingColumnError(primary.error, 'seller_has_existing_bond')) {
    const fallback = await client.from('transactions').select(TRANSACTION_SELECT_FALLBACK).eq('id', transactionId).maybeSingle()
    if (!fallback.error) return fallback.data || null
  }

  if (isMissingTableError(primary.error, 'transactions')) return null
  throw primary.error
}

async function selectWorkflowInstances(client, transactionId) {
  const query = await client.from('transaction_workflow_instances').select(INSTANCE_SELECT).eq('transaction_id', transactionId).order('created_at', { ascending: true })
  if (!query.error) return query.data || []
  if (isMissingTableError(query.error, 'transaction_workflow_instances')) return []
  throw query.error
}

async function selectWorkflowSteps(client, transactionId) {
  const query = await client.from('transaction_workflow_steps').select(STEP_SELECT).eq('transaction_id', transactionId).order('sort_order', { ascending: true })
  if (!query.error) return query.data || []
  if (isMissingTableError(query.error, 'transaction_workflow_steps')) return []
  throw query.error
}

async function selectWorkflowEvidence(client, transactionId) {
  const query = await client.from('transaction_workflow_evidence').select(EVIDENCE_SELECT).eq('transaction_id', transactionId).order('created_at', { ascending: true })
  if (!query.error) return query.data || []
  if (isMissingTableError(query.error, 'transaction_workflow_evidence')) return []
  throw query.error
}

async function selectTransactionRollup(client, transactionId) {
  const query = await client.from('transaction_rollups').select(ROLLUP_SELECT).eq('transaction_id', transactionId).maybeSingle()
  if (!query.error) return query.data || null
  if (isMissingTableError(query.error, 'transaction_rollups')) return null
  throw query.error
}

function normalizeWorkflowStepStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['not_started', 'pending', 'blocked', 'complete', 'skipped', 'not_applicable'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'completed') return 'complete'
  if (normalized === 'active' || normalized === 'in_progress') return 'pending'
  return 'not_started'
}

function normalizeWorkflowInstanceStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['not_started', 'active', 'blocked', 'ready_for_handoff', 'complete', 'skipped', 'cancelled'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'completed') return 'complete'
  return 'not_started'
}

function buildInstanceStatusTimestamps(status = '', nowIso = new Date().toISOString()) {
  const normalized = normalizeWorkflowInstanceStatus(status)
  return {
    started_at: ['active', 'blocked', 'ready_for_handoff', 'complete'].includes(normalized) ? nowIso : null,
    completed_at: ['ready_for_handoff', 'complete'].includes(normalized) ? nowIso : null,
    skipped_at: normalized === 'skipped' ? nowIso : null,
    blocked_at: normalized === 'blocked' ? nowIso : null,
  }
}

export function inferWorkflowKeysForTransaction(transaction = {}) {
  return resolveWorkflowKeysForTransaction(transaction)
}

function deriveActiveWorkflowInstanceStatus(workflowKey = '', stepsByWorkflowKey = {}) {
  if (workflowKey === 'finance_unknown') {
    return 'blocked'
  }
  return normalizeWorkflowInstanceStatus(
    buildWorkflowStatusFromNormalizedSteps(stepsByWorkflowKey[workflowKey] || []),
  )
}

async function upsertWorkflowInstanceStatus(client, instance = {}, status = '', nowIso) {
  const normalizedStatus = normalizeWorkflowInstanceStatus(status)
  const payload = {
    id: instance.id,
    status: normalizedStatus,
    ...buildInstanceStatusTimestamps(normalizedStatus, nowIso),
  }
  const query = await client
    .from('transaction_workflow_instances')
    .upsert(payload, { onConflict: 'id' })
    .select(INSTANCE_SELECT)

  if (query.error) throw query.error
  return rowArray(query.data)[0] || { ...instance, ...payload }
}

async function reconcileFinanceWorkflowInstances(client, transaction = {}, currentState = {}, nowIso = new Date().toISOString()) {
  const activeWorkflowKey = resolveFinanceWorkflowKey(transaction)
  const instances = Array.isArray(currentState.instances) ? currentState.instances : []
  let changed = false

  for (const instance of instances) {
    if (!isFinanceWorkflowKey(instance.workflow_key)) continue

    const nextStatus = instance.workflow_key === activeWorkflowKey
      ? deriveActiveWorkflowInstanceStatus(instance.workflow_key, currentState.stepsByWorkflowKey || {})
      : 'skipped'

    if (normalizeWorkflowInstanceStatus(instance.status) === nextStatus) {
      continue
    }

    await upsertWorkflowInstanceStatus(client, instance, nextStatus, nowIso)
    changed = true
  }

  return changed
}

async function reconcileAttorneyWorkflowInstances(client, transaction = {}, currentState = {}, nowIso = new Date().toISOString()) {
  const requirements = resolveRequiredAttorneyLanes(transaction)
  const instances = Array.isArray(currentState.instances) ? currentState.instances : []
  let changed = false

  for (const instance of instances) {
    if (!['attorney_transfer', 'attorney_bond', 'seller_bond_cancellation'].includes(instance.workflow_key)) continue

    const required = requirements[instance.workflow_key]?.required !== false
    const nextStatus = required
      ? deriveActiveWorkflowInstanceStatus(instance.workflow_key, currentState.stepsByWorkflowKey || {})
      : 'skipped'

    if (normalizeWorkflowInstanceStatus(instance.status) === nextStatus) {
      continue
    }

    await upsertWorkflowInstanceStatus(client, instance, nextStatus, nowIso)
    changed = true
  }

  return changed
}

export async function createWorkflowInstance(transactionId, workflowKey, options = {}) {
  const client = options.client || requireClient()
  const definition = getTransactionWorkflowDefinition(workflowKey)
  if (!definition) {
    throw new Error(`Unknown workflow definition: ${workflowKey}`)
  }

  const status = normalizeWorkflowInstanceStatus(options.status || 'not_started')
  const timestamps = buildInstanceStatusTimestamps(status, options.now || new Date().toISOString())
  const payload = {
    transaction_id: transactionId,
    workflow_key: workflowKey,
    workflow_version: Number(options.workflowVersion || TRANSACTION_WORKFLOW_VERSION),
    status,
    ...timestamps,
  }

  const query = await client
    .from('transaction_workflow_instances')
    .upsert(payload, { onConflict: 'transaction_id,workflow_key' })
    .select(INSTANCE_SELECT)

  if (query.error) throw query.error
  return rowArray(query.data)[0] || payload
}

export async function createWorkflowSteps(workflowInstanceId, workflowKey, options = {}) {
  const client = options.client || requireClient()
  const transactionId = normalizeText(options.transactionId)
  const steps = Array.isArray(options.steps) && options.steps.length ? options.steps : buildWorkflowStepsForKey(workflowKey)
  const existingQuery = await client
    .from('transaction_workflow_steps')
    .select(STEP_SELECT)
    .eq('workflow_instance_id', workflowInstanceId)

  if (existingQuery.error && !isMissingTableError(existingQuery.error, 'transaction_workflow_steps')) {
    throw existingQuery.error
  }

  const existingRows = rowArray(existingQuery.data)
  const existingKeys = new Set(existingRows.map((row) => row.step_key))

  const payload = steps
    .filter((step) => !existingKeys.has(step.key))
    .map((step) => ({
    workflow_instance_id: workflowInstanceId,
    transaction_id: transactionId || null,
    workflow_key: workflowKey,
    step_key: step.key,
    step_label: step.label,
    status: normalizeWorkflowStepStatus(step.status || 'not_started'),
    required: step.required !== false,
    blocking: step.blocking === true,
    owner_role: step.ownerRole || step.owner_role || 'system',
    sort_order: Number.isFinite(Number(step.sortOrder || step.sort_order)) ? Number(step.sortOrder || step.sort_order) : 0,
    completed_at: ['complete', 'skipped', 'not_applicable'].includes(normalizeWorkflowStepStatus(step.status || 'not_started'))
      ? toIsoString(options.now || new Date().toISOString())
      : null,
    completed_by: step.completedBy || step.completed_by || null,
  }))

  if (!payload.length) {
    return existingRows
  }

  const query = await client
    .from('transaction_workflow_steps')
    .insert(payload)
    .select(STEP_SELECT)

  if (query.error) throw query.error
  return [...existingRows, ...rowArray(query.data)]
}

export async function ensureTransactionWorkflowInstances(transactionId, options = {}) {
  const client = options.client || requireClient()
  const transaction = options.transaction || (await fetchTransaction(client, transactionId))
  if (!transaction?.id) {
    throw new Error(`Transaction not found: ${transactionId}`)
  }

  const workflowKeys = Array.isArray(options.workflowKeys) && options.workflowKeys.length
    ? options.workflowKeys
    : inferWorkflowKeysForTransaction(transaction)

  const existingInstances = await selectWorkflowInstances(client, transactionId)
  const existingByKey = new Map(existingInstances.map((row) => [row.workflow_key, row]))
  const instances = []

  for (const workflowKey of workflowKeys) {
    let instance = existingByKey.get(workflowKey) || null
    if (!instance) {
      instance = await createWorkflowInstance(transactionId, workflowKey, { client, status: 'not_started' })
    }
    instances.push(instance)

    const steps = buildWorkflowStepsForKey(workflowKey)
    await createWorkflowSteps(instance.id, workflowKey, {
      client,
      transactionId,
      steps,
    })
  }

  let state = await getWorkflowStateForTransaction(transactionId, { client, transaction })
  const financeChanged = await reconcileFinanceWorkflowInstances(
    client,
    transaction,
    state,
    options.now || new Date().toISOString(),
  )
  const attorneyChanged = await reconcileAttorneyWorkflowInstances(
    client,
    transaction,
    financeChanged ? await getWorkflowStateForTransaction(transactionId, { client, transaction }) : state,
    options.now || new Date().toISOString(),
  )

  if (financeChanged || attorneyChanged) {
    state = await getWorkflowStateForTransaction(transactionId, { client, transaction })
  }

  return state
}

export async function attachWorkflowEvidence(transactionId, workflowStepId, evidence = {}, options = {}) {
  const client = options.client || requireClient()
  const payload = {
    transaction_id: transactionId,
    workflow_step_id: workflowStepId,
    workflow_key: evidence.workflowKey || '',
    step_key: evidence.stepKey || '',
    evidence_type: evidence.evidenceType || 'manual_override',
    evidence_id: normalizeText(evidence.evidenceId || ''),
    evidence_status: normalizeText(evidence.evidenceStatus || 'observed') || 'observed',
  }

  const query = await client
    .from('transaction_workflow_evidence')
    .upsert(payload, { onConflict: 'workflow_step_id,evidence_type,evidence_id' })
    .select(EVIDENCE_SELECT)

  if (query.error) throw query.error
  return rowArray(query.data)[0] || payload
}

export async function updateWorkflowStepStatus(transactionId, workflowKey, stepKey, status, options = {}) {
  const client = options.client || requireClient()
  const transaction = options.transaction || (await fetchTransaction(client, transactionId))
  const currentState = await ensureTransactionWorkflowInstances(transactionId, {
    client,
    transaction,
    workflowKeys: options.workflowKeys,
  })

  const instance = (currentState.instances || []).find((row) => row.workflow_key === workflowKey) || null
  if (!instance?.id) {
    throw new Error(`Workflow instance not found for ${workflowKey}.`)
  }

  const step = (currentState.stepsByWorkflowKey?.[workflowKey] || []).find((row) => row.step_key === stepKey) || null
  if (!step?.id) {
    throw new Error(`Workflow step not found for ${workflowKey}.${stepKey}.`)
  }

  const normalizedStatus = normalizeWorkflowStepStatus(status)
  const nowIso = toIsoString(options.now || new Date().toISOString()) || new Date().toISOString()
  const stepPayload = {
    id: step.id,
    status: normalizedStatus,
    completed_at: ['complete', 'skipped', 'not_applicable'].includes(normalizedStatus) ? nowIso : null,
    completed_by: options.completedBy || null,
  }

  const stepUpdate = await client
    .from('transaction_workflow_steps')
    .upsert(stepPayload, { onConflict: 'id' })
    .select(STEP_SELECT)

  if (stepUpdate.error) throw stepUpdate.error

  const refreshedState = await getWorkflowStateForTransaction(transactionId, { client, transaction })
  const nextSteps = refreshedState.stepsByWorkflowKey?.[workflowKey] || []
  const derivedStatus =
    options.instanceStatus ||
    normalizeWorkflowInstanceStatus(
      buildWorkflowStatusFromNormalizedSteps(nextSteps),
    )

  const instancePayload = {
    id: instance.id,
    status: derivedStatus,
    ...buildInstanceStatusTimestamps(derivedStatus, nowIso),
  }

  const instanceUpdate = await client
    .from('transaction_workflow_instances')
    .upsert(instancePayload, { onConflict: 'id' })
    .select(INSTANCE_SELECT)

  if (instanceUpdate.error) throw instanceUpdate.error

  return {
    step: rowArray(stepUpdate.data)[0] || { ...step, ...stepPayload },
    instance: rowArray(instanceUpdate.data)[0] || { ...instance, ...instancePayload },
    state: await getWorkflowStateForTransaction(transactionId, { client, transaction }),
  }
}

function groupStepsByWorkflow(steps = []) {
  return (steps || []).reduce((accumulator, step) => {
    const key = step.workflow_key
    if (!accumulator[key]) accumulator[key] = []
    accumulator[key].push(step)
    return accumulator
  }, {})
}

function groupEvidenceByStep(evidenceRows = []) {
  return (evidenceRows || []).reduce((accumulator, row) => {
    const key = row.workflow_step_id
    if (!accumulator[key]) accumulator[key] = []
    accumulator[key].push(row)
    return accumulator
  }, {})
}

export async function getWorkflowStateForTransaction(transactionId, options = {}) {
  const client = options.client || requireClient()
  const transaction = options.transaction || (await fetchTransaction(client, transactionId))
  const [instances, steps, evidence, rollup] = await Promise.all([
    selectWorkflowInstances(client, transactionId),
    selectWorkflowSteps(client, transactionId),
    selectWorkflowEvidence(client, transactionId),
    selectTransactionRollup(client, transactionId),
  ])

  return {
    transaction,
    instances,
    steps,
    evidence,
    rollup,
    stepsByWorkflowKey: groupStepsByWorkflow(steps),
    evidenceByStepId: groupEvidenceByStep(evidence),
  }
}

function inferEvidenceTypeFromSourceId(sourceId = '', rollup = {}) {
  const normalized = normalizeText(sourceId)
  if (!normalized) return 'manual_override'

  if ((rollup?.derivedFrom?.eventIds || []).includes(normalized)) return 'event'
  if ((rollup?.derivedFrom?.checklistItemIds || []).includes(normalized)) return 'checklist_item'
  if ((rollup?.derivedFrom?.documentIds || []).includes(normalized)) return 'document'
  if ((rollup?.derivedFrom?.workflowStepIds || []).includes(normalized)) return 'manual_override'
  return 'manual_override'
}

function findWorkflowFromRollup(rollup = {}, workflowKey = '') {
  const workflows = rollup?.workflows || {}
  if (workflows[workflowKey]) return workflows[workflowKey]
  return Object.values(workflows).find((workflow) => workflow?.workflowKey === workflowKey) || null
}

async function updateWorkflowInstance(client, instance = {}, workflow = {}, nowIso) {
  const status = normalizeWorkflowInstanceStatus(workflow.status)
  const timestamps = buildInstanceStatusTimestamps(status, nowIso)
  const payload = {
    id: instance.id,
    status,
    ...timestamps,
  }

  const query = await client.from('transaction_workflow_instances').upsert(payload, { onConflict: 'id' }).select(INSTANCE_SELECT)
  if (query.error) throw query.error
  return rowArray(query.data)[0] || { ...instance, ...payload }
}

async function updateWorkflowStep(client, existingStep = {}, nextStep = {}, nowIso) {
  const status = normalizeWorkflowStepStatus(nextStep.status)
  const payload = {
    id: existingStep.id,
    status,
    step_label: nextStep.label || existingStep.step_label,
    owner_role: nextStep.ownerRole || existingStep.owner_role,
    required: nextStep.required !== false,
    blocking: nextStep.blocking === true || existingStep.blocking === true,
    sort_order: Number.isFinite(Number(nextStep.sortOrder || nextStep.sort_order))
      ? Number(nextStep.sortOrder || nextStep.sort_order)
      : existingStep.sort_order,
    completed_at: ['complete', 'skipped', 'not_applicable'].includes(status) ? nowIso : null,
    completed_by: nextStep.completedBy || nextStep.completed_by || existingStep.completed_by || null,
  }

  const query = await client.from('transaction_workflow_steps').upsert(payload, { onConflict: 'id' }).select(STEP_SELECT)
  if (query.error) throw query.error
  return rowArray(query.data)[0] || { ...existingStep, ...payload }
}

export async function persistTransactionRollup(transactionId, rollup = {}, options = {}) {
  const client = options.client || requireClient()
  const previous = options.previousRollup || (await selectTransactionRollup(client, transactionId))
  const payload = {
    transaction_id: transactionId,
    parent_stage: rollup.parentStage || null,
    parent_status: rollup.parentStatus || null,
    progress_percent: Number(rollup.progressPercent || 0),
    active_workflow_key: rollup.activeWorkflowKey || null,
    active_step_key: rollup.activeStepKey || null,
    completed_stages_json: rollup.completedStages || [],
    blocked_stages_json: rollup.blockedStages || [],
    blockers_json: rollup.blockers || [],
    next_action_json: rollup.nextAction || null,
    derived_from_json: rollup.derivedFrom || {},
    derived_at: rollup.derivedAt || new Date().toISOString(),
  }

  const upsert = await client.from('transaction_rollups').upsert(payload, { onConflict: 'transaction_id' }).select(ROLLUP_SELECT)
  if (upsert.error) throw upsert.error

  const persisted = rowArray(upsert.data)[0] || payload
  await writeRollupAudit({
    transactionId,
    previousRollup: previous,
    newRollup: persisted,
    triggerType: options.triggerType || 'workflow_sync',
    triggerId: options.triggerId || null,
    triggerSource: options.triggerSource || options.source || null,
    reasonCode: options.reasonCode || 'ROLLUP_RECALCULATED',
    userId: options.createdBy || null,
    force: options.forceAudit === true,
    auditMetadata: options.auditMetadata || null,
    client,
  })

  return persisted
}

export async function syncTransactionWorkflowModel(transactionId, rollup = {}, options = {}) {
  const client = options.client || requireClient()
  const nowIso = options.now || new Date().toISOString()
  const transaction = options.transaction || (await fetchTransaction(client, transactionId))
  const ensured = await ensureTransactionWorkflowInstances(transactionId, { client, transaction })
  const instancesByKey = new Map((ensured.instances || []).map((row) => [row.workflow_key, row]))
  const stepsByWorkflowKey = ensured.stepsByWorkflowKey || {}

  for (const workflowKey of inferWorkflowKeysForTransaction(transaction || {})) {
    const instance = instancesByKey.get(workflowKey)
    if (!instance) continue

    const resolvedWorkflow = findWorkflowFromRollup(rollup, workflowKey)
    if (!resolvedWorkflow) continue

    await updateWorkflowInstance(client, instance, resolvedWorkflow, nowIso)

    const existingStepsByKey = new Map((stepsByWorkflowKey[workflowKey] || []).map((step) => [step.step_key, step]))
    for (const resolvedStep of resolvedWorkflow.requiredSteps || []) {
      const canonicalStepKey = resolveLegacyWorkflowStepKey(workflowKey, resolvedStep.key)
      const existingStep = existingStepsByKey.get(canonicalStepKey)
      if (!existingStep) continue
      const updatedStep = await updateWorkflowStep(client, existingStep, { ...resolvedStep, key: canonicalStepKey }, nowIso)

      for (const sourceId of unique(resolvedStep.sourceIds || [])) {
        await attachWorkflowEvidence(
          transactionId,
          updatedStep.id,
          {
            workflowKey,
            stepKey: canonicalStepKey,
            evidenceType: inferEvidenceTypeFromSourceId(sourceId, rollup),
            evidenceId: sourceId,
            evidenceStatus: ['complete', 'skipped', 'not_applicable'].includes(normalizeWorkflowStepStatus(resolvedStep.status))
              ? 'accepted'
              : 'observed',
          },
          { client },
        )
      }
    }
  }

  const persistedRollup = await persistTransactionRollup(transactionId, rollup, {
    client,
    reasonCode: options.reasonCode,
    triggerType: options.triggerType,
    triggerId: options.triggerId,
    createdBy: options.createdBy,
  })

  return {
    ...(await getWorkflowStateForTransaction(transactionId, { client, transaction })),
    persistedRollup,
  }
}

export function buildWorkflowStatusFromNormalizedSteps(steps = []) {
  const normalizedSteps = Array.isArray(steps) ? steps : []
  const relevantSteps = normalizedSteps.filter((step) => step?.required !== false)
  const completeStates = new Set(['complete', 'skipped', 'not_applicable'])
  const complete = relevantSteps.length > 0 && relevantSteps.every((step) => completeStates.has(normalizeWorkflowStepStatus(step.status)))
  const blocked = relevantSteps.some((step) => normalizeWorkflowStepStatus(step.status) === 'blocked' && step.blocking)
  const active = relevantSteps.some((step) => ['pending', 'complete', 'blocked'].includes(normalizeWorkflowStepStatus(step.status)))

  if (complete) return 'ready_for_handoff'
  if (blocked) return 'blocked'
  if (active) return 'active'
  return 'not_started'
}

export function buildWorkflowStateMap(normalizedState = {}) {
  const stepsByWorkflowKey = normalizedState.stepsByWorkflowKey || {}
  const evidenceByStepId = normalizedState.evidenceByStepId || {}
  const byKey = {}

  for (const instance of normalizedState.instances || []) {
    const steps = (stepsByWorkflowKey[instance.workflow_key] || []).map((step) => ({
      key: step.step_key,
      label: step.step_label,
      status: normalizeWorkflowStepStatus(step.status),
      ownerRole: step.owner_role,
      required: step.required !== false,
      blocking: step.blocking === true,
      sourceIds: (evidenceByStepId[step.id] || []).map((row) => row.evidence_id).filter(Boolean),
    }))
    const derivedBlockers = deriveWorkflowBlockers({
      workflowKey: instance.workflow_key,
      requiredSteps: steps,
    })
    byKey[instance.workflow_key] = {
      workflowKey: instance.workflow_key,
      status:
        instance.status === 'skipped' || instance.status === 'cancelled'
          ? normalizeWorkflowInstanceStatus(instance.status)
          : derivedBlockers.length
            ? 'blocked'
            : normalizeWorkflowInstanceStatus(buildWorkflowStatusFromNormalizedSteps(steps)),
      completionRatio: steps.length
        ? steps.filter((step) => ['complete', 'skipped', 'not_applicable'].includes(step.status)).length / steps.length
        : 1,
      requiredSteps: steps,
      blockers: derivedBlockers,
    }
  }

  return byKey
}

export async function isNormalizedWorkflowModelAvailable(client = null) {
  try {
    const db = client || requireClient()
    const query = await db.from('transaction_workflow_instances').select('id', { head: true, count: 'exact' }).limit(1)
    return !query.error || !isMissingTableError(query.error, 'transaction_workflow_instances')
  } catch {
    return false
  }
}
