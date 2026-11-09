// transactions owns these operations and their existing recovery behavior.
import { summarizeDocumentRequests, summarizeChecklistItems, loadTransactionChecklistItemsByIds, loadTransactionIssueOverridesByIds } from './readinessReadApi.js'
import { loadSharedDocuments } from '../documents/listReadApi.js'
import { fetchTransactionEvents, fetchTransactionProxyUpdatesWithClient } from './activityReadApi.js'
import { normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { loadTransactionDocumentRequestsByIds, fetchTransactionRequiredDocumentsByTransactionIds } from '../documents/requirementReadModel.js'
import { DEFAULT_DEVELOPMENT_SETTINGS } from '../developments/configurationApi.js'
import { isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { hydrateMatterPropertyContext } from '../../services/matterPropertyContext'
import { getPurchaserTypeLabel, normalizePurchaserType } from '../../lib/purchaserPersonas'
import { getBuyerFicaReadiness as getBuyerFicaReadinessFromProfile, getBuyerFinanceReadiness as getBuyerFinanceReadinessFromProfile, getBuyerRequirementProfile, getMissingBuyerRequirements as getMissingBuyerRequirementsFromProfile, getTransferReadinessFromBuyerDocs as getTransferReadinessFromBuyerDocsFromProfile, getRequiredTransactionActions } from '../../lib/buyerRequirementEngine'
import { isBondFinanceType } from '../../core/transactions/financeType'
import { extractNewTransactionSetupHealthFromEvents } from '../../core/transactions/newTransactionSetupHealth.js'
import { buildTransactionBuyerOperationalAudit } from '../../core/transactions/transactionBuyerOperationalAudit.js'
import { buildAgentBondApplicationWorkspace, buildBondApplicationIdentity } from '../../modules/bond/application/index.js'
import { getAttorneyMockTransactionDetail } from '../../core/transactions/attorneyMockData'
import { resolveAttorneyOperationalStageKey } from '../../core/transactions/attorneyOperationalEngine'
import { getRolePermissions } from '../../core/transactions/permissions'
import { getAgentTransactionSyncReadModel } from '../../services/transactionSyncReadModelService.js'
import { ensureTransactionSubprocesses } from './subprocessApi.js'
import { fetchOnboardingFormDataForTransaction, TRANSACTION_PARTICIPANT_FULL_SELECT, TRANSACTION_PARTICIPANT_LEGACY_SELECT, isMissingTransactionParticipantExtendedColumn, normalizeTransactionParticipantRow } from './participantInfrastructure.js'
import { buildLiveTransactionChecklistData } from './workspaceHydration.js'
import { getTransactionFinanceWorkflow, fetchTransactionRolePlayersIfPossible, fetchNormalizedBondApplicationBundle } from '../bond/financeRead.js'
import { fetchTransactionAppointments } from '../clientPortal/appointmentRead.js'
import { ensureTransactionChecklistItems } from './checklistApi.js'
import { fetchBuyerProcessLeadHandoffForTransaction, fetchAgentBondOriginatorProgressView, fetchAgentBondApplicationIdentity, fetchAgentBondApplicationWorkspaceView, fetchAttorneyBondOriginatorHandoffView } from './buyerProcessRead.js'
import { attemptPromotePendingSellerDocumentsIfPossible } from './workflowEvidence.js'
import { resolveTransactionWorkspaceReadContext } from './workspaceTabsApi.js'
import { fetchUnitDetail } from '../developments/unitWorkspaceApi.js'
import { fetchTransactionDiscussion } from './discussionApi.js'

function resolveTransactionSetupHealthFromEvents(events = []) {
  return extractNewTransactionSetupHealthFromEvents(events)
}

export async function fetchTransactionById(transactionId, options = {}) {
  if (!transactionId) {
    return null
  }

  const mockDetail = getAttorneyMockTransactionDetail(transactionId)
  if (mockDetail) {
    return mockDetail
  }

  const context = options.hydrationContext || await resolveTransactionWorkspaceReadContext(transactionId)
  if (!context) return null
  const { client, canonicalTransactionId } = context
  const [transaction] = await hydrateMatterPropertyContext(client, [context.transaction])

  try {
  if (transaction.listing_id) {
    await attemptPromotePendingSellerDocumentsIfPossible(client, transaction.listing_id)
  }

  if (transaction.unit_id) {
    let unitDetail = null
    try {
      unitDetail = await fetchUnitDetail(transaction.unit_id)
    } catch (unitDetailError) {
      const recoverableUnitDetailError =
        isMissingSchemaError(unitDetailError) ||
        isPermissionDeniedError(unitDetailError) ||
        isMissingColumnError(unitDetailError)
      if (!recoverableUnitDetailError) {
        throw unitDetailError
      }
    }

    if (unitDetail?.transaction?.id === canonicalTransactionId) {
      const [
        transactionEvents,
        transactionProxyUpdates,
        appointmentsByTransactionId,
        buyerProcessLeadHandoff,
        bondOriginatorAgentProgressView,
        serverBondApplicationIdentity,
        serverBondApplicationWorkspaceView,
        bondOriginatorAttorneyHandoffView,
        rolePlayers,
        bondApplication,
        liveChecklist,
        transactionSync,
      ] = await Promise.all([
        fetchTransactionEvents(canonicalTransactionId),
        fetchTransactionProxyUpdatesWithClient(client, canonicalTransactionId, { limit: 100 }),
        fetchTransactionAppointments(client, [canonicalTransactionId], { viewer: 'internal' }),
        fetchBuyerProcessLeadHandoffForTransaction(client, canonicalTransactionId),
        fetchAgentBondOriginatorProgressView(client, canonicalTransactionId),
        fetchAgentBondApplicationIdentity(client, canonicalTransactionId),
        fetchAgentBondApplicationWorkspaceView(client, canonicalTransactionId),
        fetchAttorneyBondOriginatorHandoffView(client, canonicalTransactionId),
        fetchTransactionRolePlayersIfPossible(client, canonicalTransactionId),
        fetchNormalizedBondApplicationBundle(client, canonicalTransactionId),
        buildLiveTransactionChecklistData(client, {
          transaction: unitDetail.transaction,
          onboardingFormData: unitDetail.onboardingFormData || null,
          documents: unitDetail.documents || [],
          persistedRequirements: unitDetail.transactionRequiredDocuments || [],
        }),
        getAgentTransactionSyncReadModel(canonicalTransactionId, { client }),
      ])
      const setupHealth = resolveTransactionSetupHealthFromEvents(transactionEvents)
      const bondApplicationIdentity = buildBondApplicationIdentity({
        transaction: unitDetail.transaction || transaction,
        bondApplication,
        originatorProgress: bondOriginatorAgentProgressView,
        financeWorkflow: unitDetail.transactionFinanceWorkflow || null,
        serverIdentity: serverBondApplicationIdentity,
      })
      const bondApplicationWorkspace = buildAgentBondApplicationWorkspace({
        workspaceView: serverBondApplicationWorkspaceView,
        transaction: unitDetail.transaction || transaction,
        bondApplication,
        originatorProgress: bondOriginatorAgentProgressView,
        financeWorkflow: unitDetail.transactionFinanceWorkflow || null,
        serverIdentity: serverBondApplicationIdentity,
      })
      return {
        ...unitDetail,
        transactionRequiredDocuments: liveChecklist.requiredDocuments,
        requiredDocumentChecklist: liveChecklist.requiredDocumentChecklist,
        documentSummary: liveChecklist.documentSummary,
        documentChecklistInsights: liveChecklist.documentChecklistInsights,
        rolePlayers,
        transactionRolePlayers: rolePlayers,
        transaction_role_players: rolePlayers,
        transactionEvents,
        setupHealth,
        newTransactionSetupHealth: setupHealth,
        transactionProxyUpdates,
        appointments: appointmentsByTransactionId[canonicalTransactionId] || [],
        buyerProcessLeadHandoff,
        bondOriginatorAgentProgressView,
        bondApplicationIdentity,
        bondApplicationWorkspace,
        bondOriginatorAttorneyHandoffView,
        bondApplication,
        normalizedBondApplication: bondApplication,
        transactionSync,
      }
    }
  }

  const [
    unitQuery,
    buyerQuery,
    initialParticipantsQuery,
    rolePlayers,
    discussionRows,
    transactionEvents,
    transactionProxyUpdates,
    onboardingFormData,
    appointmentsByTransactionId,
    buyerProcessLeadHandoff,
  ] = await Promise.all([
    transaction.unit_id
      ? client
          .from('units')
          .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
          .eq('id', transaction.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.buyer_id
      ? client.from('buyers').select('id, name, phone, email').eq('id', transaction.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from('transaction_participants')
      .select(TRANSACTION_PARTICIPANT_FULL_SELECT)
      .eq('transaction_id', canonicalTransactionId),
    fetchTransactionRolePlayersIfPossible(client, canonicalTransactionId),
    fetchTransactionDiscussion(canonicalTransactionId, {
      unitId: transaction.unit_id || null,
      viewer: 'internal',
      includeLegacy: true,
      limit: 250,
    }),
    fetchTransactionEvents(canonicalTransactionId),
    fetchTransactionProxyUpdatesWithClient(client, canonicalTransactionId, {
      limit: 100,
    }),
    fetchOnboardingFormDataForTransaction(client, canonicalTransactionId, transaction?.purchaser_type || 'individual'),
    fetchTransactionAppointments(client, [canonicalTransactionId], {
      viewer: 'internal',
    }),
    fetchBuyerProcessLeadHandoffForTransaction(client, canonicalTransactionId),
  ])

  if (unitQuery.error && !isMissingSchemaError(unitQuery.error)) {
    throw unitQuery.error
  }
  if (buyerQuery.error && !isMissingSchemaError(buyerQuery.error)) {
    throw buyerQuery.error
  }
  let participantsQuery = initialParticipantsQuery
  if (
    participantsQuery.error &&
    (isMissingColumnError(participantsQuery.error, 'legal_role') ||
      isMissingColumnError(participantsQuery.error, 'status') ||
      isMissingColumnError(participantsQuery.error, 'firm_id') ||
      isMissingColumnError(participantsQuery.error, 'visibility_scope') ||
      isMissingColumnError(participantsQuery.error, 'invited_at') ||
      isMissingColumnError(participantsQuery.error, 'accepted_at') ||
      isMissingColumnError(participantsQuery.error, 'removed_at') ||
      isMissingColumnError(participantsQuery.error, 'invited_by_user_id') ||
      isMissingColumnError(participantsQuery.error, 'invitation_token') ||
      isMissingColumnError(participantsQuery.error, 'invitation_expires_at') ||
      isMissingColumnError(participantsQuery.error, 'is_internal') ||
      isMissingTransactionParticipantExtendedColumn(participantsQuery.error))
  ) {
    participantsQuery = await client
      .from('transaction_participants')
      .select(TRANSACTION_PARTICIPANT_LEGACY_SELECT)
      .eq('transaction_id', canonicalTransactionId)
  }
  if (participantsQuery.error && !isMissingSchemaError(participantsQuery.error)) {
    throw participantsQuery.error
  }

  const documents = await loadSharedDocuments(client, {
    transactionIds: [canonicalTransactionId],
    viewer: 'internal',
  })
  // Detail hydration is a read path. Keep missing workflow rows virtual so opening a
  // workspace never waits on writes or fails because the viewer cannot insert them.
  const transactionSubprocesses = await ensureTransactionSubprocesses(client, transaction.id, {
    createIfMissing: false,
  })
  let transactionFinanceWorkflow = null
  if (isBondFinanceType(transaction.finance_type)) {
    transactionFinanceWorkflow = await getTransactionFinanceWorkflow(transaction.id, {
      client,
      createIfMissing: true,
    })
  }
  try {
    await ensureTransactionChecklistItems({ transactionId: canonicalTransactionId })
  } catch (ensureError) {
    if (!isMissingSchemaError(ensureError)) {
      throw ensureError
    }
  }
  const [
    documentRequestsByTransactionId,
    checklistItemsByTransactionId,
    issueOverridesByTransactionId,
    transactionRequirementsByTransactionId,
  ] = await Promise.all([
    loadTransactionDocumentRequestsByIds(client, [canonicalTransactionId]),
    loadTransactionChecklistItemsByIds(client, [canonicalTransactionId]),
    loadTransactionIssueOverridesByIds(client, [canonicalTransactionId]),
    fetchTransactionRequiredDocumentsByTransactionIds(client, [canonicalTransactionId]),
  ])
  const transactionRequiredDocuments = transactionRequirementsByTransactionId[canonicalTransactionId] || []
  const liveChecklist = await buildLiveTransactionChecklistData(client, {
    transaction,
    onboardingFormData: onboardingFormData || null,
    documents,
    persistedRequirements: transactionRequiredDocuments,
  })
  const buyerRequirementProfile = getBuyerRequirementProfile({
    transaction,
    onboardingFormData,
    requiredDocumentChecklist: liveChecklist.requiredDocumentChecklist,
  })
  const buyerRequirementMissing = getMissingBuyerRequirementsFromProfile(
    buyerRequirementProfile,
    liveChecklist.requiredDocumentChecklist,
  )
  const buyerRequirementActions = getRequiredTransactionActions(
    buyerRequirementProfile,
    liveChecklist.requiredDocumentChecklist,
  )
  const buyerFicaReadiness = getBuyerFicaReadinessFromProfile(
    buyerRequirementProfile,
    liveChecklist.requiredDocumentChecklist,
  )
  const buyerFinanceReadiness = getBuyerFinanceReadinessFromProfile(
    buyerRequirementProfile,
    liveChecklist.requiredDocumentChecklist,
  )
  const transferReadinessFromBuyerDocs = getTransferReadinessFromBuyerDocsFromProfile(
    {
      ...buyerRequirementProfile,
      onboardingStatus: onboardingFormData?.status || null,
      onboarding: onboardingFormData || null,
    },
    liveChecklist.requiredDocumentChecklist,
  )
  const stageKey = resolveAttorneyOperationalStageKey({ transaction })
  const bondOriginatorAgentProgressView = await fetchAgentBondOriginatorProgressView(client, canonicalTransactionId)
  const serverBondApplicationIdentity = await fetchAgentBondApplicationIdentity(client, canonicalTransactionId)
  const serverBondApplicationWorkspaceView = await fetchAgentBondApplicationWorkspaceView(client, canonicalTransactionId)
  const bondOriginatorAttorneyHandoffView = await fetchAttorneyBondOriginatorHandoffView(client, canonicalTransactionId)
  const bondApplication = await fetchNormalizedBondApplicationBundle(client, canonicalTransactionId)
  const transactionSync = await getAgentTransactionSyncReadModel(canonicalTransactionId, { client })
  const bondApplicationIdentity = buildBondApplicationIdentity({
    transaction,
    bondApplication,
    originatorProgress: bondOriginatorAgentProgressView,
    financeWorkflow: transactionFinanceWorkflow,
    serverIdentity: serverBondApplicationIdentity,
  })
  const bondApplicationWorkspace = buildAgentBondApplicationWorkspace({
    workspaceView: serverBondApplicationWorkspaceView,
    transaction,
    bondApplication,
    originatorProgress: bondOriginatorAgentProgressView,
    financeWorkflow: transactionFinanceWorkflow,
    serverIdentity: serverBondApplicationIdentity,
  })
  const setupHealth = resolveTransactionSetupHealthFromEvents(transactionEvents)
  const normalizedTransactionParticipants = (participantsQuery.data || []).map((row) => normalizeTransactionParticipantRow(row))
  const buyerOperationalAudit = buildTransactionBuyerOperationalAudit({
    transaction,
    onboarding: null,
    participants: normalizedTransactionParticipants,
  })

  return {
    unit: unitQuery.data || transaction.property_unit || transaction.propertyUnit || null,
    development: transaction.property_development || transaction.propertyDevelopment || null,
    transaction: transaction || null,
    buyer: buyerQuery.data || null,
    documents,
    clientPortalLinks: [],
    clientIssues: [],
    alterationRequests: [],
    serviceReviews: [],
    trustInvestmentForm: null,
    handover: null,
    transactionSubprocesses,
    transactionFinanceWorkflow,
    onboarding: null,
    onboardingFormData: onboardingFormData || null,
    purchaserType: normalizePurchaserType(transaction?.purchaser_type),
    purchaserTypeLabel: getPurchaserTypeLabel(transaction?.purchaser_type),
    transactionRequiredDocuments: liveChecklist.requiredDocuments,
    rolePlayers,
    transactionRolePlayers: rolePlayers,
    transaction_role_players: rolePlayers,
    transactionParticipants: normalizedTransactionParticipants,
    buyerOperationalAudit,
    activeViewerRole: 'developer',
    activeViewerPermissions: getRolePermissions({
      role: 'developer',
      financeManagedBy: transaction?.finance_managed_by || 'bond_originator',
    }),
    transactionDiscussion: discussionRows || [],
    transactionStatusLink: null,
    developmentSettings: DEFAULT_DEVELOPMENT_SETTINGS,
    requiredDocumentChecklist: liveChecklist.requiredDocumentChecklist,
    documentSummary: liveChecklist.documentSummary,
    documentChecklistInsights: liveChecklist.documentChecklistInsights,
    buyerRequirementProfile,
    buyerRequirementSummary: {
      buyerType: buyerRequirementProfile.buyerType,
      buyerTypeLabel: buyerRequirementProfile.buyerTypeLabel,
      financeType: buyerRequirementProfile.financeType,
      financeTypeLabel: buyerRequirementProfile.financeTypeLabel,
      missingRequiredCount: buyerRequirementMissing.totalMissingCritical,
      missingCount: buyerRequirementMissing.totalMissing,
      totalRequiredCount: buyerRequirementMissing.totalRequired,
      hasOutstanding: buyerRequirementMissing.hasOutstanding,
    },
    missingBuyerRequirements: buyerRequirementMissing,
    requiredTransactionActions: buyerRequirementActions,
    buyerReadiness: {
      fica: buyerFicaReadiness,
      finance: buyerFinanceReadiness,
      transfer: transferReadinessFromBuyerDocs,
    },
    documentRequests: documentRequestsByTransactionId[canonicalTransactionId] || [],
    documentRequestSummary: summarizeDocumentRequests(documentRequestsByTransactionId[canonicalTransactionId] || []),
    transactionChecklistItems: checklistItemsByTransactionId[canonicalTransactionId] || [],
    checklistSummary: summarizeChecklistItems(checklistItemsByTransactionId[canonicalTransactionId] || [], {
      stageKey,
    }),
    issueOverrides: issueOverridesByTransactionId[canonicalTransactionId] || [],
    stage: normalizeStage(transaction?.stage, unitQuery.data?.status || 'Available'),
    mainStage: normalizeMainStage(
      transaction?.current_main_stage,
      transaction?.stage || unitQuery.data?.status || 'Available',
    ),
    transactionEvents,
    setupHealth,
    newTransactionSetupHealth: setupHealth,
    transactionProxyUpdates,
    appointments: appointmentsByTransactionId[canonicalTransactionId] || [],
    buyerProcessLeadHandoff,
    bondOriginatorAgentProgressView,
    bondApplicationIdentity,
    bondApplicationWorkspace,
    bondOriginatorAttorneyHandoffView,
    bondApplication,
    normalizedBondApplication: bondApplication,
    transactionSync,
  }
  } catch (loadError) {
    console.warn('[transaction-detail] full detail load failed; leaving core shell in place', {
      transactionId,
      canonicalTransactionId,
      message: loadError?.message || 'Unknown transaction detail load failure.',
    })
    return null
  }
}
