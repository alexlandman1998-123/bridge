// transactions owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from './eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { fetchTransactionRowById } from './workspaceReadApi.js'
import { normalizeChecklistItemStatusValue, loadTransactionChecklistItemsByIds, normalizeAttorneyStageValue } from './readinessReadApi.js'
import { loadSharedDocuments } from '../documents/listReadApi.js'
import { normalizeNullableText, normalizeOptionalDate, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { loadTransactionDocumentRequestsByIds, normalizeDocumentRequestPriorityValue } from '../documents/requirementReadModel.js'
import { commitTransactionLifecycle, getTransactionLifecyclePermissions, readCommittedLifecycle, requireLifecycleActionReceipt } from '../../services/transactionLifecycleCommitService.js'
import { flushTransactionBackgroundWork } from '../../lib/transactionBackgroundWork.js'
import { normalizeRequiredStatus } from '../../core/documents/documentVaultArchitecture'
import { normalizeTransactionLifecycleStage } from '../../core/transactions/transactionLifecycle'
import { deriveAttorneyOperationalStateForRow, resolveAttorneyOperationalStageKey } from '../../core/transactions/attorneyOperationalEngine'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { fetchSharedMatterJourney } from '../../services/sharedMatterJourneyReader.js'
import { canonicalRegistrationReadiness } from '../../core/transactions/canonicalRegistrationReadiness.js'
import { loadWorkflowActionService } from './workspaceHydration.js'
import { loadWorkflowEvidenceMapper } from './participantInfrastructure.js'
import { TRANSACTION_LIFECYCLE_STATES } from '../shared/constants.js'
import { fetchTransactionAttorneyCloseout } from '../attorney/closeoutApi.js'
import { upsertTransactionLifecycleWorkflow } from './workflowEvidence.js'
import { notifyRolesForTransaction } from '../bond/financeRead.js'
import { ensureTransactionChecklistItems } from './checklistApi.js'
import { fetchTransactionById } from './detailReadApi.js'

function normalizeTransactionLifecycleStateValue(value, fallback = 'active') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_LIFECYCLE_STATES.includes(normalized) ? normalized : fallback
}

function getLegacyMainStageForLifecycleStage(stage) {
  const normalizedStage = normalizeTransactionLifecycleStage(stage)
  if (normalizedStage === 'otp') return 'OTP'
  if (normalizedStage === 'finance') return 'FIN'
  if (normalizedStage === 'transfer') return 'XFER'
  if (normalizedStage === 'registration') return 'REG'
  return 'AVAIL'
}

export async function createOrGetTransactionLifecycle(transactionId, options = {}) {
  const client = options.client || requireClient()
  if (!transactionId) throw new Error('Transaction is required.')

  const existing = await client
    .from('transaction_lifecycle_workflows')
    .select(
      'id, transaction_id, current_stage, status, last_updated_by, last_updated_at, completed_at, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (existing.error) {
    if (isMissingTableError(existing.error, 'transaction_lifecycle_workflows') || isMissingSchemaError(existing.error))
      return null
    throw existing.error
  }
  if (existing.data) return existing.data

  const transaction = await fetchTransactionRowById(client, transactionId)
  const inferredStage = normalizeTransactionLifecycleStage(
    transaction?.current_main_stage ||
      transaction?.current_sub_stage_summary ||
      transaction?.attorney_stage ||
      transaction?.stage ||
      'confirmed',
  )

  return upsertTransactionLifecycleWorkflow(client, {
    transactionId,
    currentStage: inferredStage,
    status: transaction?.lifecycle_state === 'completed' ? 'completed' : 'active',
    source: 'create_or_get',
  })
}

