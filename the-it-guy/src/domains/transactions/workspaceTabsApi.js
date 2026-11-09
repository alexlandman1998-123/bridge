// transactions owns these operations and their existing recovery behavior.
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { resolveTransactionIdFromBondApplicationId, fetchTransactionRowById } from './workspaceReadApi.js'
import { fetchTransactionEvents, fetchTransactionProxyUpdatesWithClient } from './activityReadApi.js'
import { requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { canAccessAttorneyMatter } from '../../lib/attorneyPermissions.js'
import { isBondFinanceType } from '../../core/transactions/financeType'
import { buildAgentBondApplicationWorkspace, buildBondApplicationIdentity } from '../../modules/bond/application/index.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { getAgentTransactionSyncReadModel } from '../../services/transactionSyncReadModelService.js'
import { ensureTransactionSubprocesses } from './subprocessApi.js'
import { TRANSACTION_PARTICIPANT_FULL_SELECT, TRANSACTION_PARTICIPANT_LEGACY_SELECT, isMissingTransactionParticipantExtendedColumn, normalizeTransactionParticipantRow } from './participantInfrastructure.js'
import { getTransactionFinanceWorkflow, fetchTransactionRolePlayersIfPossible, fetchNormalizedBondApplicationBundle } from '../bond/financeRead.js'
import { fetchBuyerProcessLeadHandoffForTransaction, fetchAgentBondOriginatorProgressView, fetchAgentBondApplicationIdentity, fetchAgentBondApplicationWorkspaceView, fetchAttorneyBondOriginatorHandoffView } from './buyerProcessRead.js'
import { fetchTransactionDiscussion } from './discussionApi.js'

export async function resolveTransactionWorkspaceReadContext(transactionId) {
  if (!transactionId) return null
  const client = requireClient()
  let resolvedTransactionId = transactionId
  let transaction = await fetchTransactionRowById(client, resolvedTransactionId)
  if (!transaction) {
    const applicationTransactionId = await resolveTransactionIdFromBondApplicationId(client, transactionId)
    if (applicationTransactionId && applicationTransactionId !== resolvedTransactionId) {
      resolvedTransactionId = applicationTransactionId
      transaction = await fetchTransactionRowById(client, resolvedTransactionId)
    }
  }
  // Inactive/archived matters remain part of the legal record. The matter shell
  // already permits authorised firm users to open them, so document datasets
  // must use the same permission check instead of misreporting them as missing.
  if (!transaction) return null

  const canonicalTransactionId = transaction.id || resolvedTransactionId
  const activeProfile = await resolveActiveProfileContext(client)
  if (normalizeRoleType(activeProfile.role) === 'attorney') {
    // Use the same organisation-aware decision as the matter shell. Attorney
    // access belongs to the assigned firm; a staff member need not be copied
    // onto every matter merely to load its document history.
    const allowed = await canAccessAttorneyMatter(canonicalTransactionId, null, null)
    if (!allowed) throw new Error('You do not have access to this transaction. Refresh Transactions and try again.')
  }
  return { client, transaction, canonicalTransactionId, activeProfile }
}

export async function createTransactionWorkspaceHydrationContext(transactionId) {
  return resolveTransactionWorkspaceReadContext(transactionId)
}

export async function fetchTransactionActivityWorkspace(transactionId, options = {}) {
  const context = options.hydrationContext || await resolveTransactionWorkspaceReadContext(transactionId)
  if (!context) return null
  const { client, transaction, canonicalTransactionId } = context
  const [transactionDiscussion, transactionEvents, transactionProxyUpdates] = await Promise.all([
    fetchTransactionDiscussion(canonicalTransactionId, {
      unitId: transaction.unit_id || null,
      viewer: 'internal',
      includeLegacy: true,
      limit: 250,
    }),
    fetchTransactionEvents(canonicalTransactionId),
    fetchTransactionProxyUpdatesWithClient(client, canonicalTransactionId, { limit: 100 }),
  ])
  return { transactionDiscussion, transactionEvents, transactionProxyUpdates }
}

export async function fetchTransactionPartnersWorkspace(transactionId, options = {}) {
  const context = options.hydrationContext || await resolveTransactionWorkspaceReadContext(transactionId)
  if (!context) return null
  const { client, canonicalTransactionId } = context
  let [participantsQuery, rolePlayers, buyerProcessLeadHandoff] = await Promise.all([
    client.from('transaction_participants').select(TRANSACTION_PARTICIPANT_FULL_SELECT).eq('transaction_id', canonicalTransactionId),
    fetchTransactionRolePlayersIfPossible(client, canonicalTransactionId),
    fetchBuyerProcessLeadHandoffForTransaction(client, canonicalTransactionId),
  ])
  if (participantsQuery.error && isMissingTransactionParticipantExtendedColumn(participantsQuery.error)) {
    participantsQuery = await client
      .from('transaction_participants')
      .select(TRANSACTION_PARTICIPANT_LEGACY_SELECT)
      .eq('transaction_id', canonicalTransactionId)
  }
  if (participantsQuery.error && !isMissingSchemaError(participantsQuery.error)) throw participantsQuery.error
  let transactionParticipants = (participantsQuery.data || []).map((row) => normalizeTransactionParticipantRow(row))
  const attorneyOrganisationIds = [...new Set(rolePlayers
    .filter((row) => ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(
      normalizeTextValue(row?.roleType || row?.role_type).toLowerCase(),
    ))
    .map((row) => normalizeTextValue(row?.organisationId || row?.organisation_id || row?.snapshot?.organisationId))
    .filter(Boolean))]
  if (attorneyOrganisationIds.length) {
    let firmQuery = await client
      .from('attorney_firms')
      .select('organisation_id, name, email, phone')
      .in('organisation_id', attorneyOrganisationIds)
      .eq('is_active', true)
    if (firmQuery.error && isMissingColumnError(firmQuery.error, 'is_active')) {
      firmQuery = await client
        .from('attorney_firms')
        .select('organisation_id, name, email, phone')
        .in('organisation_id', attorneyOrganisationIds)
    }
    if (
      firmQuery.error &&
      !isMissingTableError(firmQuery.error, 'attorney_firms') &&
      !isMissingSchemaError(firmQuery.error) &&
      !isPermissionDeniedError(firmQuery.error)
    ) throw firmQuery.error

    const firmsByOrganisation = new Map((firmQuery.data || []).map((firm) => [
      normalizeTextValue(firm.organisation_id), firm,
    ]).filter(([organisationId]) => organisationId))
    if (firmsByOrganisation.size) {
      transactionParticipants = transactionParticipants.map((participant) => {
        if (participant.roleType !== 'attorney') return participant
        const roleKey = participant.legalRole === 'transfer'
          ? 'transfer_attorney'
          : participant.legalRole === 'bond'
            ? 'bond_attorney'
            : participant.legalRole === 'cancellation'
              ? 'cancellation_attorney'
              : ''
        const roleplayer = rolePlayers.find((row) =>
          normalizeTextValue(row?.roleType || row?.role_type).toLowerCase() === roleKey,
        )
        const organisationId = normalizeTextValue(
          roleplayer?.organisationId || roleplayer?.organisation_id || roleplayer?.snapshot?.organisationId,
        )
        const firm = firmsByOrganisation.get(organisationId)
        if (!firm) return participant
        return {
          ...participant,
          participantName: participant.participantName || normalizeTextValue(firm.name),
          participantEmail: participant.participantEmail || normalizeTextValue(firm.email),
          participantPhone: participant.participantPhone || normalizeTextValue(firm.phone),
          organisationName: normalizeTextValue(firm.name),
          firmName: normalizeTextValue(firm.name),
        }
      })
    }
  }
  return {
    transactionParticipants,
    rolePlayers,
    transactionRolePlayers: rolePlayers,
    transaction_role_players: rolePlayers,
    buyerProcessLeadHandoff,
  }
}

export async function fetchTransactionFinanceWorkspace(transactionId, options = {}) {
  const context = options.hydrationContext || await resolveTransactionWorkspaceReadContext(transactionId)
  if (!context) return null
  const { client, transaction, canonicalTransactionId } = context
  const financeWorkflowPromise = isBondFinanceType(transaction.finance_type)
    ? getTransactionFinanceWorkflow(canonicalTransactionId, { client, createIfMissing: false })
    : Promise.resolve(null)
  const [
    transactionFinanceWorkflow,
    bondOriginatorAgentProgressView,
    serverBondApplicationIdentity,
    serverBondApplicationWorkspaceView,
    bondOriginatorAttorneyHandoffView,
    bondApplication,
    transactionSync,
  ] = await Promise.all([
    financeWorkflowPromise,
    fetchAgentBondOriginatorProgressView(client, canonicalTransactionId),
    fetchAgentBondApplicationIdentity(client, canonicalTransactionId),
    fetchAgentBondApplicationWorkspaceView(client, canonicalTransactionId),
    fetchAttorneyBondOriginatorHandoffView(client, canonicalTransactionId),
    fetchNormalizedBondApplicationBundle(client, canonicalTransactionId),
    getAgentTransactionSyncReadModel(canonicalTransactionId, { client }),
  ])
  const bondApplicationIdentity = buildBondApplicationIdentity({
    transaction,
    bondApplication,
    originatorProgress: bondOriginatorAgentProgressView,
    financeWorkflow: transactionFinanceWorkflow,
    serverIdentity: serverBondApplicationIdentity,
  })
  return {
    transactionFinanceWorkflow,
    bondOriginatorAgentProgressView,
    bondApplicationIdentity,
    bondApplicationWorkspace: buildAgentBondApplicationWorkspace({
      workspaceView: serverBondApplicationWorkspaceView,
      transaction,
      bondApplication,
      originatorProgress: bondOriginatorAgentProgressView,
      financeWorkflow: transactionFinanceWorkflow,
      serverIdentity: serverBondApplicationIdentity,
    }),
    bondOriginatorAttorneyHandoffView,
    bondApplication,
    normalizedBondApplication: bondApplication,
    transactionSync,
  }
}

export async function fetchTransactionWorkflowWorkspace(transactionId, options = {}) {
  const context = options.hydrationContext || await resolveTransactionWorkspaceReadContext(transactionId)
  if (!context) return null
  const { client, canonicalTransactionId } = context
  return {
    transactionSubprocesses: await ensureTransactionSubprocesses(client, canonicalTransactionId, {
      createIfMissing: false,
    }),
  }
}
