import { getTransactionWorkflowReadModel } from '../../src/services/transactionWorkflowReadModelService.js'
import { requireClient, isMissingColumnError, isMissingTableError } from '../../src/services/attorneyFirmServiceShared.js'
import { resolveTransactionFacts } from '../../src/services/attorneyWorkflow/transactionFactsResolver.js'
import { buildWorkflowBlocker, dedupeBlockers } from './workflowBlockerFactory.js'
import { calculateProgressPercent, calculateWorkflowCompletionRatio } from './workflowProgressCalculator.js'
import {
  PARENT_STAGE_ENUM,
  deriveParentStatusFromRules,
  collectBlockedStages,
  collectCompletedStages,
  getActiveFinanceWorkflow,
  mapLegacyStageToCanonical,
  resolveParentStage,
  resolveWithFallback,
} from './workflowRollupRules.js'
import {
  getEvidenceUpdatedAt,
  isEvidenceSatisfied,
  pickEvidenceSources,
  resolveTransactionWorkflowEvidence,
} from './workflowEvidenceResolver.js'
import { resolveWorkflowAvailableActions } from './workflowActionAvailabilityService.js'
import { buildWorkflowStateMap, ensureTransactionWorkflowInstances } from './transactionWorkflowModelService.js'
import {
  getAttorneyLaneStepAliases,
  resolveRequiredAttorneyLanes,
} from './attorneyLaneResolver.js'
import { normaliseFinanceType, resolveFinanceWorkflowKey } from './financeWorkflowResolver.js'

const TRANSACTION_SELECT =
  'id, finance_type, onboarding_status, seller_onboarding_status, current_main_stage, stage, lifecycle_state, purchaser_type, transaction_type, property_type, development_id, seller_has_existing_bond, existing_bond, cancellation_required, registration_date, title_deed_number, registration_confirmation_document_id, created_at, updated_at, completed_at, cancelled_at, last_meaningful_activity_at'

const TRANSACTION_SELECT_FALLBACK =
  'id, finance_type, onboarding_status, seller_onboarding_status, current_main_stage, stage, lifecycle_state, purchaser_type, transaction_type, property_type, development_id, registration_date, title_deed_number, registration_confirmation_document_id, created_at, updated_at, completed_at, cancelled_at, last_meaningful_activity_at'

const DOCUMENT_SELECT =
  'id, transaction_id, name, document_name, category, document_type, stage_key, is_client_visible, status, created_at, updated_at'

const DOCUMENT_SELECT_FALLBACK =
  'id, transaction_id, name, document_name, category, stage_key, is_client_visible, status, created_at, updated_at'

const REQUIRED_DOCUMENT_SELECT =
  'id, transaction_id, document_key, requirement_key, status, is_uploaded, required_from_role, group_key, uploaded_document_id, created_at, updated_at'

const EVENT_SELECT =
  'id, transaction_id, event_type, event_data, visibility_scope, created_by_role, created_at'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function toIsoString(value) {
  const parsed = new Date(value || Date.now())
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString()
  }
  return parsed.toISOString()
}

function buildBlocker({ code, message, ownerRole, workflowKey, stepKey, requiredEvidence = [] }) {
  return buildWorkflowBlocker({
    code,
    message,
    ownerRole,
    workflowKey,
    stepKey,
    requiredEvidence,
    severity: 'hard',
  })
}

function normalizeTransactionRecord(row = {}, fallback = {}) {
  return {
    ...fallback,
    ...row,
    id: row.id || fallback.id || null,
    finance_type: row.finance_type || fallback.finance_type || fallback.financeType || null,
    onboarding_status: row.onboarding_status || fallback.onboarding_status || null,
    seller_onboarding_status: row.seller_onboarding_status || fallback.seller_onboarding_status || null,
    current_main_stage: row.current_main_stage || fallback.current_main_stage || fallback.currentMainStage || null,
    stage: row.stage || fallback.stage || null,
    lifecycle_state: row.lifecycle_state || fallback.lifecycle_state || fallback.lifecycleState || null,
    updated_at: row.updated_at || fallback.updated_at || fallback.updatedAt || null,
    created_at: row.created_at || fallback.created_at || fallback.createdAt || null,
  }
}

async function fetchTransactionRow(client, transactionId, fallback = {}) {
  const primary = await client.from('transactions').select(TRANSACTION_SELECT).eq('id', transactionId).maybeSingle()

  if (!primary.error) {
    return normalizeTransactionRecord(primary.data || {}, fallback)
  }

  if (isMissingColumnError(primary.error, 'seller_has_existing_bond')) {
    const secondary = await client.from('transactions').select(TRANSACTION_SELECT_FALLBACK).eq('id', transactionId).maybeSingle()
    if (!secondary.error) {
      return normalizeTransactionRecord(secondary.data || {}, fallback)
    }
  }

  if (isMissingTableError(primary.error, 'transactions')) {
    return normalizeTransactionRecord({}, fallback)
  }

  throw primary.error
}

async function fetchDocuments(client, transactionId) {
  const primary = await client.from('documents').select(DOCUMENT_SELECT).eq('transaction_id', transactionId)
  if (!primary.error) return primary.data || []

  if (isMissingTableError(primary.error, 'documents')) return []
  if (isMissingColumnError(primary.error, 'document_type')) {
    const fallback = await client.from('documents').select(DOCUMENT_SELECT_FALLBACK).eq('transaction_id', transactionId)
    if (!fallback.error) return fallback.data || []
  }

  throw primary.error
}

async function fetchRequiredDocuments(client, transactionId) {
  const query = await client.from('transaction_required_documents').select(REQUIRED_DOCUMENT_SELECT).eq('transaction_id', transactionId)
  if (!query.error) return query.data || []
  if (isMissingTableError(query.error, 'transaction_required_documents')) return []
  throw query.error
}