export async function updateTransactionLifecycleStage(transactionId, nextStage, options = {}) {
  const client = options.client || requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedStage = normalizeTransactionLifecycleStage(nextStage)
  const status = options.status || (normalizedStage === 'registration' && options.completed ? 'completed' : 'active')
  const workflow = await upsertTransactionLifecycleWorkflow(client, {
    transactionId,
    currentStage: normalizedStage,
    status,
    actorUserId: actorProfile.userId || null,
    source: options.source || 'manual',
    note: options.note || '',
  })

  const legacyMainStage = getLegacyMainStageForLifecycleStage(normalizedStage)
  const transactionUpdate = await client
    .from('transactions')
    .update({
      current_main_stage: legacyMainStage,
      lifecycle_state: status === 'completed' ? 'completed' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId)

  if (
    transactionUpdate.error &&
    !isMissingColumnError(transactionUpdate.error, 'current_main_stage') &&
    !isMissingColumnError(transactionUpdate.error, 'lifecycle_state') &&
    !isMissingSchemaError(transactionUpdate.error)
  ) {
    throw transactionUpdate.error
  }

  return workflow
}

const TRANSACTION_CHECKLIST_PENDING_STATUSES = new Set(['pending', 'in_progress', 'blocked'])

const REGISTRATION_STAGE_KEYS = new Set(['registration_preparation', 'registered'])

const CLOSEOUT_REQUIRED_DOCUMENT_KEYS = new Set([
  'registration_confirmation',
  'signed_transfer_documents',
  'financial_settlement_documents',
])

function hasLifecycleWritePermission(role) {
  const normalized = normalizeRoleType(role || null)
  return ['attorney', 'developer', 'internal_admin'].includes(normalized)
}

function hasLifecycleAdminPermission(role) {
  const normalized = normalizeRoleType(role || null)
  return ['developer', 'internal_admin'].includes(normalized)
}

function isRegistrationConfirmationDocument(document = {}) {
  const type = String(document.document_type || '').trim().toLowerCase()
  if (/(company|companies|cipc|trust)/.test(type)) return false
  if (['registration_confirmation', 'registration_confirmation_document', 'deeds_registration_confirmation',
    'deeds_office_registration_confirmation', 'registration_proof', 'deeds_registration_proof', 'registered_title_deed'].includes(type)) return true
  if (String(document.category || '').trim().toLowerCase() === 'registration_confirmation') return true
  const name = String(document.name || '')
  return /(registration confirmation|confirmation of registration|proof of deeds registration|deeds office registration)/i.test(name)
    && !/(company|companies|cipc|trust registration)/i.test(name)
}

async function loadTransactionLifecycleContext(client, transactionId, { ensureRegisteredChecklist = false } = {}) {
  const transaction = await fetchTransactionRowById(client, transactionId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  const lifecycleState = normalizeTransactionLifecycleStateValue(
    transaction?.lifecycle_state,
    transaction?.current_main_stage === 'REG' ? 'registered' : 'active',
  )

  if (ensureRegisteredChecklist) {
    try {
      await ensureTransactionChecklistItems({
        transactionId,
        stageKey: 'registered',
      })
    } catch (error) {
      if (!isMissingSchemaError(error)) {
        throw error
      }
    }
  }

  const [documents, requestsByTransactionId, checklistByTransactionId, closeout, legalJourney] = await Promise.all([
    loadSharedDocuments(client, {
      transactionIds: [transactionId],
      viewer: 'internal',
      includeSignedUrls: false,
    }),
    loadTransactionDocumentRequestsByIds(client, [transactionId]),
    loadTransactionChecklistItemsByIds(client, [transactionId]),
    fetchTransactionAttorneyCloseout(transactionId).catch((error) => {
      if (isMissingSchemaError(error)) return null
      throw error
    }),
    fetchSharedMatterJourney(client, transactionId, {audience:'attorney'}),
  ])

  const documentRequests = requestsByTransactionId[transactionId] || []
  const checklistItems = checklistByTransactionId[transactionId] || []
  const operationalRow = {
    transaction,
    documentRequests,
    transactionChecklistItems: checklistItems,
  }
  const operationalState = deriveAttorneyOperationalStateForRow(operationalRow)

  return {
    transaction,
    lifecycleState,
    documents,
    closeout,
    documentRequests,
    checklistItems,
    operationalState,
    registrationReadiness: canonicalRegistrationReadiness(transaction,legalJourney),
  }
}

function buildRegistrationBlockers({
  context,
  registrationDate = null,
  titleDeedNumber = '',
  registrationConfirmationDocumentId = null,
} = {}) {
  const blockers = []
  const transaction = context?.transaction || null
  const stageKey = context?.operationalState?.stageKey || resolveAttorneyOperationalStageKey({ transaction })
  const lifecycleState = context?.lifecycleState || 'active'
  const registrationDateValue = registrationDate || transaction?.registration_date || null
  const titleDeedNumberValue = String(titleDeedNumber || transaction?.title_deed_number || '').trim()
  const allChecklistItems = context?.checklistItems || []
  const requiredPendingChecklist = allChecklistItems.filter(
    (item) =>
      normalizeAttorneyStageValue(item.stage) !== 'registered' &&
      normalizeDocumentRequestPriorityValue(item.priority) === 'required' &&
      TRANSACTION_CHECKLIST_PENDING_STATUSES.has(normalizeChecklistItemStatusValue(item.status)),
  )
  const requestedDocumentId =
    registrationConfirmationDocumentId ||
    transaction?.registration_confirmation_document_id ||
    context?.documents?.find((document) => isRegistrationConfirmationDocument(document))?.id ||
    null

  if (['archived', 'cancelled'].includes(lifecycleState)) {
    blockers.push({
      key: 'lifecycle_state',
      label: 'Lifecycle state does not allow registration',
      description: `This transaction is currently ${lifecycleState}. Unarchive or reopen it first.`,
    })
  }

  const canonical=context?.registrationReadiness
  if (canonical?.available ? !canonical.ready : !REGISTRATION_STAGE_KEYS.has(stageKey)) {
    blockers.push({
      key: 'stage_position',
      label: canonical?.available ? canonical.message : 'Incorrect stage for registration',
      description: 'Move the file to Registration Preparation before marking it as Registered.',
    })
  }

  if (requiredPendingChecklist.length > 0) {
    blockers.push({
      key: 'required_checklist',
      label: 'Required checklist items are still pending',
      description: `${requiredPendingChecklist.length} required checklist item(s) must be completed first.`,
    })
  }

  if (!registrationDateValue) {
    blockers.push({
      key: 'registration_date',
      label: 'Registration date is required',
      description: 'Capture the legal registration date before completing registration.',
    })
  }

  if (!titleDeedNumberValue) {
    blockers.push({
      key: 'title_deed_number',
      label: 'Title deed number is required',
      description: 'Capture the title deed number before completing registration.',
    })
  }

  if (!requestedDocumentId) {
    blockers.push({
      key: 'registration_confirmation_document',
      label: 'Registration confirmation document is required',
      description: 'Upload a registration confirmation document before marking this file as Registered.',
    })
  }
  if (requestedDocumentId && !(context?.documents || []).some(document=>
    document.id===requestedDocumentId && isRegistrationConfirmationDocument(document))) {
    blockers.push({key:'registration_confirmation_document_scope',label:'Choose registration confirmation evidence from this transaction.'})
  }

  return {
    blockers,
    requestedDocumentId,
    stageKey,
    lifecycleState,
    requiredPendingChecklistCount: requiredPendingChecklist.length,
  }
}

export async function getRegistrationBlockers({
  transactionId,
  registrationDate = null,
  titleDeedNumber = '',
  registrationConfirmationDocumentId = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const permissions = await getTransactionLifecyclePermissions(client, transactionId)
  if (!permissions.canRegister) return { canMarkRegistered: false, blockers: [{ key: 'registration_permission', label: 'Only the assigned transfer legal team or an authorised developer can record registration.' }] }
  const context = await loadTransactionLifecycleContext(client, transactionId)
  const validation = buildRegistrationBlockers({
    context,
    registrationDate,
    titleDeedNumber,
    registrationConfirmationDocumentId,
  })

  return {
    canMarkRegistered: validation.blockers.length === 0,
    blockers: validation.blockers,
    stageKey: validation.stageKey,
    lifecycleState: validation.lifecycleState,
    registrationConfirmationDocumentId: validation.requestedDocumentId,
  }
}

export async function markTransactionRegistered({
  transactionId,
  registrationDate,
  titleDeedNumber,
  registrationConfirmationDocumentId = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { flushWorkflowEvidence } = await loadWorkflowEvidenceMapper()
  await flushTransactionBackgroundWork({ transactionId })
  await flushWorkflowEvidence(transactionId, { client })

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to register this transaction.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  const validation = buildRegistrationBlockers({
    context,
    registrationDate,
    titleDeedNumber,
    registrationConfirmationDocumentId,
  })
  if (validation.blockers.length > 0) {
    throw new Error(validation.blockers.map((item) => item.label).join(' • '))
  }

  const now = new Date().toISOString()
  const normalizedRegistrationDate = normalizeOptionalDate(
    registrationDate || context.transaction.registration_date || now,
  )
  const normalizedTitleDeedNumber = normalizeTextValue(titleDeedNumber || context.transaction.title_deed_number)

  const {
    runWorkflowAction: runCanonicalWorkflowAction,
    workflowActionErrorMessage,
  } = await loadWorkflowActionService()
  const workflowResult = await runCanonicalWorkflowAction({
    transactionId,
    actionKey: 'MARK_REGISTERED',
    userId: actorProfile.userId || null,
    actorRole: actorProfile.role || null,
    payload: {
      registrationDate: normalizedRegistrationDate,
      titleDeedNumber: normalizedTitleDeedNumber,
      registrationConfirmationDocumentId: validation.requestedDocumentId,
      source: 'registration_flow',
    },
    client,
  })

  if (!workflowResult?.allowed) {
    throw new Error(workflowActionErrorMessage(workflowResult) || 'Registration workflow is blocked.')
  }

  return readCommittedLifecycle({
    receipt: workflowResult.receipt, transaction: context.transaction,
    warnings: workflowResult.warnings || [], read: () => fetchTransactionById(transactionId),
    followUps: [
      { label: 'the activity entry', run: () => logTransactionEventIfPossible(client, {
        transactionId, eventType: 'TransactionStageChanged', createdBy: actorProfile.userId || null,
        createdByRole: actorProfile.role || null,
        eventData: { source: 'registration_flow', action: 'marked_registered', stage: 'Registered',
          registrationDate: normalizedRegistrationDate, titleDeedNumber: normalizedTitleDeedNumber,
          registrationConfirmationDocumentId: validation.requestedDocumentId },
      }) },
      { label: 'registration notifications', run: () => notifyRolesForTransaction(client, {
        transactionId, roleTypes: ['attorney', 'developer', 'agent', 'bond_originator'], title: 'Transaction Registered',
        message: 'The transaction has been marked as Registered.', notificationType: 'registration_completed',
        eventType: 'TransactionStageChanged', eventData: { action: 'registered', registrationDate: normalizedRegistrationDate },
        dedupePrefix: 'registration-completed', excludeUserId: actorProfile.userId || null,
      }) },
    ],
  })
}

export async function undoTransactionRegistration({ transactionId, reason = '' } = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleAdminPermission(actorProfile.role)) {
    throw new Error('Only admin-level users can undo registration.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  if (
    context.lifecycleState !== 'registered' &&
    context.lifecycleState !== 'completed' &&
    context.operationalState.stageKey !== 'registered'
  ) {
    throw new Error('This transaction is not currently registered.')
  }
  const reversalReason = normalizeTextValue(reason)
  if (!reversalReason) {
    throw new Error('A registration reversal reason is required.')
  }

  const now = new Date().toISOString()
  const updatePayload = {
    stage: 'Transfer in Progress',
    current_main_stage: 'XFER',
    lifecycle_state: 'active',
    attorney_stage: 'registration_preparation',
    registration_reversed_at: now,
    registration_reversed_by_user_id: actorProfile.userId || null,
    registration_reversal_reason: reversalReason,
    registration_date: null,
    title_deed_number: null,
    registration_confirmation_document_id: null,
    registered_by_user_id: null,
    registered_at: null,
    completed_at: null,
    completed_by_user_id: null,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancelled_reason: null,
    is_active: true,
    last_meaningful_activity_at: now,
    updated_at: now,
  }

  const updateResult = await client.from('transactions').update(updatePayload).eq('id', transactionId).select('id').maybeSingle()
  if (updateResult.error) {
    if (
      isMissingColumnError(updateResult.error, 'lifecycle_state') ||
      isMissingColumnError(updateResult.error, 'registration_reversed_at')
    ) {
      throw new Error('Registration lifecycle columns are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw updateResult.error
  }

  if (updateResult.data?.id !== transactionId) throw new Error('Registration reversal could not be confirmed. Refresh and check your access before trying again.')
  return readCommittedLifecycle({
    receipt: { transactionId, action: 'undo_registration', lifecycleState: 'active', registeredAt: null, completedAt: null,
      registrationDate: null, titleDeedNumber: null, registrationConfirmationDocumentId: null },
    transaction: { ...context.transaction, ...updatePayload }, read: () => fetchTransactionById(transactionId),
    followUps: [
      { label: 'the workflow view', run: () => upsertTransactionLifecycleWorkflow(client, {
        transactionId, currentStage: 'transfer', status: 'active', actorUserId: actorProfile.userId || null,
        source: 'registration_flow', note: reversalReason,
      }) },
      { label: 'the activity entry', run: () => logTransactionEventIfPossible(client, {
        transactionId, eventType: 'TransactionStageChanged', createdBy: actorProfile.userId || null,
        createdByRole: actorProfile.role || null,
        eventData: { source: 'registration_flow', action: 'registration_reversed', reason: reversalReason },
      }) },
    ],
  })
}

function getMissingCloseoutDocumentKeys(closeout = null) {
  if (!closeout?.documents?.length) {
    return [...CLOSEOUT_REQUIRED_DOCUMENT_KEYS]
  }

  const uploadedKeys = new Set(
    closeout.documents
      .filter((item) => ['uploaded', 'accepted'].includes(normalizeRequiredStatus(item.status)))
      .map((item) => item.key),
  )
  return [...CLOSEOUT_REQUIRED_DOCUMENT_KEYS].filter((key) => !uploadedKeys.has(key))
}

function getPendingRegisteredChecklistItems(checklistItems = []) {
  return checklistItems.filter(
    (item) =>
      normalizeAttorneyStageValue(item.stage) === 'registered' &&
      normalizeDocumentRequestPriorityValue(item.priority) === 'required' &&
      TRANSACTION_CHECKLIST_PENDING_STATUSES.has(normalizeChecklistItemStatusValue(item.status)),
  )
}

export async function getCompletionBlockers(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const permissions = await getTransactionLifecyclePermissions(client, transactionId)
  if (!permissions.canComplete) return { canMarkCompleted: false, blockers: [{ key: 'completion_permission', label: 'Only the assigned transfer legal team or an authorised developer can complete this transaction.' }] }
  const context = await loadTransactionLifecycleContext(client, transactionId, {
    ensureRegisteredChecklist: true,
  })
  const blockers = []

  if (!['registered', 'completed', 'archived'].includes(context.lifecycleState)) {
    blockers.push({
      key: 'must_be_registered',
      label: 'Transaction must be registered first',
      description: 'Complete the registration flow before marking this file as Completed.',
    })
  }

  const missingCloseoutKeys = getMissingCloseoutDocumentKeys(context.closeout)
  if (missingCloseoutKeys.length > 0) {
    blockers.push({
      key: 'closeout_documents_missing',
      label: 'Required close-out documents are missing',
      description: `${missingCloseoutKeys.length} required close-out document type(s) are still missing.`,
      metadata: { missingCloseoutKeys },
    })
  }

  const pendingRegisteredChecklist = getPendingRegisteredChecklistItems(context.checklistItems)
  if (pendingRegisteredChecklist.length > 0) {
    blockers.push({
      key: 'post_registration_tasks_pending',
      label: 'Post-registration tasks are still pending',
      description: `${pendingRegisteredChecklist.length} required post-registration checklist item(s) remain incomplete.`,
    })
  }

  return {
    canMarkCompleted: blockers.length === 0,
    transaction: context.transaction,
    blockers,
    lifecycleState: context.lifecycleState,
    closeoutStatus: context.closeout?.closeOutStatus || context.closeout?.close_out_status || 'not_started',
  }
}

export async function markTransactionCompleted(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { flushWorkflowEvidence } = await loadWorkflowEvidenceMapper()
  await flushTransactionBackgroundWork({ transactionId })
  await flushWorkflowEvidence(transactionId, { client })

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to complete this transaction.')
  }

  const completion = await getCompletionBlockers(transactionId)
  if (!completion.canMarkCompleted) {
    throw new Error(completion.blockers.map((item) => item.label).join(' • '))
  }

  const receipt = await commitTransactionLifecycle(client, { transactionId, action: 'complete' })
  return readCommittedLifecycle({ receipt, transaction: completion.transaction || { id: transactionId }, read: () => fetchTransactionById(transactionId) })
}

export async function archiveTransactionLifecycle({ transactionId, reason = '' } = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to archive this transaction.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  if (!['registered', 'completed'].includes(context.lifecycleState)) {
    throw new Error('Only Registered or Completed transactions can be archived.')
  }

  // The command also writes its audit before committing access retirement.
  const { data, error } = await client.rpc('bridge_apply_transaction_lifecycle_action', {
    p_transaction_id: transactionId,
    p_action: 'archive',
    p_reason: normalizeNullableText(reason),
  })
  if (error) throw error
  return requireLifecycleActionReceipt(data, transactionId, ['archived'])
}

export async function unarchiveTransactionLifecycle(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to unarchive this transaction.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  if (context.lifecycleState !== 'archived') {
    throw new Error('This transaction is not archived.')
  }

  // The command also writes its audit before committing access retirement.
  const { data, error } = await client.rpc('bridge_apply_transaction_lifecycle_action', {
    p_transaction_id: transactionId,
    p_action: 'unarchive',
    p_reason: null,
  })
  if (error) throw error
  return requireLifecycleActionReceipt(data, transactionId, ['active', 'registered', 'completed'])
}

export async function cancelTransactionLifecycle({ transactionId, reason = '' } = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  if (!hasLifecycleWritePermission(actorProfile.role)) {
    throw new Error('Your role does not have permission to cancel this transaction.')
  }

  const cancellationReason = normalizeTextValue(reason)
  if (!cancellationReason) {
    throw new Error('A cancellation reason is required.')
  }

  const context = await loadTransactionLifecycleContext(client, transactionId)
  if (context.transaction.registered_at || context.transaction.completed_at ||
      ['registered', 'completed', 'archived'].includes(context.lifecycleState)) {
    throw new Error('Undo registration or reopen the archived transaction before cancelling it.')
  }

  // The command also writes its audit before committing access retirement.
  const { data, error } = await client.rpc('bridge_apply_transaction_lifecycle_action', {
    p_transaction_id: transactionId,
    p_action: 'cancel',
    p_reason: cancellationReason,
  })
  if (error) throw error
  return requireLifecycleActionReceipt(data, transactionId, ['cancelled'])
}

export async function getFinalReportData(transactionId) {
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail?.transaction) {
    return null
  }

  const now = new Date().toISOString()
  const lifecycleState = normalizeTransactionLifecycleStateValue(
    detail.transaction.lifecycle_state,
    detail.transaction.current_main_stage === 'REG' ? 'registered' : 'active',
  )

  return {
    generatedAt: now,
    transactionId,
    lifecycleState,
    transaction: {
      reference:
        detail.transaction.matter_number ||
        detail.transaction.transaction_reference ||
        `MAT-${String(detail.transaction.id || '')
          .slice(0, 8)
          .toUpperCase()}`,
      stage: detail.transaction.stage || null,
      currentMainStage: detail.transaction.current_main_stage || null,
      nextAction: detail.transaction.next_action || null,
      riskStatus: detail.transaction.risk_status || null,
      purchasePrice: detail.transaction.purchase_price || detail.transaction.sales_price || null,
    },
    registration: {
      registrationDate: detail.transaction.registration_date || null,
      titleDeedNumber: detail.transaction.title_deed_number || null,
      registeredAt: detail.transaction.registered_at || null,
      completedAt: detail.transaction.completed_at || null,
      archivedAt: detail.transaction.archived_at || null,
      cancelledAt: detail.transaction.cancelled_at || null,
    },
    stakeholders: {
      buyer: detail.buyer || null,
      seller: {
        name: detail.transaction.seller_name || null,
        email: detail.transaction.seller_email || null,
        phone: detail.transaction.seller_phone || null,
      },
      attorney: detail.transaction.attorney || null,
      agent: detail.transaction.assigned_agent || null,
      bondOriginator: detail.transaction.bond_originator || null,
    },
    documents: (detail.documents || []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      documentType: item.document_type || null,
      visibility: item.visibility_scope || 'internal',
      uploadedByRole: item.uploaded_by_role || null,
      createdAt: item.created_at || null,
      url: item.url || null,
    })),
    timeline: [
      ...(detail.transactionEvents || []).map((item) => ({
        id: item.id,
        type: item.eventType || item.event_type || 'TransactionUpdated',
        payload: item.eventData || item.event_data || {},
        createdAt: item.createdAt || item.created_at || null,
      })),
      ...(detail.transactionDiscussion || []).map((item) => ({
        id: item.id,
        type: 'CommentAdded',
        payload: {
          authorName: item.authorName || item.author_name || null,
          authorRole: item.authorRole || item.author_role || null,
          body: item.commentBody || item.commentText || item.comment_text || '',
        },
        createdAt: item.createdAt || item.created_at || null,
      })),
    ]
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
      .slice(0, 100),
  }
}
