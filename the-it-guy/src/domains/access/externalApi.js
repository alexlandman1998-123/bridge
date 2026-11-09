// access owns these operations and their existing recovery behavior.
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { loadSharedDocuments } from '../documents/listReadApi.js'
import { normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { normalizeStage } from '../../core/transactions/legacyReadModel.js'
import { fetchDocumentRequirements, buildRequiredChecklistFromRows, buildDocumentChecklist } from '../documents/requirementReadModel.js'
import { getMainStageFromDetailedStage } from '../../core/transactions/stageConfig'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { EXTERNAL_ACCESS_ROLES } from '../../core/transactions/roleConfig'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { requireScopedClient } from '../transactions/contactSupport.js'
import { fetchTransactionHandover } from '../transactions/workspaceHydration.js'
import { normalizeSubprocessStepStatus, LEGACY_TRANSFER_STEP_KEY_ALIASES, ensureTransactionSubprocesses, updateTransactionSubprocessStep } from '../transactions/subprocessApi.js'
import { fetchOnboardingFormDataForTransaction } from '../transactions/participantInfrastructure.js'
import { attemptPromotePendingSellerDocumentsIfPossible } from '../transactions/workflowEvidence.js'
import { assertReservationDepositGateForTransition } from '../developments/transactionActions.js'
import { loadSharedDiscussion } from '../bond/financeRead.js'
import { fetchClientVisibleAttorneyLaneUpdates } from '../clientPortal/originatorFinanceRead.js'
import { addTransactionDiscussionComment } from '../transactions/discussionApi.js'
import { fetchTokenScopedTransactionJourneySnapshot } from '../clientPortal/journeyRead.js'
import { getOnboardingFinanceSnapshot } from '../finance/onboardingSnapshot.js'

export function requireExternalAccessTokenClient(token) {
  return requireScopedClient({
    'x-bridge-external-access-token': String(token || '').trim(),
  })
}

function normalizeExternalRole(role) {
  if (role === 'tuckers') {
    return 'attorney'
  }

  return role
}

export function normalizeExternalAccessRoleToTransactionRole(role) {
  return normalizeRoleType(normalizeExternalRole(role))
}

function formatExternalRole(role) {
  const normalized = normalizeExternalRole(role)

  if (normalized === 'client') {
    return 'Client / Buyer'
  }

  if (normalized === 'attorney') {
    return 'Attorney / Conveyancer'
  }

  if (normalized === 'bond_originator') {
    return 'Bond Originator'
  }

  return normalized
}

function buildExternalWorkflowStepComment({ actorName, actorRole, action = 'updated', occurredAt, userComment }) {
  const metadata = {
    actorName: normalizeNullableText(actorName) || 'Shared Workspace',
    actorRole: normalizeRoleType(actorRole),
    action: action === 'completed' ? 'completed' : 'updated',
    occurredAt: occurredAt || new Date().toISOString(),
  }
  const normalizedUserComment = normalizeNullableText(userComment)

  return [`::bridge-meta ${JSON.stringify(metadata)}`, normalizedUserComment].filter(Boolean).join('\n')
}

export async function resolveExternalAccessByToken(client, accessToken) {
  const { data, error } = await client
    .from('transaction_external_access')
    .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
    .eq('access_token', accessToken)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'transaction_external_access')) {
      throw new Error('External access is not set up yet. Run sql/schema.sql to create transaction_external_access.')
    }

    throw error
  }

  if (!data) {
    throw new Error('Access link not found.')
  }

  if (data.revoked) {
    throw new Error('This access link has been revoked.')
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error('This access link has expired.')
  }

  return {
    ...data,
    role: normalizeExternalRole(data.role),
  }
}

export async function fetchExternalAccessLinks(transactionId) {
  const client = requireClient()

  if (!transactionId) {
    return []
  }

  const { data, error } = await client
    .from('transaction_external_access')
    .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'transaction_external_access')) {
      return []
    }

    throw error
  }

  return (data || []).map((item) => ({
    ...item,
    role: normalizeExternalRole(item.role),
  }))
}