async function fetchEvents(client, transactionId) {
  const query = await client
    .from('transaction_events')
    .select(EVENT_SELECT)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(25)

  if (!query.error) return query.data || []
  if (isMissingTableError(query.error, 'transaction_events')) return []
  if (isMissingColumnError(query.error, 'visibility_scope')) {
    const fallback = await client
      .from('transaction_events')
      .select('id, transaction_id, event_type, event_data, created_by_role, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
      .limit(25)
    if (!fallback.error) return fallback.data || []
  }
  throw query.error
}

function createStep({ key, label, status, ownerRole, requiredEvidence = [], sourceIds = [], required = true, blocking = true }) {
  return {
    key,
    stepKey: key,
    label,
    stepLabel: label,
    status,
    ownerRole,
    required,
    blocking,
    actionKey: String(key || '').trim().toUpperCase(),
    nextActionLabel: label,
    requiredEvidence,
    sourceIds: [...new Set((sourceIds || []).filter(Boolean))],
  }
}

function resolveWorkflowStatus(requiredSteps = [], blockers = []) {
  const steps = Array.isArray(requiredSteps) ? requiredSteps : []
  const completeStates = new Set(['complete', 'skipped', 'not_applicable'])
  const allComplete = steps.length > 0 && steps.every((step) => completeStates.has(step.status))
  const anyProgress = steps.some((step) => ['pending', 'blocked', 'complete'].includes(step.status))

  if (allComplete) return 'ready_for_handoff'
  if ((blockers || []).length) return 'blocked'
  if (anyProgress) return 'active'
  return 'not_started'
}

function isCompleteStepStatus(status = '') {
  return ['complete', 'skipped', 'not_applicable'].includes(normalizeKey(status))
}

function buildEmptyWorkflow(workflowKey, { required = true } = {}) {
  return {
    workflowKey,
    status: required ? 'not_started' : 'skipped',
    completionRatio: required ? 0 : 1,
    requiredSteps: [],
    blockers: [],
    readyForHandoff: !required,
    required,
  }
}

function findLane(context = {}, laneKey = '') {
  return (context.readModel?.lanes || []).find((lane) => normalizeKey(lane?.laneKey) === normalizeKey(laneKey)) || null
}

function buildLaneStepMap(lane = null) {
  return new Map((lane?.steps || []).map((step) => [normalizeKey(step.key || step.stepKey), step]))
}

function resolveLaneStepState(stepMap = new Map(), aliases = [], fallback = 'not_started') {
  const matched = aliases
    .map((alias) => stepMap.get(normalizeKey(alias)))
    .filter(Boolean)
  if (!matched.length) return fallback
  if (matched.every((step) => normalizeKey(step.status) === 'completed')) return 'complete'
  if (matched.some((step) => ['blocked'].includes(normalizeKey(step.status)))) return 'blocked'
  if (matched.some((step) => ['completed', 'in_progress', 'waiting'].includes(normalizeKey(step.status)))) return 'pending'
  return fallback
}

function buildAttorneyRegistrationWorkflow({
  registrationWorkflow = buildEmptyWorkflow('registration'),
  allRequiredLodged = false,
} = {}) {
  const registrationStepMap = new Map((registrationWorkflow.requiredSteps || []).map((step) => [normalizeKey(step.key), step]))
  const registrationConfirmedStep = registrationStepMap.get('registration_confirmed') || null
  const registrationConfirmed = isCompleteStepStatus(registrationConfirmedStep?.status)
  const finalAccounts = registrationStepMap.get('final_accounts_complete') || null
  const matterClosed = registrationStepMap.get('matter_closed') || null
  const onPrep = registrationStepMap.get('on_prep') || null
  const deedsLinked = registrationStepMap.get('deeds_office_linked') || null

  const steps = [
    createStep({
      key: 'deeds_office_linked',
      label: 'Deeds office linked',
      status: registrationConfirmed || isCompleteStepStatus(deedsLinked?.status) ? 'complete' : allRequiredLodged ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      sourceIds: deedsLinked?.sourceIds || [],
      required: false,
      blocking: false,
    }),
    createStep({
      key: 'all_required_matters_lodged',
      label: 'All required matters lodged',
      status: allRequiredLodged ? 'complete' : 'pending',
      ownerRole: 'attorney',
      sourceIds: [],
    }),
    createStep({
      key: 'on_prep',
      label: 'On prep',
      status: registrationConfirmed || isCompleteStepStatus(onPrep?.status) ? 'complete' : allRequiredLodged ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      sourceIds: onPrep?.sourceIds || [],
      required: false,
      blocking: false,
    }),
    createStep({
      key: 'registration_confirmed',
      label: 'Registration confirmed',
      status: registrationConfirmed ? 'complete' : allRequiredLodged ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      requiredEvidence: registrationConfirmedStep?.requiredEvidence || ['REGISTRATION_LETTER'],
      sourceIds: registrationConfirmedStep?.sourceIds || [],
    }),
    createStep({
      key: 'final_accounts_complete',
      label: 'Final accounts complete',
      status: isCompleteStepStatus(finalAccounts?.status) ? 'complete' : registrationConfirmed ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      sourceIds: finalAccounts?.sourceIds || [],
      required: false,
      blocking: false,
    }),
    createStep({
      key: 'matter_closed',
      label: 'Matter closed',
      status: isCompleteStepStatus(matterClosed?.status) ? 'complete' : registrationConfirmed ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      sourceIds: matterClosed?.sourceIds || [],
      required: false,
      blocking: false,
    }),
  ]

  const blockers = !allRequiredLodged
    ? [
        buildBlocker({
          code: 'ALL_REQUIRED_MATTERS_NOT_LODGED',
          message: 'All required attorney matters must be lodged before registration can start.',
          ownerRole: 'attorney',
          workflowKey: 'registration',
          stepKey: 'all_required_matters_lodged',
        }),
      ]
    : !registrationConfirmed
      ? [
          buildBlocker({
            code: 'REGISTRATION_CONFIRMATION_REQUIRED',
            message: 'Registration confirmation evidence is still outstanding.',
            ownerRole: 'attorney',
            workflowKey: 'registration',
            stepKey: 'registration_confirmed',
            requiredEvidence: ['REGISTRATION_LETTER'],
          }),
        ]
      : []

  return {
    workflowKey: 'registration',
    status: registrationConfirmed ? 'complete' : resolveWorkflowStatus(steps, blockers),
    completionRatio: calculateWorkflowCompletionRatio(steps),
    requiredSteps: steps,
    blockers,
    readyForHandoff: registrationConfirmed,
    required: true,
  }
}

function resolveSalesOtpWorkflow(context) {
  const evidence = context.evidence || {}

  const buyerDone = isEvidenceSatisfied(evidence, 'BUYER_ONBOARDING_COMPLETE')
  const sellerDone = isEvidenceSatisfied(evidence, 'SELLER_ONBOARDING_COMPLETE')
  const generatedOtpDone = isEvidenceSatisfied(evidence, 'GENERATED_OTP_DOCUMENT')
  const signedOtpDone = isEvidenceSatisfied(evidence, 'SIGNED_OTP_DOCUMENT')
  const buyerFicaDone = isEvidenceSatisfied(evidence, 'BUYER_FICA_COMPLETE')
  const sellerFicaDone = isEvidenceSatisfied(evidence, 'SELLER_FICA_COMPLETE')
  const supportingDone = buyerFicaDone && sellerFicaDone

  const steps = [
    createStep({
      key: 'collect_buyer_details',
      label: 'Collect buyer details',
      status: buyerDone ? 'complete' : 'pending',
      ownerRole: 'buyer',
      requiredEvidence: ['BUYER_ONBOARDING_COMPLETE'],
      sourceIds: evidence.BUYER_ONBOARDING_COMPLETE?.sources || [],
    }),
    createStep({
      key: 'collect_seller_details',
      label: 'Collect seller details',
      status: sellerDone ? 'complete' : 'pending',
      ownerRole: 'seller',
      requiredEvidence: ['SELLER_ONBOARDING_COMPLETE'],
      sourceIds: evidence.SELLER_ONBOARDING_COMPLETE?.sources || [],
    }),
    createStep({
      key: 'generate_otp',
      label: 'Generate or release OTP',
      status: generatedOtpDone ? 'complete' : 'pending',
      ownerRole: 'agent',
      requiredEvidence: ['GENERATED_OTP_DOCUMENT'],
      sourceIds: evidence.GENERATED_OTP_DOCUMENT?.sources || [],
    }),
    createStep({
      key: 'sign_otp',
      label: 'Capture signed OTP',
      status: signedOtpDone ? 'complete' : 'pending',
      ownerRole: 'buyer',
      requiredEvidence: ['SIGNED_OTP_DOCUMENT'],
      sourceIds: evidence.SIGNED_OTP_DOCUMENT?.sources || [],
    }),
    createStep({
      key: 'collect_supporting_documents',
      label: 'Collect supporting documents',
      status: supportingDone ? 'complete' : signedOtpDone ? 'pending' : 'not_started',
      ownerRole: 'agent',
      requiredEvidence: ['BUYER_FICA_COMPLETE', 'SELLER_FICA_COMPLETE'],
      sourceIds: [
        ...(evidence.BUYER_FICA_COMPLETE?.sources || []),
        ...(evidence.SELLER_FICA_COMPLETE?.sources || []),
      ],
    }),
    createStep({
      key: 'ready_for_finance_handoff',
      label: 'Ready for Finance',
      status: buyerDone && sellerDone && generatedOtpDone && signedOtpDone && supportingDone ? 'complete' : supportingDone ? 'pending' : 'not_started',
      ownerRole: 'agent',
      sourceIds: [],
    }),
  ]

  const blockers = []
  if (!buyerDone) {
    blockers.push(
      buildBlocker({
        code: 'BUYER_DETAILS_REQUIRED',
        message: 'Buyer onboarding details must be complete before OTP can progress.',
        ownerRole: 'buyer',
        workflowKey: 'sales_otp',
        stepKey: 'collect_buyer_details',
        requiredEvidence: ['BUYER_ONBOARDING_COMPLETE'],
      }),
    )
  }
  if (!sellerDone) {
    blockers.push(
      buildBlocker({
        code: 'SELLER_DETAILS_REQUIRED',
        message: 'Seller onboarding details must be complete before OTP can progress.',
        ownerRole: 'seller',
        workflowKey: 'sales_otp',
        stepKey: 'collect_seller_details',
        requiredEvidence: ['SELLER_ONBOARDING_COMPLETE'],
      }),
    )
  }
  if (buyerDone && sellerDone && !generatedOtpDone) {
    blockers.push(
      buildBlocker({
        code: 'OTP_GENERATION_REQUIRED',
        message: 'The OTP must be generated before it can be signed.',
        ownerRole: 'agent',
        workflowKey: 'sales_otp',
        stepKey: 'generate_otp',
        requiredEvidence: ['GENERATED_OTP_DOCUMENT'],
      }),
    )
  }
  if (buyerDone && sellerDone && generatedOtpDone && !signedOtpDone) {
    blockers.push(
      buildBlocker({
        code: 'SIGNED_OTP_REQUIRED',
        message: 'Signed OTP is required before Finance can start.',
        ownerRole: 'buyer',
        workflowKey: 'sales_otp',
        stepKey: 'sign_otp',
        requiredEvidence: ['SIGNED_OTP_DOCUMENT'],
      }),
    )
  }
  if (signedOtpDone && !supportingDone) {
    blockers.push(
      buildBlocker({
        code: 'SUPPORTING_DOCUMENTS_REQUIRED',
        message: 'Required supporting documents must be complete before Finance can start.',
        ownerRole: 'agent',
        workflowKey: 'sales_otp',
        stepKey: 'collect_supporting_documents',
        requiredEvidence: ['BUYER_FICA_COMPLETE', 'SELLER_FICA_COMPLETE'],
      }),
    )
  }

  const readyForHandoff = buyerDone && sellerDone && generatedOtpDone && signedOtpDone && supportingDone
  const status = readyForHandoff ? 'ready_for_handoff' : resolveWorkflowStatus(steps, blockers)

  return {
    workflowKey: 'sales_otp',
    status,
    completionRatio: calculateWorkflowCompletionRatio(steps),
    requiredSteps: steps,
    blockers: dedupeBlockers(blockers),
    readyForHandoff,
  }
}

function resolveFinanceWorkflow(context) {
  const evidence = context.evidence || {}
  const financeType = normaliseFinanceType(context.transaction?.finance_type)

  const pofDone = isEvidenceSatisfied(evidence, 'POF_DOCUMENT')
  const bondApplicationDone = isEvidenceSatisfied(evidence, 'BOND_APPLICATION_SUBMITTED')
  const bondApprovalDone = isEvidenceSatisfied(evidence, 'BOND_APPROVAL_LETTER')
  const guaranteesDone = isEvidenceSatisfied(evidence, 'GUARANTEE_ISSUED')

  const steps = []
  const blockers = []
  let workflowKey = resolveFinanceWorkflowKey(context.transaction || {})

  if (financeType === 'unknown') {
    steps.push(
      createStep({
        key: 'finance_type_confirmed',
        label: 'Finance type confirmed',
        status: 'pending',
        ownerRole: 'agent',
      }),
    )
    blockers.push(
      buildBlocker({
        code: 'FINANCE_TYPE_REQUIRED',
        message: 'Finance type is required before the correct Finance workflow can start.',
        ownerRole: 'agent',
        workflowKey: 'finance_unknown',
        stepKey: 'finance_type_confirmed',
      }),
    )
    return {
      workflowKey: 'finance_unknown',
      status: 'blocked',
      completionRatio: calculateWorkflowCompletionRatio(steps),
      requiredSteps: steps,
      blockers,
      readyForHandoff: false,
      financeType,
      required: true,
    }
  }

  if (financeType === 'cash') {
    steps.push(
      createStep({
        key: 'proof_of_funds',
        label: 'Proof of funds uploaded',
        status: pofDone ? 'complete' : 'pending',
        ownerRole: 'buyer',
        requiredEvidence: ['POF_DOCUMENT'],
        sourceIds: evidence.POF_DOCUMENT?.sources || [],
      }),
    )
    if (!pofDone) {
      blockers.push(
        buildBlocker({
          code: 'PROOF_OF_FUNDS_REQUIRED',
          message: 'Proof of funds is required before Transfer can start.',
          ownerRole: 'buyer',
          workflowKey,
          stepKey: 'proof_of_funds',
          requiredEvidence: ['POF_DOCUMENT'],
        }),
      )
    }
    steps.push(
      createStep({
        key: 'ready_for_transfer',
        label: 'Ready for Transfer',
        status: pofDone ? 'complete' : 'not_started',
        ownerRole: 'agent',
        sourceIds: [],
      }),
    )
  }

  if (financeType === 'bond' || financeType === 'hybrid') {
    steps.push(
      createStep({
        key: 'bond_application',
        label: 'Bond application submitted',
        status: bondApplicationDone ? 'complete' : 'pending',
        ownerRole: 'buyer',
        requiredEvidence: ['BOND_APPLICATION_SUBMITTED'],
        sourceIds: evidence.BOND_APPLICATION_SUBMITTED?.sources || [],
      }),
    )
    steps.push(
      createStep({
        key: 'bond_approval',
        label: 'Bond approval received',
        status: bondApprovalDone ? 'complete' : bondApplicationDone ? 'pending' : 'not_started',
        ownerRole: 'buyer',
        requiredEvidence: ['BOND_APPROVAL_LETTER'],
        sourceIds: evidence.BOND_APPROVAL_LETTER?.sources || [],
      }),
    )
    steps.push(
      createStep({
        key: 'guarantees',
        label: 'Guarantees or grant issued',
        status: guaranteesDone ? 'complete' : bondApprovalDone ? 'pending' : 'not_started',
        ownerRole: 'bank',
        requiredEvidence: ['GUARANTEE_ISSUED'],
        sourceIds: evidence.GUARANTEE_ISSUED?.sources || [],
      }),
    )

    if (!bondApplicationDone) {
      blockers.push(
        buildBlocker({
          code: 'BOND_APPLICATION_NOT_SUBMITTED',
          message: 'Bond application submission is required before Transfer can start.',
          ownerRole: 'buyer',
          workflowKey,
          stepKey: 'bond_application',
          requiredEvidence: ['BOND_APPLICATION_SUBMITTED'],
        }),
      )
    } else if (!bondApprovalDone) {
      blockers.push(
        buildBlocker({
          code: 'BOND_APPROVAL_REQUIRED',
          message: 'Bond approval is required before Transfer can start.',
          ownerRole: 'buyer',
          workflowKey,
          stepKey: 'bond_approval',
          requiredEvidence: ['BOND_APPROVAL_LETTER'],
        }),
      )
    } else if (!guaranteesDone) {
      blockers.push(
        buildBlocker({
          code: 'GUARANTEES_REQUIRED',
          message: 'Guarantees or grant evidence is required before Transfer can start.',
          ownerRole: 'bank',
          workflowKey,
          stepKey: 'guarantees',
          requiredEvidence: ['GUARANTEE_ISSUED'],
        }),
      )
    }
  }

  if (financeType === 'hybrid') {
    steps.push(
      createStep({
        key: 'cash_portion_confirmation',
        label: 'Cash contribution confirmed',
        status: pofDone ? 'complete' : 'pending',
        ownerRole: 'buyer',
        requiredEvidence: ['POF_DOCUMENT'],
        sourceIds: evidence.POF_DOCUMENT?.sources || [],
      }),
    )

    if (!pofDone) {
      blockers.unshift(
        buildBlocker({
          code: 'CASH_PORTION_REQUIRED',
          message: 'Proof of cash contribution is required before Transfer can start.',
          ownerRole: 'buyer',
          workflowKey,
          stepKey: 'cash_portion_confirmation',
          requiredEvidence: ['POF_DOCUMENT'],
        }),
      )
    }
  }

  if (financeType === 'bond' || financeType === 'hybrid') {
    const transferReady = financeType === 'bond'
      ? bondApplicationDone && bondApprovalDone && guaranteesDone
      : pofDone && bondApplicationDone && bondApprovalDone && guaranteesDone

    steps.push(
      createStep({
        key: 'ready_for_transfer',
        label: 'Ready for Transfer',
        status: transferReady ? 'complete' : guaranteesDone || pofDone ? 'pending' : 'not_started',
        ownerRole: financeType === 'bond' ? 'bank' : 'agent',
        sourceIds: [],
      }),
    )
  }

  const readyForHandoff =
    financeType === 'cash'
      ? pofDone
      : financeType === 'bond'
        ? bondApplicationDone && bondApprovalDone && guaranteesDone
        : pofDone && bondApplicationDone && bondApprovalDone && guaranteesDone

  const status = readyForHandoff ? 'ready_for_handoff' : resolveWorkflowStatus(steps, blockers)

  return {
    workflowKey,
    status,
    completionRatio: calculateWorkflowCompletionRatio(steps),
    requiredSteps: steps,
    blockers: dedupeBlockers(blockers),
    readyForHandoff,
    financeType,
  }
}

function resolveSellerBondCancellationWorkflow(context) {
  const evidence = context.evidence || {}
  const requirements = resolveRequiredAttorneyLanes(context.transaction || {}, {
    facts: context.facts,
    readModel: context.readModel,
  })
  const required = requirements.seller_bond_cancellation.required
  const lane = findLane(context, 'cancellation')
  const stepMap = buildLaneStepMap(lane)

  if (!required) {
    return buildEmptyWorkflow('seller_bond_cancellation', { required: false })
  }

  const figuresReceived = resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'cancellation_figures_received'), 'pending')
  const documentsPrepared = resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'cancellation_documents_prepared'), 'not_started')
  const documentsSigned = resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'cancellation_documents_signed'), 'not_started')
  const guaranteesReceived =
    isEvidenceSatisfied(evidence, 'MORTGAGE_CANCELLATION_AUTH') ||
    resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'guarantees_received'), 'not_started') === 'complete'
  const lodged = resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'lodged'), 'not_started')
  const readyForLodgement = lodged === 'complete'
    ? 'complete'
    : figuresReceived === 'complete' && documentsPrepared === 'complete' && documentsSigned === 'complete' && guaranteesReceived
      ? 'complete'
      : documentsPrepared === 'complete' || documentsSigned === 'complete' || guaranteesReceived
        ? 'pending'
        : 'not_started'

  const steps = [
    createStep({
      key: 'cancellation_instruction_received',
      label: 'Cancellation instruction received',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'cancellation_instruction_received'), 'pending'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('cancellation_instruction_received')?.id].filter(Boolean),
    }),
    createStep({
      key: 'cancellation_figures_requested',
      label: 'Cancellation figures requested',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'cancellation_figures_requested'), 'pending'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('cancellation_figures_requested')?.id].filter(Boolean),
    }),
    createStep({
      key: 'cancellation_figures_received',
      label: 'Cancellation figures received',
      status: figuresReceived,
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('cancellation_figures_received')?.id].filter(Boolean),
    }),
    createStep({
      key: 'cancellation_documents_prepared',
      label: 'Cancellation documents prepared',
      status: lodged === 'complete' ? 'complete' : documentsPrepared,
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('cancellation_documents_prepared')?.id].filter(Boolean),
    }),
    createStep({
      key: 'cancellation_documents_signed',
      label: 'Cancellation documents signed',
      status: lodged === 'complete' ? 'complete' : documentsSigned,
      ownerRole: 'attorney',
      sourceIds: [
        stepMap.get('cancellation_documents_signed')?.id,
      ].filter(Boolean),
    }),
    createStep({
      key: 'guarantees_received',
      label: 'Guarantees received',
      status: guaranteesReceived ? 'complete' : 'pending',
      ownerRole: 'attorney',
      requiredEvidence: ['MORTGAGE_CANCELLATION_AUTH'],
      sourceIds: [
        ...(evidence.MORTGAGE_CANCELLATION_AUTH?.sources || []),
        stepMap.get('guarantees_accepted')?.id,
      ].filter(Boolean),
    }),
    createStep({
      key: 'ready_for_lodgement',
      label: 'Ready for lodgement',
      status: readyForLodgement,
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('cancellation_lodgement_ready')?.id].filter(Boolean),
    }),
    createStep({
      key: 'lodged',
      label: 'Lodged',
      status: lodged,
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('cancellation_lodged')?.id].filter(Boolean),
    }),
    createStep({
      key: 'prep_for_registration',
      label: 'Prep for registration',
      status: lodged === 'complete' ? resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('seller_bond_cancellation', 'prep_for_registration'), 'pending') : 'not_started',
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('cancellation_registered')?.id].filter(Boolean),
      required: false,
      blocking: false,
    }),
  ]

  const blockers = lodged === 'complete'
    ? []
    : figuresReceived !== 'complete'
      ? [
        buildBlocker({
          code: 'CANCELLATION_FIGURES_REQUIRED',
          message: 'Cancellation figures are required before the cancellation matter can be lodged.',
          ownerRole: 'cancellation_attorney',
          workflowKey: 'seller_bond_cancellation',
          stepKey: 'cancellation_figures_received',
        }),
      ]
      : documentsSigned !== 'complete'
        ? [
            buildBlocker({
              code: 'CANCELLATION_DOCUMENTS_NOT_SIGNED',
              message: 'Cancellation documents must be signed before the cancellation matter can be lodged.',
              ownerRole: 'cancellation_attorney',
              workflowKey: 'seller_bond_cancellation',
              stepKey: 'cancellation_documents_signed',
            }),
          ]
        : []

  return {
    workflowKey: 'seller_bond_cancellation',
    status: lodged === 'complete' ? 'ready_for_handoff' : resolveWorkflowStatus(steps, blockers),
    completionRatio: calculateWorkflowCompletionRatio(steps),
    requiredSteps: steps,
    blockers,
    readyForHandoff: lodged === 'complete',
    required,
  }
}

