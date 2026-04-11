import {
  canUserAccessTransaction,
  createTransactionFromWizard,
  createTransactionEvent,
  fetchTransactionById,
  fetchTransactionEvents,
  fetchTransactionsByParticipant,
  fetchTransactionsData,
  getAccessibleTransactionIdsForUser,
  saveTransaction,
  uploadDocument,
} from '../../lib/api'
import { mapTransactionDetailToCanonical, mapUnitRowToCanonicalTransaction } from './contract'
import { mapAttorneyTransferStageToDetailedStage } from './attorneySelectors'

export async function getTransaction(transactionId) {
  const detail = await fetchTransactionById(transactionId)
  return mapTransactionDetailToCanonical(detail)
}

export async function getTransactionsByDevelopment(developmentId) {
  const rows = await fetchTransactionsData({ developmentId: developmentId || null })
  return (rows || []).map((row) => mapUnitRowToCanonicalTransaction(row))
}

export async function getTransactionsByParticipant({ userId, roleType = null } = {}) {
  const rows = await fetchTransactionsByParticipant({ userId, roleType })
  return (rows || []).map((row) => mapUnitRowToCanonicalTransaction(row))
}

export async function getAccessibleTransactionIds({ userId, roleType = null } = {}) {
  return getAccessibleTransactionIdsForUser({ userId, roleType })
}

export async function canAccessTransaction({ userId, transactionId, roleType = null } = {}) {
  return canUserAccessTransaction({ userId, transactionId, roleType })
}

export async function getTransactionsByAgent(userId) {
  return getTransactionsByParticipant({ userId, roleType: 'agent' })
}

export async function getBondApplications(userId) {
  return getTransactionsByParticipant({ userId, roleType: 'bond_originator' })
}

export async function getTransfersByAttorney(userId) {
  return getTransactionsByParticipant({ userId, roleType: 'attorney' })
}

export async function createTransactionFromWizardInput(payload) {
  return createTransactionFromWizard(payload)
}

export async function updateTransactionStage({
  transactionId,
  stage,
  mainStage = null,
  nextAction = null,
  actorRole = 'developer',
}) {
  if (!transactionId) {
    throw new Error('transactionId is required.')
  }

  const detail = await fetchTransactionById(transactionId)
  if (!detail?.transaction || !detail?.unit?.id) {
    throw new Error('Transaction not found.')
  }

  await saveTransaction({
    unitId: detail.unit.id,
    transactionId: detail.transaction.id,
    buyerId: detail.transaction.buyer_id || detail.buyer?.id || null,
    financeType: detail.transaction.finance_type || 'cash',
    purchaserType: detail.transaction.purchaser_type || 'individual',
    financeManagedBy: detail.transaction.finance_managed_by || 'bond_originator',
    mainStage: mainStage || detail.transaction.current_main_stage || null,
    stage: stage || detail.transaction.stage || 'Available',
    assignedAgent: detail.transaction.assigned_agent || null,
    assignedAgentEmail: detail.transaction.assigned_agent_email || null,
    attorney: detail.transaction.attorney || null,
    assignedAttorneyEmail: detail.transaction.assigned_attorney_email || null,
    bondOriginator: detail.transaction.bond_originator || null,
    assignedBondOriginatorEmail: detail.transaction.assigned_bond_originator_email || null,
    nextAction: nextAction ?? detail.transaction.next_action ?? null,
    actorRole,
  })

  return getTransaction(transactionId)
}

export async function addTransactionDocument({
  transactionId,
  file,
  category = 'General',
  isClientVisible = false,
}) {
  return uploadDocument({
    transactionId,
    file,
    category,
    isClientVisible,
  })
}

export async function addTransactionEvent({
  transactionId,
  eventType,
  eventData = {},
  createdBy = null,
  createdByRole = null,
}) {
  return createTransactionEvent({
    transactionId,
    eventType,
    eventData,
    createdBy,
    createdByRole,
  })
}

export async function getTransactionEvents(transactionId, options = {}) {
  return fetchTransactionEvents(transactionId, options)
}

export async function updateLegalStage({ transactionId, legalStageKey, nextAction = null }) {
  const { stage, mainStage } = mapAttorneyTransferStageToDetailedStage(legalStageKey)

  return updateTransactionStage({
    transactionId,
    stage,
    mainStage,
    nextAction,
    actorRole: 'attorney',
  })
}