export async function createExternalAccessLink({
  transactionId,
  buyerId = null,
  email,
  role = 'attorney',
  expiresDays = 14,
}) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const normalizedEmail = email?.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Email is required.')
  }

  const normalizedRole = normalizeExternalRole(role)

  if (!EXTERNAL_ACCESS_ROLES.includes(normalizedRole)) {
    throw new Error('Invalid external role.')
  }

  const generatedToken = `tx${crypto.randomUUID().replaceAll('-', '')}`
  const expiresAt =
    Number(expiresDays) > 0 ? new Date(Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000).toISOString() : null

  let result = await client
    .from('transaction_external_access')
    .insert({
      transaction_id: transactionId,
      buyer_id: buyerId || null,
      role: normalizedRole,
      email: normalizedEmail,
      access_token: generatedToken,
      expires_at: expiresAt,
    })
    .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
    .single()

  if (result.error && normalizedRole === 'attorney' && ['23514', '22P02'].includes(result.error.code)) {
    result = await client
      .from('transaction_external_access')
      .insert({
        transaction_id: transactionId,
        buyer_id: buyerId || null,
        role: 'tuckers',
        email: normalizedEmail,
        access_token: generatedToken,
        expires_at: expiresAt,
      })
      .select('id, transaction_id, buyer_id, role, email, access_token, expires_at, revoked, created_at')
      .single()
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_external_access')) {
      throw new Error('External access is not set up yet. Run sql/schema.sql to create transaction_external_access.')
    }

    throw result.error
  }

  return result.data
}

export async function revokeExternalAccessLink(linkId) {
  const client = requireClient()

  const { error } = await client.from('transaction_external_access').update({ revoked: true }).eq('id', linkId)

  if (error) {
    if (isMissingTableError(error, 'transaction_external_access')) {
      throw new Error('External access is not set up yet. Run sql/schema.sql to create transaction_external_access.')
    }

    throw error
  }
}

export function ensureExternalWorkspaceRole(access) {
  if (access.role === 'client') {
    throw new Error('Clients can only use the client portal link. Please open your /client/... access URL.')
  }
}

function externalRoleCandidates(role) {
  if (role === 'attorney') {
    return ['attorney', 'tuckers']
  }

  return [role]
}

async function resolveAccessibleExternalTransactionIds(client, access) {
  const roleCandidates = externalRoleCandidates(access.role)

  const { data, error } = await client
    .from('transaction_external_access')
    .select('transaction_id, role, expires_at, revoked')
    .eq('email', access.email)
    .in('role', roleCandidates)

  if (error) {
    throw error
  }

  const now = Date.now()
  const ids = new Set()

  for (const row of data || []) {
    if (row.revoked) {
      continue
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < now) {
      continue
    }

    if (row.transaction_id) {
      ids.add(row.transaction_id)
    }
  }

  return [...ids]
}

export async function resolveExternalWorkspaceTransactionIds(client, access) {
  const ids = await resolveAccessibleExternalTransactionIds(client, access)

  if (access.transaction_id && !ids.includes(access.transaction_id)) {
    ids.push(access.transaction_id)
  }

  return ids
}