function resolveAttorneyBondWorkflow(context) {
  const requirements = resolveRequiredAttorneyLanes(context.transaction || {}, {
    facts: context.facts,
    readModel: context.readModel,
  })
  const required = requirements.attorney_bond.required
  const bondLane = findLane(context, 'bond')

  if (!required) {
    return buildEmptyWorkflow('attorney_bond', { required: false })
  }

  const stepMap = buildLaneStepMap(bondLane)
  const lodged = resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'lodged'), 'not_started')
  const steps = [
    createStep({
      key: 'bond_instruction_received',
      label: 'Bond instruction received',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'bond_instruction_received'), 'pending'),
      ownerRole: 'bond_attorney',
      sourceIds: stepMap.get('bond_instruction_received')?.id ? [stepMap.get('bond_instruction_received').id] : [],
    }),
    createStep({
      key: 'bond_documents_requested',
      label: 'Bond documents requested',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'bond_documents_requested'), 'pending'),
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('bond_documents_requested')?.id].filter(Boolean),
    }),
    createStep({
      key: 'bond_documents_received',
      label: 'Bond documents received',
      status: lodged === 'complete' ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'bond_documents_received'), 'pending'),
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('bond_documents_received')?.id].filter(Boolean),
    }),
    createStep({
      key: 'bond_documents_prepared',
      label: 'Bond documents prepared',
      status: lodged === 'complete' ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'bond_documents_prepared'), 'pending'),
      ownerRole: 'bond_attorney',
      sourceIds: stepMap.get('bond_documents_prepared')?.id ? [stepMap.get('bond_documents_prepared').id] : [],
    }),
    createStep({
      key: 'bond_documents_signed',
      label: 'Bond documents signed',
      status: lodged === 'complete' ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'bond_documents_signed'), 'not_started'),
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('buyer_signed_bond_documents')?.id].filter(Boolean),
    }),
    createStep({
      key: 'bank_conditions_received',
      label: 'Bank conditions received',
      status: lodged === 'complete' ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'bank_conditions_received'), 'not_started'),
      ownerRole: 'bond_attorney',
      sourceIds: [
        stepMap.get('bank_requirements_confirmed')?.id,
        stepMap.get('bank_conditions_reviewed')?.id,
      ].filter(Boolean),
    }),
    createStep({
      key: 'bank_conditions_satisfied',
      label: 'Bank conditions satisfied',
      status: lodged === 'complete' ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'bank_conditions_satisfied'), 'not_started'),
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('grant_signed')?.id].filter(Boolean),
    }),
    createStep({
      key: 'guarantees_issued',
      label: 'Guarantees issued',
      status: lodged === 'complete' ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'guarantees_issued'), 'not_started'),
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('guarantees_issued')?.id].filter(Boolean),
    }),
    createStep({
      key: 'ready_for_lodgement',
      label: 'Ready for lodgement',
      status: lodged === 'complete' ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'ready_for_lodgement'), 'not_started'),
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('bond_lodgement_ready')?.id, stepMap.get('bond_lodgement_pack_prepared')?.id].filter(Boolean),
    }),
    createStep({
      key: 'lodged',
      label: 'Lodged',
      status: lodged,
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('bond_lodgement_submitted')?.id, stepMap.get('bond_lodged')?.id].filter(Boolean),
    }),
    createStep({
      key: 'prep_for_registration',
      label: 'Prep for registration',
      status: lodged === 'complete' ? resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_bond', 'prep_for_registration'), 'pending') : 'not_started',
      ownerRole: 'bond_attorney',
      sourceIds: [stepMap.get('bond_registered')?.id].filter(Boolean),
      required: false,
      blocking: false,
    }),
  ]

  const blockers = lodged === 'complete'
    ? []
    : [
        buildBlocker({
          code: 'BANK_CONDITIONS_NOT_SATISFIED',
          message: 'Bank conditions must be satisfied before the bond matter can be lodged.',
          ownerRole: 'bond_attorney',
          workflowKey: 'attorney_bond',
          stepKey:
            steps.find((step) => step.key === 'bank_conditions_satisfied' && step.status !== 'complete')?.key ||
            steps.find((step) => step.status !== 'complete' && step.required !== false)?.key,
        }),
      ]

  return {
    workflowKey: 'attorney_bond',
    status: blockers.length ? resolveWorkflowStatus(steps, blockers) : 'ready_for_handoff',
    completionRatio: calculateWorkflowCompletionRatio(steps),
    requiredSteps: steps,
    blockers,
    readyForHandoff: lodged === 'complete',
    required,
  }
}

function resolveAttorneyTransferWorkflow(context, dependencies = {}) {
  const evidence = context.evidence || {}
  const transferLane = findLane(context, 'transfer')
  const stepMap = buildLaneStepMap(transferLane)

  const docsPrepared = resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'transfer_documents_prepared'), 'pending') === 'complete'
  const signedDocs =
    isEvidenceSatisfied(evidence, 'TRANSFER_SIGNED_DOCS') ||
    (resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'transfer_documents_signed'), 'not_started') === 'complete')
  const ratesDone = isEvidenceSatisfied(evidence, 'CONVEYANCING_DUTY_RECEIPT') || resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'clearance_figures_received'), 'not_started') === 'complete'
  const lodged = resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'lodged'), 'not_started') === 'complete'

  const steps = [
    createStep({
      key: 'instruction_received',
      label: 'Instruction received',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'instruction_received'), 'pending'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('instruction_received')?.id].filter(Boolean),
    }),
    createStep({
      key: 'transfer_documents_requested',
      label: 'Transfer documents requested',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'transfer_documents_requested'), 'pending'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('fica_requested')?.id, stepMap.get('transfer_documents_requested')?.id].filter(Boolean),
    }),
    createStep({
      key: 'transfer_documents_received',
      label: 'Transfer documents received',
      status: docsPrepared || signedDocs || lodged ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'transfer_documents_received'), 'pending'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('fica_received')?.id, stepMap.get('transfer_documents_received')?.id].filter(Boolean),
    }),
    createStep({
      key: 'transfer_documents_prepared',
      label: 'Transfer documents prepared',
      status: docsPrepared || signedDocs || lodged ? 'complete' : 'pending',
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('transfer_documents_prepared')?.id].filter(Boolean),
    }),
    createStep({
      key: 'transfer_documents_signed',
      label: 'Transfer documents signed',
      status: signedDocs ? 'complete' : docsPrepared ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      requiredEvidence: ['TRANSFER_SIGNED_DOCS'],
      sourceIds: [
        ...(evidence.TRANSFER_SIGNED_DOCS?.sources || []),
        stepMap.get('buyer_signed_transfer_documents')?.id,
        stepMap.get('seller_signed_transfer_documents')?.id,
      ].filter(Boolean),
    }),
    createStep({
      key: 'clearance_figures_requested',
      label: 'Clearance figures requested',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'clearance_figures_requested'), 'pending'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('clearances_requested')?.id].filter(Boolean),
    }),
    createStep({
      key: 'clearance_figures_received',
      label: 'Clearance figures received',
      status: ratesDone ? 'complete' : signedDocs ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      requiredEvidence: ['CONVEYANCING_DUTY_RECEIPT'],
      sourceIds: [
        ...(evidence.CONVEYANCING_DUTY_RECEIPT?.sources || []),
        stepMap.get('rates_clearance_uploaded')?.id,
        stepMap.get('clearances_received')?.id,
      ].filter(Boolean),
    }),
    createStep({
      key: 'transfer_duty_requested',
      label: 'Transfer duty requested',
      status: resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'transfer_duty_requested'), signedDocs ? 'pending' : 'not_started'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('transfer_duty_requested')?.id].filter(Boolean),
    }),
    createStep({
      key: 'transfer_duty_received',
      label: 'Transfer duty received',
      status: lodged ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'transfer_duty_received'), ratesDone ? 'pending' : 'not_started'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('transfer_duty_received')?.id].filter(Boolean),
    }),
    createStep({
      key: 'guarantees_confirmed',
      label: 'Guarantees confirmed',
      status: lodged ? 'complete' : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'guarantees_confirmed'), ratesDone ? 'pending' : 'not_started'),
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('guarantees_received')?.id].filter(Boolean),
    }),
    createStep({
      key: 'ready_for_lodgement',
      label: 'Ready for lodgement',
      status: lodged
        ? 'complete'
        : resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'ready_for_lodgement'), ratesDone ? 'pending' : 'not_started'),
      ownerRole: 'attorney',
      sourceIds: [
        stepMap.get('lodgement_ready')?.id,
        stepMap.get('lodgement_pack_prepared')?.id,
      ].filter(Boolean),
    }),
    createStep({
      key: 'lodged',
      label: 'Lodged',
      status: lodged ? 'complete' : ratesDone ? 'pending' : 'not_started',
      ownerRole: 'attorney',
      sourceIds: [stepMap.get('lodgement_submitted')?.id, stepMap.get('lodged')?.id].filter(Boolean),
    }),
    createStep({
      key: 'prep_for_registration',
      label: 'Prep for registration',
      status:
        lodged ? resolveLaneStepState(stepMap, getAttorneyLaneStepAliases('attorney_transfer', 'prep_for_registration'), 'pending') : 'not_started',
      ownerRole: 'attorney',
      sourceIds: [],
      required: false,
      blocking: false,
    }),
  ]

  const blockers = []
  if (!docsPrepared) {
    blockers.push(
      buildBlocker({
        code: 'TRANSFER_DOCUMENTS_REQUIRED',
        message: 'Transfer documents must be prepared before registration handoff.',
        ownerRole: 'attorney',
        workflowKey: 'attorney_transfer',
        stepKey: 'transfer_documents_prepared',
      }),
    )
  } else if (!signedDocs) {
    blockers.push(
      buildBlocker({
        code: 'TRANSFER_DOCUMENTS_NOT_SIGNED',
        message: 'Transfer documents must be signed before lodgement.',
        ownerRole: 'attorney',
        workflowKey: 'attorney_transfer',
        stepKey: 'transfer_documents_signed',
        requiredEvidence: ['TRANSFER_SIGNED_DOCS'],
      }),
    )
  } else if (!ratesDone) {
    blockers.push(
      buildBlocker({
        code: 'CLEARANCES_REQUIRED',
        message: 'Rates or related clearance evidence is required before registration handoff.',
        ownerRole: 'attorney',
        workflowKey: 'attorney_transfer',
        stepKey: 'clearance_figures_received',
        requiredEvidence: ['CONVEYANCING_DUTY_RECEIPT'],
      }),
    )
  }

  if (dependencies.sellerBondCancellation?.required && !dependencies.sellerBondCancellation.readyForHandoff) {
    blockers.push(...(dependencies.sellerBondCancellation.blockers || []))
  }
  if (dependencies.attorneyBond?.required && !dependencies.attorneyBond.readyForHandoff) {
    blockers.push(...(dependencies.attorneyBond.blockers || []))
  }

  const readyForHandoff =
    lodged &&
    (!dependencies.sellerBondCancellation?.required || dependencies.sellerBondCancellation.readyForHandoff) &&
    (!dependencies.attorneyBond?.required || dependencies.attorneyBond.readyForHandoff)

  const status = readyForHandoff ? 'ready_for_handoff' : resolveWorkflowStatus(steps, blockers)

  return {
    workflowKey: 'attorney_transfer',
    status,
    completionRatio: calculateWorkflowCompletionRatio(steps),
    requiredSteps: steps,
    blockers: dedupeBlockers(blockers),
    readyForHandoff,
  }
}