async function fetchExternalTransactionSummaries(client, transactionIds) {
  if (!transactionIds.length) {
    return []
  }

  let transactionsQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, sales_price, purchase_price, finance_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_status, stage, attorney, bond_originator, next_action, updated_at, created_at',
    )
    .in('id', transactionIds)
    .order('updated_at', { ascending: false })

  if (
    transactionsQuery.error &&
    (isMissingColumnError(transactionsQuery.error, 'development_id') ||
      isMissingColumnError(transactionsQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionsQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionsQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionsQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionsQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionsQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionsQuery.error, 'reservation_status'))
  ) {
    transactionsQuery = await client
      .from('transactions')
      .select(
        'id, unit_id, buyer_id, sales_price, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
      )
      .in('id', transactionIds)
      .order('updated_at', { ascending: false })
  }

  if (transactionsQuery.error) {
    throw transactionsQuery.error
  }

  const transactions = transactionsQuery.data || []
  if (!transactions.length) {
    return []
  }

  const unitIds = [...new Set(transactions.map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set(transactions.map((item) => item.buyer_id).filter(Boolean))]

  const [unitsQuery, buyersQuery] = await Promise.all([
    unitIds.length
      ? client
          .from('units')
          .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
          .in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
    buyerIds.length
      ? client.from('buyers').select('id, name').in('id', buyerIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (unitsQuery.error) {
    throw unitsQuery.error
  }

  if (buyersQuery.error) {
    throw buyersQuery.error
  }

  const unitById = (unitsQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  const buyerById = (buyersQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  return transactions.map((transaction) => {
    const unit = unitById[transaction.unit_id] || null
    const buyer = transaction.buyer_id ? buyerById[transaction.buyer_id] || null : null
    const stage = normalizeStage(transaction.stage, unit?.status)

    return {
      transactionId: transaction.id,
      developmentName: unit?.development?.name || 'Unknown Development',
      unitNumber: unit?.unit_number || '-',
      buyerName: buyer?.name || 'No buyer',
      stage,
      nextAction: transaction.next_action || '',
      updatedAt: transaction.updated_at || transaction.created_at || null,
    }
  })
}

async function fetchExternalTransactionWorkspace(client, transactionId, { viewerRole = null } = {}) {
  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, listing_id, buyer_id, sales_price, purchase_price, finance_type, purchaser_type, cash_amount, bond_amount, deposit_amount, reservation_required, reservation_amount, reservation_status, reservation_paid_date, bank, stage, attorney, bond_originator, next_action, expected_transfer_date, updated_at, created_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'expected_transfer_date') ||
      isMissingColumnError(transactionQuery.error, 'development_id') ||
      isMissingColumnError(transactionQuery.error, 'listing_id') ||
      isMissingColumnError(transactionQuery.error, 'bank') ||
      isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'deposit_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'reservation_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_status') ||
      isMissingColumnError(transactionQuery.error, 'reservation_paid_date'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select(
        'id, unit_id, listing_id, buyer_id, sales_price, finance_type, purchaser_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
      )
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    throw new Error('Transaction not found.')
  }
  const transactionJourneySnapshotPromise = fetchTokenScopedTransactionJourneySnapshot(client, transaction.id)

  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
    .eq('id', transaction.unit_id)
    .maybeSingle()

  if (unitError) {
    throw unitError
  }

  let buyer = null
  if (transaction.buyer_id) {
    const { data: buyerData, error: buyerError } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('id', transaction.buyer_id)
      .maybeSingle()

    if (buyerError) {
      throw buyerError
    }

    buyer = buyerData
  }

  if (transaction.listing_id) {
    await attemptPromotePendingSellerDocumentsIfPossible(client, transaction.listing_id)
  }

  const documents = await loadSharedDocuments(client, {
    transactionIds: [transaction.id],
    viewer: 'external',
    viewerRole,
  })
  const handover = await fetchTransactionHandover(client, {
    developmentId: transaction.development_id || unit?.development_id || null,
    unitId: transaction.unit_id,
    transaction,
    buyer,
  })
  const discussion = await loadSharedDiscussion(client, {
    transactionId: transaction.id,
    unitId: transaction.unit_id,
    viewer: 'external',
    includeLegacy: true,
    limit: 120,
  })
  const attorneyLaneUpdates = await fetchClientVisibleAttorneyLaneUpdates(client, transaction.id, viewerRole, {
    limit: 12,
  })
  const onboardingFormData = transaction?.id
    ? await fetchOnboardingFormDataForTransaction(client, transaction.id, transaction.purchaser_type)
    : null
  const onboardingValues = onboardingFormData?.formData || {}
  const resolvedPurchaserType = normalizePurchaserType(onboardingValues.purchaser_type || transaction.purchaser_type)
  const financeSnapshot = getOnboardingFinanceSnapshot({
    formData: onboardingValues,
    transaction,
  })
  const requiredDocuments = await ensureTransactionRequiredDocuments(
    client,
    {
      transactionId: transaction.id,
      purchaserType: resolvedPurchaserType,
      financeType: financeSnapshot.financeType,
      reservationRequired: financeSnapshot.reservationRequired,
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      formData: onboardingValues,
    },
    { sync: false },
  )
  const requirements = await fetchDocumentRequirements(client, unit?.development_id || transaction.development_id)
  const checklistResult = requiredDocuments.length
    ? buildRequiredChecklistFromRows(requiredDocuments, documents)
    : buildDocumentChecklist(requirements, documents)
  const transactionJourneySnapshot = await transactionJourneySnapshotPromise

  return {
    transaction,
    unit,
    buyer,
    onboardingFormData,
    discussion,
    attorneyLaneUpdates,
    documents,
    handover,
    requiredDocuments,
    requiredDocumentChecklist: checklistResult.checklist,
    documentSummary: checklistResult.summary,
    transactionJourneySnapshot,
    stage: normalizeStage(transaction.stage, unit?.status),
  }
}

export async function fetchExternalTransactionPortal(accessToken, options = {}) {
  const client = requireExternalAccessTokenClient(accessToken)
  const targetTransactionId = options?.transactionId || null

  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)

  const lastUsedResult = await client
    .from('transaction_external_access')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', access.id)

  if (
    lastUsedResult.error &&
    !isMissingColumnError(lastUsedResult.error, 'last_used_at') &&
    !isMissingTableError(lastUsedResult.error, 'transaction_external_access')
  ) {
    throw lastUsedResult.error
  }
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const selectedTransactionId = targetTransactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(selectedTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }

  const [workspace, summaries] = await Promise.all([
    fetchExternalTransactionWorkspace(client, selectedTransactionId, {
      viewerRole: access.role,
    }),
    fetchExternalTransactionSummaries(client, accessibleTransactionIds),
  ])

  const accessibleTransactions = [...summaries].sort((a, b) => {
    const devCompare = String(a.developmentName || '').localeCompare(String(b.developmentName || ''), undefined, {
      sensitivity: 'base',
    })
    if (devCompare !== 0) {
      return devCompare
    }

    return String(a.unitNumber || '').localeCompare(String(b.unitNumber || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  return {
    access,
    ...workspace,
    selectedTransactionId,
    accessibleTransactions,
  }
}

export async function updateExternalTransactionWorkspace({
  accessToken,
  transactionId = null,
  stage,
  nextAction,
  attorney,
  bondOriginator,
  expectedTransferDate,
  comment,
}) {
  const client = requireClient()
  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const targetTransactionId = transactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(targetTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }

  if (stage) {
    await assertReservationDepositGateForTransition(client, {
      transactionId: targetTransactionId,
      nextMainStage: getMainStageFromDetailedStage(stage),
      nextDetailedStage: stage,
    })
  }

  const updatePayload = {
    stage: stage || null,
    current_main_stage: stage ? getMainStageFromDetailedStage(stage) : null,
    next_action: nextAction?.trim() || null,
    attorney: attorney?.trim() || null,
    bond_originator: bondOriginator?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  let updateQuery = await client
    .from('transactions')
    .update({
      ...updatePayload,
      expected_transfer_date: expectedTransferDate || null,
    })
    .eq('id', targetTransactionId)
    .select('id, unit_id, stage, next_action, attorney, bond_originator, expected_transfer_date, updated_at')
    .single()

  if (updateQuery.error && isMissingColumnError(updateQuery.error, 'expected_transfer_date')) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.current_main_stage

    updateQuery = await client
      .from('transactions')
      .update(fallbackPayload)
      .eq('id', targetTransactionId)
      .select('id, unit_id, stage, next_action, attorney, bond_originator, updated_at')
      .single()
  }

  if (updateQuery.error && isMissingColumnError(updateQuery.error, 'current_main_stage')) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.current_main_stage

    updateQuery = await client
      .from('transactions')
      .update({
        ...fallbackPayload,
        expected_transfer_date: expectedTransferDate || null,
      })
      .eq('id', targetTransactionId)
      .select('id, unit_id, stage, next_action, attorney, bond_originator, expected_transfer_date, updated_at')
      .single()
  }

  if (updateQuery.error) {
    throw updateQuery.error
  }

  const updatedTransaction = updateQuery.data

  if (updatedTransaction?.unit_id && updatedTransaction.stage) {
    await client.from('units').update({ status: updatedTransaction.stage }).eq('id', updatedTransaction.unit_id)
  }

  const trimmedComment = comment?.trim()
  if (trimmedComment) {
    await addTransactionDiscussionComment({
      transactionId: targetTransactionId,
      authorName: access.email || formatExternalRole(access.role),
      authorRole: normalizeExternalAccessRoleToTransactionRole(access.role),
      commentText: `[shared] ${trimmedComment}`,
      unitId: updatedTransaction?.unit_id || null,
    })
  }

  return updatedTransaction
}

export async function updateExternalTransactionWorkflowStep({
  accessToken,
  transactionId = null,
  processType,
  stepKey,
  status = 'completed',
  actionType = 'updated',
  comment = '',
}) {
  const client = requireClient()
  const access = await resolveExternalAccessByToken(client, accessToken)
  ensureExternalWorkspaceRole(access)
  const accessibleTransactionIds = await resolveExternalWorkspaceTransactionIds(client, access)
  const targetTransactionId = transactionId || access.transaction_id

  if (!accessibleTransactionIds.includes(targetTransactionId)) {
    throw new Error('This transaction is not available for your access link.')
  }

  const normalizedProcessType = String(processType || '')
    .trim()
    .toLowerCase()
  const allowedProcessTypes = new Set(['finance', 'attorney', 'transfer', 'bond'])
  if (!allowedProcessTypes.has(normalizedProcessType)) {
    throw new Error('Invalid workflow process type.')
  }

  const subprocesses = await ensureTransactionSubprocesses(client, targetTransactionId)
  const targetSubprocess =
    subprocesses.find((item) => item.process_type === normalizedProcessType) ||
    (normalizedProcessType === 'transfer' ? subprocesses.find((item) => item.process_type === 'attorney') : null)
  if (!targetSubprocess) {
    throw new Error('Workflow process not found for this transaction.')
  }

  const targetStep =
    (targetSubprocess.steps || []).find((item) => item.step_key === stepKey) ||
    (normalizedProcessType === 'transfer' && LEGACY_TRANSFER_STEP_KEY_ALIASES[stepKey]
      ? (targetSubprocess.steps || []).find((item) => item.step_key === LEGACY_TRANSFER_STEP_KEY_ALIASES[stepKey])
      : null)
  if (!targetStep) {
    throw new Error('Workflow step not found for this transaction.')
  }

  const now = new Date().toISOString()
  const actorRole = normalizeExternalAccessRoleToTransactionRole(access.role)
  const actorName = access.email || formatExternalRole(access.role)
  const normalizedStatus = normalizeSubprocessStepStatus(status)
  const actionVerb = actionType === 'completed' ? 'completed' : 'updated'
  const normalizedComment = buildExternalWorkflowStepComment({
    actorName,
    actorRole,
    action: actionVerb,
    occurredAt: now,
    userComment: comment,
  })

  const result = await updateTransactionSubprocessStep({
    transactionId: targetTransactionId,
    subprocessId: targetSubprocess.id,
    stepId: targetStep.id,
    status: normalizedStatus,
    comment: normalizedComment,
    completedAt: normalizedStatus === 'completed' ? targetStep.completed_at || now : null,
    actorRole,
    skipPermissionCheck: true,
  })

  const transactionLookup = await client
    .from('transactions')
    .select('unit_id')
    .eq('id', targetTransactionId)
    .maybeSingle()

  if (transactionLookup.error && !isMissingSchemaError(transactionLookup.error)) {
    throw transactionLookup.error
  }

  const workflowLabel =
    normalizedProcessType === 'finance' ? 'finance' : normalizedProcessType === 'bond' ? 'bond' : 'transfer'
  const noteText =
    normalizedStatus === 'completed'
      ? `[${workflowLabel}] ${actorName} marked "${targetStep.step_label}" complete.${comment?.trim() ? ` ${comment.trim()}` : ''}`
      : `[${workflowLabel}] ${actorName} updated "${targetStep.step_label}".${comment?.trim() ? ` ${comment.trim()}` : ''}`

  await addTransactionDiscussionComment({
    transactionId: targetTransactionId,
    authorName: actorName,
    authorRole: actorRole,
    commentText: noteText,
    unitId: transactionLookup.data?.unit_id || null,
  })

  return result
}