function resolveRegistrationWorkflow(context, dependencies = {}) {
  const evidence = context.evidence || {}
  const transferLane = findLane(context, 'transfer')
  const stepMap = buildLaneStepMap(transferLane)
  const registrationConfirmed =
    isEvidenceSatisfied(evidence, 'REGISTRATION_LETTER') || normalizeKey(stepMap.get('registration_confirmed')?.status) === 'completed'
  const allRequiredLodged =
    Boolean(dependencies.attorneyTransfer?.readyForHandoff) &&
    (!dependencies.attorneyBond?.required || dependencies.attorneyBond.readyForHandoff) &&
    (!dependencies.sellerBondCancellation?.required || dependencies.sellerBondCancellation.readyForHandoff)

  return buildAttorneyRegistrationWorkflow({
    registrationWorkflow: {
      workflowKey: 'registration',
      requiredSteps: [
        createStep({
          key: 'registration_confirmed',
          label: 'Registration confirmed',
          status: registrationConfirmed ? 'complete' : allRequiredLodged ? 'pending' : 'not_started',
          ownerRole: 'attorney',
          requiredEvidence: ['REGISTRATION_LETTER'],
          sourceIds: [
            ...(evidence.REGISTRATION_LETTER?.sources || []),
            stepMap.get('registration_confirmed')?.id,
          ].filter(Boolean),
        }),
      ],
    },
    allRequiredLodged,
  })
}

function resolveActiveWorkflowForParent(parentStage, workflows = {}) {
  if (parentStage === PARENT_STAGE_ENUM.SETUP) {
    return null
  }
  if (parentStage === PARENT_STAGE_ENUM.SALES_OTP) {
    return workflows.sales_otp
  }
  if (parentStage === PARENT_STAGE_ENUM.FINANCE) {
    return workflows.finance
  }
  if (parentStage === PARENT_STAGE_ENUM.TRANSFER) {
    if (workflows.seller_bond_cancellation?.required && workflows.seller_bond_cancellation.status !== 'ready_for_handoff') {
      return workflows.seller_bond_cancellation
    }
    if (workflows.attorney_bond?.required && workflows.attorney_bond.status !== 'ready_for_handoff') {
      return workflows.attorney_bond
    }
    return workflows.attorney_transfer || workflows.transfer
  }
  if (parentStage === PARENT_STAGE_ENUM.REGISTRATION) {
    return workflows.registration
  }
  return null
}

function resolveActiveStep(activeWorkflow = null) {
  if (!activeWorkflow || !Array.isArray(activeWorkflow.requiredSteps)) return null
  return activeWorkflow.requiredSteps.find((step) => !['complete', 'skipped', 'not_applicable'].includes(step.status)) || null
}

function resolveNextAction(activeWorkflow = null, activeStep = null) {
  if (!activeWorkflow || !activeStep) return null
  return {
    label: activeStep.nextActionLabel || activeStep.stepLabel || activeStep.label,
    ownerRole: activeStep.ownerRole || 'system',
    actionKey: activeStep.actionKey || String(activeStep.key || '').toUpperCase(),
    workflowKey: activeWorkflow.workflowKey,
    stepKey: activeStep.key,
  }
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

function buildDerivedFromFromNormalizedState(normalizedState = {}) {
  const evidenceRows = normalizedState.evidence || []
  return {
    transactionFields: [
      'current_main_stage',
      'stage',
      'finance_type',
      'onboarding_status',
      'seller_onboarding_status',
      'seller_has_existing_bond',
      'lifecycle_state',
      'updated_at',
    ],
    workflowStepIds: unique((normalizedState.steps || []).map((row) => row.id)),
    documentIds: unique(evidenceRows.filter((row) => row.evidence_type === 'document').map((row) => row.evidence_id)),
    checklistItemIds: unique(evidenceRows.filter((row) => row.evidence_type === 'checklist_item').map((row) => row.evidence_id)),
    eventIds: unique(evidenceRows.filter((row) => row.evidence_type === 'event').map((row) => row.evidence_id)),
  }
}

function resolveDerivedAtFromNormalizedState(normalizedState = {}) {
  const timestamps = [
    normalizedState.rollup?.derived_at,
    normalizedState.transaction?.updated_at,
    ...((normalizedState.instances || []).map((row) => row.updated_at)),
    ...((normalizedState.steps || []).map((row) => row.updated_at)),
    ...((normalizedState.evidence || []).map((row) => row.created_at)),
  ]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)

  if (!timestamps.length) return new Date().toISOString()
  return new Date(Math.max(...timestamps)).toISOString()
}

function buildParentWorkflowsFromNormalizedState(normalizedState = {}) {
  const workflowMap = buildWorkflowStateMap(normalizedState)
  const laneRequirements = resolveRequiredAttorneyLanes(normalizedState.transaction || {})
  const salesOtp = workflowMap.sales_otp || {
    workflowKey: 'sales_otp',
    status: 'not_started',
    completionRatio: 0,
    requiredSteps: [],
    blockers: [],
  }
  const finance = getActiveFinanceWorkflow(normalizedState.transaction || {}, workflowMap)
  const attorneyTransfer = {
    ...(workflowMap.attorney_transfer || buildEmptyWorkflow('attorney_transfer')),
    required: true,
  }
  const attorneyBond = {
    ...(workflowMap.attorney_bond || buildEmptyWorkflow('attorney_bond', { required: laneRequirements.attorney_bond.required })),
    required: laneRequirements.attorney_bond.required,
  }
  const sellerBondCancellation = {
    ...(workflowMap.seller_bond_cancellation || buildEmptyWorkflow('seller_bond_cancellation', { required: laneRequirements.seller_bond_cancellation.required })),
    required: laneRequirements.seller_bond_cancellation.required,
  }

  const transferSteps = [
    ...(attorneyTransfer.requiredSteps || []),
    ...(attorneyBond.required ? attorneyBond.requiredSteps || [] : []),
    ...(sellerBondCancellation.required ? sellerBondCancellation.requiredSteps || [] : []),
  ]
  const transferBlockers = dedupeBlockers([
    ...(attorneyTransfer.blockers || []),
    ...(attorneyBond.required ? attorneyBond.blockers || [] : []),
    ...(sellerBondCancellation.required ? sellerBondCancellation.blockers || [] : []),
  ])
  const allRequiredAttorneyLanesLodged =
    ['ready_for_handoff', 'complete'].includes(attorneyTransfer.status || 'not_started') &&
    (!attorneyBond.required || ['ready_for_handoff', 'complete'].includes(attorneyBond.status || 'not_started')) &&
    (!sellerBondCancellation.required || ['ready_for_handoff', 'complete'].includes(sellerBondCancellation.status || 'not_started'))
  const transfer = {
    workflowKey: 'transfer',
    status: allRequiredAttorneyLanesLodged ? 'ready_for_handoff' : resolveWorkflowStatus(transferSteps, transferBlockers),
    completionRatio: calculateWorkflowCompletionRatio(transferSteps),
    requiredSteps: transferSteps,
    blockers: transferBlockers,
    readyForHandoff: allRequiredAttorneyLanesLodged,
  }
  const registration = buildAttorneyRegistrationWorkflow({
    registrationWorkflow: workflowMap.registration || buildEmptyWorkflow('registration'),
    allRequiredLodged: allRequiredAttorneyLanesLodged,
  })

  return {
    parentWorkflows: {
      sales_otp: salesOtp,
      finance,
      transfer,
      registration,
    },
    allWorkflows: {
      ...workflowMap,
      sales_otp: salesOtp,
      finance,
      transfer,
      registration,
      attorney_transfer: attorneyTransfer,
      attorney_bond: attorneyBond,
      seller_bond_cancellation: sellerBondCancellation,
    },
  }
}

function buildRollupResult({
  transactionId,
  transaction,
  parentWorkflows,
  allWorkflows,
  evidenceUsed = [],
  derivedFrom = {},
  derivedAt = null,
  rolePlayers = [],
  actorRole = '',
}) {
  const fallback = resolveWithFallback(transaction, parentWorkflows, ({ transaction: nextTransaction, workflows }) =>
    resolveParentStage(workflows, nextTransaction),
  )
  const parentStage = fallback.value
  const activeWorkflow = resolveActiveWorkflowForParent(parentStage, allWorkflows)
  const activeStep = resolveActiveStep(activeWorkflow)
  const blockers = dedupeBlockers(
    parentStage === PARENT_STAGE_ENUM.SALES_OTP
      ? parentWorkflows.sales_otp.blockers
      : parentStage === PARENT_STAGE_ENUM.FINANCE
        ? parentWorkflows.finance.blockers
        : parentStage === PARENT_STAGE_ENUM.TRANSFER
          ? parentWorkflows.transfer.blockers
          : parentStage === PARENT_STAGE_ENUM.REGISTRATION
            ? parentWorkflows.registration.blockers
            : [],
  )
  const parentStatus = deriveParentStatusFromRules({
    parentStage,
    workflows: parentWorkflows,
    activeWorkflow,
    blockers,
  })

  return {
    transactionId,
    parentStage,
    parentStatus,
    progressPercent: calculateProgressPercent(parentWorkflows),
    activeWorkflowKey: activeWorkflow?.workflowKey || null,
    activeStepKey: activeStep?.key || null,
    completedStages: collectCompletedStages(parentWorkflows, transaction),
    blockedStages: collectBlockedStages(parentWorkflows, transaction),
    blockers,
    nextAction: resolveNextAction(activeWorkflow, activeStep),
    availableActions: resolveWorkflowAvailableActions({
      transaction,
      parentStage,
      parentStatus,
      activeWorkflow,
      workflows: allWorkflows,
      blockers,
      rolePlayers,
      actorRole,
    }),
    derivedAt: toIsoString(derivedAt || transaction.updated_at || Date.now()),
    evidenceUsed: unique(evidenceUsed),
    derivedFrom,
    usedLegacyFallback: fallback.usedLegacyFallback,
    legacy: {
      currentMainStage: transaction.current_main_stage || null,
      stage: transaction.stage || null,
      mappedParentStage: mapLegacyStageToCanonical(transaction),
    },
    workflows: allWorkflows,
  }
}

function buildDerivedFrom(context, workflows = {}) {
  const workflowStepIds = []
  const checklistItemIds = []
  const documentIds = []
  const eventIds = []

  for (const workflow of Object.values(workflows)) {
    for (const step of workflow?.requiredSteps || []) {
      for (const sourceId of step.sourceIds || []) {
        if (!workflowStepIds.includes(sourceId)) {
          workflowStepIds.push(sourceId)
        }
      }
    }
  }

  for (const item of context.documents || []) {
    if (item.id && !documentIds.includes(item.id)) {
      documentIds.push(item.id)
    }
  }
  for (const item of context.requiredDocuments || []) {
    const id = item.uploaded_document_id || item.id
    if (id && !documentIds.includes(id)) {
      documentIds.push(id)
    }
  }
  for (const item of context.checklistItems || []) {
    if (item.id && !checklistItemIds.includes(item.id)) {
      checklistItemIds.push(item.id)
    }
  }
  for (const event of context.events || []) {
    if (event.id && !eventIds.includes(event.id)) {
      eventIds.push(event.id)
    }
  }

  return {
    transactionFields: [
      'current_main_stage',
      'stage',
      'finance_type',
      'onboarding_status',
      'seller_onboarding_status',
      'seller_has_existing_bond',
      'lifecycle_state',
      'updated_at',
    ],
    workflowStepIds,
    documentIds,
    checklistItemIds,
    eventIds,
  }
}

async function buildContext(transactionId, options = {}) {
  if (options.context) {
    return {
      transactionId,
      transaction: normalizeTransactionRecord(options.context.transaction || { id: transactionId }),
      readModel: {
        lanes: options.context.lanes || [],
        checklistItems: options.context.checklistItems || [],
        documentRequests: options.context.documentRequests || [],
        rolePlayers: options.context.rolePlayers || [],
        warnings: options.context.warnings || [],
      },
      documents: options.context.documents || [],
      requiredDocuments: options.context.requiredDocuments || [],
      events: options.context.events || [],
    }
  }

  const client = options.client || requireClient()
  const readModel = await getTransactionWorkflowReadModel(transactionId, { client })
  const transaction = await fetchTransactionRow(client, transactionId, readModel.transaction || {})
  const [documents, requiredDocuments, events] = await Promise.all([
    fetchDocuments(client, transactionId),
    fetchRequiredDocuments(client, transactionId),
    fetchEvents(client, transactionId),
  ])

  return {
    transactionId,
    transaction,
    readModel,
    documents,
    requiredDocuments,
    events,
  }
}

export async function resolveTransactionRollup(transactionId, options = {}) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction id is required.')
  }

  const context = await buildContext(normalizedTransactionId, options)
  const normalizedState =
    options.preferLegacy === true
      ? null
      : options.normalizedState ||
        (options.context && !options.client
          ? null
          : await ensureTransactionWorkflowInstances(normalizedTransactionId, {
              client: options.client,
              transaction: context.transaction,
            }))

  if (normalizedState?.instances?.length) {
    const { parentWorkflows, allWorkflows } = buildParentWorkflowsFromNormalizedState(normalizedState)
    return buildRollupResult({
      transactionId: normalizedTransactionId,
      transaction: context.transaction,
      parentWorkflows,
      allWorkflows,
      evidenceUsed: (normalizedState.evidence || []).map((row) => row.evidence_id).filter(Boolean),
      derivedFrom: buildDerivedFromFromNormalizedState(normalizedState),
      derivedAt: normalizedState.rollup?.derived_at || resolveDerivedAtFromNormalizedState(normalizedState),
      rolePlayers: context.readModel?.rolePlayers || [],
      actorRole: options.actorRole || '',
    })
  }

  const checklistItems = context.readModel?.checklistItems || []
  const documentRequests = context.readModel?.documentRequests || []
  const events = context.events || []
  const evidence = resolveTransactionWorkflowEvidence({
    transaction: context.transaction,
    documents: context.documents,
    requiredDocuments: context.requiredDocuments,
    checklistItems,
    documentRequests,
    events,
  })

  const facts = resolveTransactionFacts(context.transaction)
  const salesOtp = resolveSalesOtpWorkflow({ ...context, evidence })
  const finance = resolveFinanceWorkflow({ ...context, evidence })
  const sellerBondCancellation = resolveSellerBondCancellationWorkflow({ ...context, evidence, facts })
  const attorneyBond = resolveAttorneyBondWorkflow({ ...context, evidence, facts })
  const attorneyTransfer = resolveAttorneyTransferWorkflow(
    { ...context, evidence, facts },
    { sellerBondCancellation, attorneyBond },
  )
  const transfer = {
    workflowKey: 'transfer',
    status: attorneyTransfer.status,
    completionRatio: calculateWorkflowCompletionRatio([
      ...attorneyTransfer.requiredSteps,
      ...sellerBondCancellation.requiredSteps,
      ...attorneyBond.requiredSteps,
    ]),
    requiredSteps: [
      ...attorneyTransfer.requiredSteps,
      ...sellerBondCancellation.requiredSteps,
      ...attorneyBond.requiredSteps,
    ],
    blockers: dedupeBlockers([
      ...(attorneyTransfer.blockers || []),
      ...(sellerBondCancellation.blockers || []),
      ...(attorneyBond.blockers || []),
    ]),
    readyForHandoff:
      attorneyTransfer.readyForHandoff &&
      (!attorneyBond.required || attorneyBond.readyForHandoff) &&
      (!sellerBondCancellation.required || sellerBondCancellation.readyForHandoff),
  }
  const registration = resolveRegistrationWorkflow(
    { ...context, evidence, facts },
    { attorneyTransfer, attorneyBond, sellerBondCancellation },
  )

  const parentWorkflows = {
    sales_otp: salesOtp,
    finance,
    transfer,
    registration,
  }
  const allWorkflows = {
    ...parentWorkflows,
    attorney_transfer: attorneyTransfer,
    seller_bond_cancellation: sellerBondCancellation,
    attorney_bond: attorneyBond,
  }

  return buildRollupResult({
    transactionId: normalizedTransactionId,
    transaction: context.transaction,
    parentWorkflows,
    allWorkflows,
    evidenceUsed: pickEvidenceSources(evidence),
    derivedFrom: buildDerivedFrom(
      {
        ...context,
        checklistItems,
        events,
      },
      allWorkflows,
    ),
    derivedAt: getEvidenceUpdatedAt(evidence) || context.transaction.updated_at || Date.now(),
    rolePlayers: context.readModel?.rolePlayers || [],
    actorRole: options.actorRole || '',
  })
}

export function buildLegacyRollupComparison(rollup = {}) {
  const legacyStage = rollup.legacy?.mappedParentStage || null
  const differences = []

  if (legacyStage && legacyStage !== rollup.parentStage) {
    differences.push({
      field: 'parentStage',
      legacyValue: legacyStage,
      rollupValue: rollup.parentStage,
      reason: 'Roll-up parent stage is derived from child workflow completion instead of legacy macro stage fields.',
    })
  }

  return {
    legacy: rollup.legacy || null,
    rollup: {
      parentStage: rollup.parentStage,
      parentStatus: rollup.parentStatus,
      progressPercent: rollup.progressPercent,
    },
    differences,
  }
}
