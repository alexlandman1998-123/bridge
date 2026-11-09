// developments owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { ensureTransactionRequiredDocuments } from '../documents/requirementActions.js'
import { getDefaultTrustInvestmentForm, getDefaultOccupationalRentRecord, buildDefaultSubprocessState, fetchTransactionRowById } from '../transactions/workspaceReadApi.js'
import { readTimedCache, UNIT_WORKSPACE_SHELL_CACHE_TTL_MS, writeTimedCache, unitWorkspaceShellCache } from '../transactions/readCache.js'
import { summarizeDocumentRequests, summarizeChecklistItems, normalizeOnboardingRow, loadTransactionChecklistItemsByIds, loadTransactionIssueOverridesByIds } from '../transactions/readinessReadApi.js'
import { loadSharedDocuments, getSignedUrl } from '../documents/listReadApi.js'
import { fetchTransactionEvents, fetchTransactionProxyUpdatesWithClient } from '../transactions/activityReadApi.js'
import { normalizeStage, normalizeMainStage, getDefaultHandoverRecord } from '../../core/transactions/legacyReadModel.js'
import { loadTransactionDocumentRequestsByIds, fetchDocumentRequirements, buildRequiredChecklistFromRows, buildDocumentChecklist } from '../documents/requirementReadModel.js'
import { queryClientIssues } from './unitReadApi.js'
import { ensureDevelopmentSettings, DEFAULT_DEVELOPMENT_SETTINGS } from './configurationApi.js'
import { fetchDevelopmentProfile } from './detailReadApi.js'
import { requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { getPurchaserTypeLabel, normalizePurchaserType } from '../../lib/purchaserPersonas'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { buildTransactionBuyerOperationalAudit } from '../../core/transactions/transactionBuyerOperationalAudit.js'
import { getAttorneyMockTransactionDetailByUnitId } from '../../core/transactions/attorneyMockData'
import { resolveAttorneyOperationalStageKey } from '../../core/transactions/attorneyOperationalEngine'
import { getRolePermissions } from '../../core/transactions/permissions'
import { createPerfTimer } from '../../lib/performanceTrace'
import { fetchTransactionHandover, getOccupationalRentRecordFromEvents, syncTransactionSubprocessOwners, ensureTransactionParticipants } from '../transactions/workspaceHydration.js'
import { fetchTrustInvestmentFormForTransaction, fetchTransactionAppointments } from '../clientPortal/appointmentRead.js'
import { ensureTransactionSubprocesses } from '../transactions/subprocessApi.js'
import { fetchOnboardingFormDataForTransaction } from '../transactions/participantInfrastructure.js'
import { getTransactionFinanceWorkflow } from '../bond/financeRead.js'
import { ensureTransactionChecklistItems } from '../transactions/checklistApi.js'
import { fetchTransactionDiscussion } from '../transactions/discussionApi.js'
import { getOrCreateTransactionStatusLink } from '../transactions/statusShareApi.js'

async function fetchActiveTransactionForUnit(client, unitId) {
  const withActiveFlag = await client
    .from('transactions')
    .select(
      'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, reservation_proof_uploaded_at, reservation_payment_details, reservation_requested_at, reservation_email_sent_at, reservation_reviewed_at, reservation_reviewed_by, reservation_review_notes, stage, current_main_stage, current_sub_stage_summary, risk_status, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, comment, updated_at, created_at',
    )
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!withActiveFlag.error) {
    const activeRow = withActiveFlag.data
    if (!activeRow || normalizeStage(activeRow?.stage, null) === 'Available') {
      return null
    }
    return activeRow
  }

  if (
    !isMissingColumnError(withActiveFlag.error, 'risk_status') &&
    !isMissingColumnError(withActiveFlag.error, 'is_active') &&
    !isMissingColumnError(withActiveFlag.error, 'current_main_stage') &&
    !isMissingColumnError(withActiveFlag.error, 'current_sub_stage_summary') &&
    !isMissingColumnError(withActiveFlag.error, 'purchaser_type') &&
    !isMissingColumnError(withActiveFlag.error, 'finance_managed_by') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_agent_email') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_attorney_email') &&
    !isMissingColumnError(withActiveFlag.error, 'assigned_bond_originator_email') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_required') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_amount') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_status') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_paid_date') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_proof_document') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_proof_uploaded_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_payment_details') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_requested_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_email_sent_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_reviewed_at') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_reviewed_by') &&
    !isMissingColumnError(withActiveFlag.error, 'reservation_review_notes') &&
    !isMissingColumnError(withActiveFlag.error, 'comment')
  ) {
    throw withActiveFlag.error
  }

  let fallback = await client
    .from('transactions')
    .select(
      'id, unit_id, buyer_id, finance_type, purchaser_type, finance_managed_by, reservation_required, reservation_amount, reservation_status, reservation_paid_date, reservation_proof_document, stage, current_main_stage, current_sub_stage_summary, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, next_action, comment, updated_at, created_at',
    )
    .eq('unit_id', unitId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (
    fallback.error &&
    (isMissingColumnError(fallback.error, 'current_main_stage') ||
      isMissingColumnError(fallback.error, 'current_sub_stage_summary') ||
      isMissingColumnError(fallback.error, 'purchaser_type') ||
      isMissingColumnError(fallback.error, 'finance_managed_by') ||
      isMissingColumnError(fallback.error, 'assigned_agent_email') ||
      isMissingColumnError(fallback.error, 'assigned_attorney_email') ||
      isMissingColumnError(fallback.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(fallback.error, 'reservation_required') ||
      isMissingColumnError(fallback.error, 'reservation_amount') ||
      isMissingColumnError(fallback.error, 'reservation_status') ||
      isMissingColumnError(fallback.error, 'reservation_paid_date') ||
      isMissingColumnError(fallback.error, 'reservation_proof_document') ||
      isMissingColumnError(fallback.error, 'comment'))
  ) {
    fallback = await client
      .from('transactions')
      .select(
        'id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at',
      )
      .eq('unit_id', unitId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  if (fallback.error) {
    throw fallback.error
  }

  if (!fallback.data || normalizeStage(fallback.data?.stage, null) === 'Available') {
    return null
  }

  return fallback.data
}

const unitWorkspaceShellInFlight = new Map()

export async function fetchUnitWorkspaceShell(unitId) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) {
    return null
  }

  const timer = createPerfTimer('api.fetchUnitWorkspaceShell', {
    unitId: normalizedUnitId,
  })
  const cached = readTimedCache(unitWorkspaceShellCache, normalizedUnitId, UNIT_WORKSPACE_SHELL_CACHE_TTL_MS)
  if (cached) {
    timer.mark('cache_hit')
    timer.end({ cached: true })
    return cached
  }

  if (unitWorkspaceShellInFlight.has(normalizedUnitId)) {
    timer.mark('inflight_hit')
    const inFlight = await unitWorkspaceShellInFlight.get(normalizedUnitId)
    timer.end({ cached: false, inFlight: true })
    return inFlight
  }

  const loader = (async () => {
    const client = requireClient()
    let resolvedUnitId = normalizedUnitId

    timer.mark('unit_query_start')
    let unitQuery = await client
      .from('units')
      .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
      .eq('id', resolvedUnitId)
      .maybeSingle()
    timer.mark('unit_query_end')

    if (unitQuery.error) {
      throw unitQuery.error
    }

    let unit = unitQuery.data || null
    let transactionByRouteId = null
    if (!unit) {
      transactionByRouteId = await fetchTransactionRowById(client, resolvedUnitId)
      if (transactionByRouteId?.unit_id) {
        resolvedUnitId = transactionByRouteId.unit_id
        timer.mark('unit_query_by_transaction_start')
        unitQuery = await client
          .from('units')
          .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
          .eq('id', resolvedUnitId)
          .maybeSingle()
        timer.mark('unit_query_by_transaction_end')

        if (unitQuery.error) {
          throw unitQuery.error
        }
        unit = unitQuery.data || null
      }
    }

    if (!unit) {
      if (transactionByRouteId?.id && transactionByRouteId?.is_active !== false) {
        let buyer = null
        if (transactionByRouteId.buyer_id) {
          timer.mark('buyer_query_transaction_only_start')
          const buyerQuery = await client
            .from('buyers')
            .select('id, name, phone, email')
            .eq('id', transactionByRouteId.buyer_id)
            .maybeSingle()
          timer.mark('buyer_query_transaction_only_end')

          if (buyerQuery.error && !isMissingSchemaError(buyerQuery.error)) {
            throw buyerQuery.error
          }
          buyer = buyerQuery.data || null
        }

        let development = null
        if (transactionByRouteId.development_id) {
          timer.mark('development_query_transaction_only_start')
          const developmentQuery = await client
            .from('developments')
            .select('id, name, location')
            .eq('id', transactionByRouteId.development_id)
            .maybeSingle()
          timer.mark('development_query_transaction_only_end')

          if (developmentQuery.error && !isMissingSchemaError(developmentQuery.error)) {
            throw developmentQuery.error
          }
          development = developmentQuery.data || null
        }

        const stage = normalizeStage(transactionByRouteId.stage, transactionByRouteId.stage || 'Transfer in Progress')
        const mainStage = normalizeMainStage(transactionByRouteId.current_main_stage, stage)
        const attorneyStage = resolveAttorneyOperationalStageKey({
          transaction: transactionByRouteId,
        })
        const shell = {
          unit: null,
          development,
          transaction: transactionByRouteId,
          buyer,
          documents: [],
          clientPortalLinks: [],
          clientIssues: [],
          alterationRequests: [],
          serviceReviews: [],
          trustInvestmentForm: getDefaultTrustInvestmentForm({
            developmentId: transactionByRouteId.development_id || null,
            unitId: null,
            transaction: transactionByRouteId,
            buyer,
          }),
          handover: getDefaultHandoverRecord({
            developmentId: transactionByRouteId.development_id || null,
            unitId: null,
            transaction: transactionByRouteId,
            buyer,
          }),
          occupationalRent: getDefaultOccupationalRentRecord({
            developmentId: transactionByRouteId.development_id || null,
            unitId: null,
            transaction: transactionByRouteId,
            buyer,
          }),
          transactionSubprocesses: buildDefaultSubprocessState(transactionByRouteId.id, {
            financeType: transactionByRouteId.finance_type,
          }),
          onboarding: null,
          onboardingFormData: null,
          purchaserType: normalizePurchaserType(transactionByRouteId.purchaser_type),
          purchaserTypeLabel: getPurchaserTypeLabel(transactionByRouteId.purchaser_type),
          transactionRequiredDocuments: [],
          transactionParticipants: [],
          activeViewerRole: 'developer',
          activeViewerPermissions: getRolePermissions({
            role: 'developer',
            financeManagedBy: transactionByRouteId.finance_managed_by,
          }),
          transactionDiscussion: [],
          transactionStatusLink: null,
          transactionEvents: [],
          documentRequests: [],
          documentRequestSummary: summarizeDocumentRequests([]),
          transactionChecklistItems: [],
          checklistSummary: summarizeChecklistItems([], {
            stageKey: attorneyStage,
          }),
          issueOverrides: [],
          developmentSettings: DEFAULT_DEVELOPMENT_SETTINGS,
          requiredDocumentChecklist: [],
          documentSummary: {
            uploadedCount: 0,
            totalRequired: 0,
            missingCount: 0,
          },
          stage,
          mainStage,
          __isShell: true,
          __loadedAt: new Date().toISOString(),
        }

        writeTimedCache(unitWorkspaceShellCache, normalizedUnitId, shell)
        timer.end({ found: true, transactionOnly: true, hasTransaction: true })
        return shell
      }

      timer.end({ found: false })
      return null
    }

    timer.mark('transaction_query_start')
    const transaction = await fetchActiveTransactionForUnit(client, resolvedUnitId)
    timer.mark('transaction_query_end', {
      hasTransaction: Boolean(transaction?.id),
    })

    let buyer = null
    if (transaction?.buyer_id) {
      timer.mark('buyer_query_start')
      const buyerQuery = await client
        .from('buyers')
        .select('id, name, phone, email')
        .eq('id', transaction.buyer_id)
        .maybeSingle()
      timer.mark('buyer_query_end')

      if (buyerQuery.error && !isMissingSchemaError(buyerQuery.error)) {
        throw buyerQuery.error
      }
      buyer = buyerQuery.data || null
    }

    let onboarding = null
    let clientPortalLinks = []
    if (transaction?.id) {
      timer.mark('shell_metadata_query_start')
      const [onboardingQuery, portalLinksQuery] = await Promise.all([
        client
          .from('transaction_onboarding')
          .select('id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at')
          .eq('transaction_id', transaction.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        client
          .from('client_portal_links')
          .select('id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
          .eq('transaction_id', transaction.id)
          .order('created_at', { ascending: false }),
      ])
      timer.mark('shell_metadata_query_end')

      if (
        onboardingQuery.error &&
        !isMissingTableError(onboardingQuery.error, 'transaction_onboarding') &&
        !isMissingColumnError(onboardingQuery.error, 'is_active') &&
        !isMissingSchemaError(onboardingQuery.error)
      ) {
        throw onboardingQuery.error
      }

      onboarding = onboardingQuery.data ? normalizeOnboardingRow(onboardingQuery.data) : null
      if (portalLinksQuery.error && !isMissingSchemaError(portalLinksQuery.error)) {
        throw portalLinksQuery.error
      }
      clientPortalLinks = portalLinksQuery.data || []
    }

    const stage = normalizeStage(transaction?.stage, unit.status)
    const mainStage = normalizeMainStage(transaction?.current_main_stage, stage)
    const attorneyStage = resolveAttorneyOperationalStageKey({ transaction })

    const shell = {
      unit,
      transaction,
      buyer,
      documents: [],
      clientPortalLinks,
      clientIssues: [],
      alterationRequests: [],
      serviceReviews: [],
      trustInvestmentForm: getDefaultTrustInvestmentForm({
        developmentId: unit.development_id,
        unitId: unit.id,
        transaction,
        buyer,
      }),
      handover: getDefaultHandoverRecord({
        developmentId: unit.development_id,
        unitId: unit.id,
        transaction,
        buyer,
      }),
      occupationalRent: getDefaultOccupationalRentRecord({
        developmentId: unit.development_id,
        unitId: unit.id,
        transaction,
        buyer,
      }),
      transactionSubprocesses: buildDefaultSubprocessState(transaction?.id || null),
      onboarding,
      onboardingFormData: null,
      purchaserType: normalizePurchaserType(transaction?.purchaser_type),
      purchaserTypeLabel: getPurchaserTypeLabel(transaction?.purchaser_type),
      transactionRequiredDocuments: [],
      transactionParticipants: [],
      activeViewerRole: 'developer',
      activeViewerPermissions: getRolePermissions({
        role: 'developer',
        financeManagedBy: transaction?.finance_managed_by,
      }),
      transactionDiscussion: [],
      transactionStatusLink: null,
      transactionEvents: [],
      documentRequests: [],
      documentRequestSummary: summarizeDocumentRequests([]),
      transactionChecklistItems: [],
      checklistSummary: summarizeChecklistItems([], {
        stageKey: attorneyStage,
      }),
      issueOverrides: [],
      developmentSettings: DEFAULT_DEVELOPMENT_SETTINGS,
      requiredDocumentChecklist: [],
      documentSummary: {
        uploadedCount: 0,
        totalRequired: 0,
        missingCount: 0,
      },
      stage,
      mainStage,
      __isShell: true,
      __loadedAt: new Date().toISOString(),
    }

    writeTimedCache(unitWorkspaceShellCache, normalizedUnitId, shell)
    timer.end({ found: true, hasTransaction: Boolean(transaction?.id) })
    return shell
  })()

  unitWorkspaceShellInFlight.set(normalizedUnitId, loader)
  try {
    return await loader
  } finally {
    unitWorkspaceShellInFlight.delete(normalizedUnitId)
  }
}

export async function prefetchUnitWorkspaceShell(unitId) {
  const normalizedUnitId = String(unitId || '').trim()
  if (!normalizedUnitId) {
    return
  }

  try {
    await fetchUnitWorkspaceShell(normalizedUnitId)
  } catch {
    // Prefetch is best-effort only.
  }
}

export async function fetchUnitDetail(unitId) {
  const timer = createPerfTimer('api.fetchUnitDetail', {
    unitId: String(unitId || ''),
  })
  const mockDetail = getAttorneyMockTransactionDetailByUnitId(unitId)
  if (mockDetail) {
    timer.end({ mock: true })
    return mockDetail
  }

  const client = requireClient()

  let resolvedUnitId = unitId
  let unit = null

  timer.mark('unit_query_start')
  let unitQuery = await client
    .from('units')
    .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
    .eq('id', resolvedUnitId)
    .maybeSingle()
  timer.mark('unit_query_end')

  if (unitQuery.error) {
    throw unitQuery.error
  }

  unit = unitQuery.data || null

  // Some navigation paths can still pass a transaction id into /units/:unitId.
  // Resolve that to its parent unit id so detail pages don't false-fail.
  if (!unit && resolvedUnitId) {
    let transactionByRouteId = null
    try {
      transactionByRouteId = await fetchTransactionRowById(client, resolvedUnitId)
    } catch (routeLookupError) {
      const recoverableRouteLookupError =
        isMissingSchemaError(routeLookupError) ||
        isPermissionDeniedError(routeLookupError) ||
        isMissingColumnError(routeLookupError)
      if (!recoverableRouteLookupError) {
        throw routeLookupError
      }
    }

    if (transactionByRouteId?.unit_id) {
      resolvedUnitId = transactionByRouteId.unit_id
      timer.mark('unit_query_by_transaction_start')
      unitQuery = await client
        .from('units')
        .select('id, development_id, unit_number, phase, price, status, development:developments(id, name)')
        .eq('id', resolvedUnitId)
        .maybeSingle()
      timer.mark('unit_query_by_transaction_end')

      if (unitQuery.error) {
        throw unitQuery.error
      }

      unit = unitQuery.data || null
    }
  }

  if (!unit) {
    timer.end({ found: false })
    return null
  }

  let developmentProfile = null
  try {
    developmentProfile = await fetchDevelopmentProfile(client, unit.development_id, { strictMedia: false })
  } catch (profileError) {
    if (!isMissingTableError(profileError, 'development_profiles') && !isPermissionDeniedError(profileError)) {
      throw profileError
    }
  }

  if (developmentProfile) {
    unit = {
      ...unit,
      development: {
        ...(unit.development || {}),
        profile: developmentProfile,
        developer_company: developmentProfile.developerCompany || unit.development?.developer_company || '',
        address: developmentProfile.address || unit.development?.address || '',
        formatted_address: developmentProfile.formattedAddress || unit.development?.formatted_address || '',
        street_address: developmentProfile.streetAddress || unit.development?.street_address || '',
        suburb: developmentProfile.suburb || unit.development?.suburb || '',
        city: developmentProfile.city || unit.development?.city || '',
        province: developmentProfile.province || unit.development?.province || '',
        country: developmentProfile.country || unit.development?.country || '',
        sellerDetails: developmentProfile.sellerDetails || null,
        seller_details: developmentProfile.sellerDetails || null,
      },
    }
  }

  timer.mark('transaction_query_start')
  const transaction = await fetchActiveTransactionForUnit(client, resolvedUnitId)
  timer.mark('transaction_query_end', {
    hasTransaction: Boolean(transaction?.id),
  })
  const mainStage = normalizeMainStage(transaction?.current_main_stage, transaction?.stage || unit.status)

  let buyer = null
  let documents = []
  let clientPortalLinks = []
  let clientIssues = []
  let alterationRequests = []
  let serviceReviews = []
  let trustInvestmentForm = getDefaultTrustInvestmentForm({
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  let handover = getDefaultHandoverRecord({
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  let occupationalRent = getDefaultOccupationalRentRecord({
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  let transactionSubprocesses = buildDefaultSubprocessState(transaction?.id || null)
  let transactionFinanceWorkflow = null
  let onboarding = null
  let transactionRequiredDocuments = []
  let transactionParticipants = []
  let activeViewerRole = 'developer'
  let activeViewerPermissions = getRolePermissions({
    role: 'developer',
    financeManagedBy: transaction?.finance_managed_by,
  })
  let transactionDiscussion = []
  let transactionStatusLink = null
  let transactionEvents = []
  let transactionProxyUpdates = []
  let appointments = []
  let documentRequests = []
  let transactionChecklistItems = []
  let issueOverrides = []

  if (transaction?.buyer_id) {
    timer.mark('buyer_query_start')
    const { data: buyerData, error: buyerError } = await client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('id', transaction.buyer_id)
      .maybeSingle()
    timer.mark('buyer_query_end')

    if (buyerError) {
      throw buyerError
    }

    buyer = buyerData || null
  }

  if (transaction?.id) {
    timer.mark('documents_query_start')
    documents = await loadSharedDocuments(client, {
      transactionIds: [transaction.id],
      viewer: 'internal',
    })
    timer.mark('documents_query_end')

    timer.mark('portal_links_query_start')
    const { data: portalLinksData, error: portalLinksError } = await client
      .from('client_portal_links')
      .select('id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
      .eq('transaction_id', transaction.id)
      .order('created_at', { ascending: false })
    timer.mark('portal_links_query_end')

    if (portalLinksError) {
      if (!isMissingSchemaError(portalLinksError)) {
        throw portalLinksError
      }
    } else {
      clientPortalLinks = portalLinksData || []
    }

    timer.mark('workflow_query_start')
    transactionSubprocesses = await ensureTransactionSubprocesses(client, transaction.id)
    transactionSubprocesses = await syncTransactionSubprocessOwners(client, transaction, transactionSubprocesses)
    if (isBondFinanceType(transaction.finance_type)) {
      transactionFinanceWorkflow = await getTransactionFinanceWorkflow(transaction.id, {
        client,
        createIfMissing: true,
      })
    }
    timer.mark('workflow_query_end')

    try {
      const participantsResult = await ensureTransactionParticipants(client, {
        transaction,
        buyer,
      })
      transactionParticipants = participantsResult.participants
      activeViewerRole = participantsResult.viewerRole
      activeViewerPermissions = participantsResult.viewerPermissions
    } catch (participantsError) {
      const recoverableParticipantsError =
        isMissingSchemaError(participantsError) ||
        isMissingColumnError(participantsError) ||
        isPermissionDeniedError(participantsError)
      if (!recoverableParticipantsError) {
        throw participantsError
      }
    }

    try {
      timer.mark('comments_query_start')
      transactionDiscussion = await fetchTransactionDiscussion(transaction.id, {
        unitId: unit.id,
        viewer: 'internal',
      })
      timer.mark('comments_query_end')
    } catch (discussionError) {
      if (!isMissingSchemaError(discussionError)) {
        throw discussionError
      }
    }

    try {
      timer.mark('status_link_query_start')
      transactionStatusLink = await getOrCreateTransactionStatusLink({
        transactionId: transaction.id,
        createdByRole: activeViewerRole,
      })
      timer.mark('status_link_query_end')
    } catch (statusLinkError) {
      const missingStatusSchema =
        isMissingSchemaError(statusLinkError) ||
        /status links are not set up yet/i.test(String(statusLinkError?.message || ''))
      if (!missingStatusSchema) {
        throw statusLinkError
      }
    }

    try {
      timer.mark('events_query_start')
      transactionEvents = await fetchTransactionEvents(transaction.id, {
        limit: 250,
      })
      timer.mark('events_query_end')
    } catch (transactionEventsError) {
      if (!isMissingSchemaError(transactionEventsError)) {
        throw transactionEventsError
      }
    }

    try {
      timer.mark('proxy_updates_query_start')
      transactionProxyUpdates = await fetchTransactionProxyUpdatesWithClient(client, transaction.id, { limit: 100 })
      timer.mark('proxy_updates_query_end')
    } catch (proxyUpdatesError) {
      if (!isMissingSchemaError(proxyUpdatesError)) {
        throw proxyUpdatesError
      }
    }

    try {
      const appointmentsByTransactionId = await fetchTransactionAppointments(client, [transaction.id], {
        viewer: 'internal',
      })
      appointments = appointmentsByTransactionId[transaction.id] || []
    } catch (appointmentsError) {
      if (!isMissingSchemaError(appointmentsError)) {
        throw appointmentsError
      }
    }

    try {
      timer.mark('operational_queries_start')
      const [documentRequestsByTransactionId, checklistItemsByTransactionId, issueOverridesByTransactionId] =
        await Promise.all([
          loadTransactionDocumentRequestsByIds(client, [transaction.id]),
          loadTransactionChecklistItemsByIds(client, [transaction.id]),
          loadTransactionIssueOverridesByIds(client, [transaction.id]),
        ])
      timer.mark('operational_queries_end')
      documentRequests = documentRequestsByTransactionId[transaction.id] || []
      transactionChecklistItems = checklistItemsByTransactionId[transaction.id] || []
      issueOverrides = issueOverridesByTransactionId[transaction.id] || []
    } catch (operationalError) {
      if (!isMissingSchemaError(operationalError)) {
        throw operationalError
      }
    }

    timer.mark('onboarding_record_start')
    onboarding = await getOrCreateTransactionOnboardingRecord(client, {
      transactionId: transaction.id,
      purchaserType: transaction.purchaser_type,
    })
    timer.mark('onboarding_record_end')

    timer.mark('required_documents_start')
    transactionRequiredDocuments = await ensureTransactionRequiredDocuments(client, {
      transactionId: transaction.id,
      purchaserType: transaction.purchaser_type,
      financeType: normalizeFinanceType(transaction.finance_type || 'cash'),
      reservationRequired: Boolean(transaction.reservation_required),
      cashAmount: transaction.cash_amount,
      bondAmount: transaction.bond_amount,
    })
    timer.mark('required_documents_end')

    try {
      timer.mark('checklist_ensure_start')
      await ensureTransactionChecklistItems({
        transactionId: transaction.id,
      })
      const [documentRequestsByTransactionId, checklistItemsByTransactionId, issueOverridesByTransactionId] =
        await Promise.all([
          loadTransactionDocumentRequestsByIds(client, [transaction.id]),
          loadTransactionChecklistItemsByIds(client, [transaction.id]),
          loadTransactionIssueOverridesByIds(client, [transaction.id]),
        ])
      timer.mark('checklist_ensure_end')
      documentRequests = documentRequestsByTransactionId[transaction.id] || documentRequests
      transactionChecklistItems = checklistItemsByTransactionId[transaction.id] || transactionChecklistItems
      issueOverrides = issueOverridesByTransactionId[transaction.id] || issueOverrides
    } catch (checklistEnsureError) {
      if (!isMissingSchemaError(checklistEnsureError)) {
        throw checklistEnsureError
      }
    }
  }

  timer.mark('settings_query_start')
  const settings = await ensureDevelopmentSettings(client, unit.development_id)
  timer.mark('settings_query_end')

  const clientIssuesQuery = await queryClientIssues(client, {
    unitId: unit.id,
  })

  if (clientIssuesQuery.error) {
    if (!isMissingSchemaError(clientIssuesQuery.error)) {
      throw clientIssuesQuery.error
    }
  } else {
    clientIssues = await Promise.all(
      (clientIssuesQuery.data || []).map(async (item) => ({
        ...item,
        photo_url: item.photo_path ? await getSignedUrl(item.photo_path) : null,
      })),
    )
  }

  let alterationRequestsQuery = await client
    .from('alteration_requests')
    .select(
      'id, development_id, unit_id, transaction_id, buyer_id, title, category, description, budget_range, preferred_timing, reference_image_path, amount_inc_vat, charge_treatment, invoice_path, proof_of_payment_path, status, created_at, updated_at',
    )
    .eq('unit_id', unit.id)
    .order('created_at', { ascending: false })

  if (
    alterationRequestsQuery.error &&
    (isMissingColumnError(alterationRequestsQuery.error, 'transaction_id') ||
      isMissingColumnError(alterationRequestsQuery.error, 'charge_treatment'))
  ) {
    alterationRequestsQuery = await client
      .from('alteration_requests')
      .select(
        'id, development_id, unit_id, buyer_id, title, category, description, budget_range, preferred_timing, amount_inc_vat, invoice_path, proof_of_payment_path, status, created_at',
      )
      .eq('unit_id', unit.id)
      .order('created_at', { ascending: false })
  }

  if (alterationRequestsQuery.error) {
    if (!isMissingSchemaError(alterationRequestsQuery.error)) {
      throw alterationRequestsQuery.error
    }
  } else {
    alterationRequests = await Promise.all(
      (alterationRequestsQuery.data || []).map(async (item) => ({
        ...item,
        reference_image_url: item.reference_image_path ? await getSignedUrl(item.reference_image_path) : null,
        invoice_url: item.invoice_path ? await getSignedUrl(item.invoice_path) : null,
        proof_url: item.proof_of_payment_path ? await getSignedUrl(item.proof_of_payment_path) : null,
      })),
    )
  }

  let serviceReviewsQuery = await client
    .from('service_reviews')
    .select(
      'id, development_id, unit_id, transaction_id, buyer_id, rating, review_text, positives, improvements, allow_marketing_use, created_at, updated_at',
    )
    .eq('unit_id', unit.id)
    .order('created_at', { ascending: false })

  if (serviceReviewsQuery.error && isMissingColumnError(serviceReviewsQuery.error, 'transaction_id')) {
    serviceReviewsQuery = await client
      .from('service_reviews')
      .select('id, development_id, unit_id, buyer_id, rating, review_text, positives, improvements, created_at')
      .eq('unit_id', unit.id)
      .order('created_at', { ascending: false })
  }

  if (serviceReviewsQuery.error) {
    if (!isMissingSchemaError(serviceReviewsQuery.error)) {
      throw serviceReviewsQuery.error
    }
  } else {
    serviceReviews = serviceReviewsQuery.data || []
  }

  trustInvestmentForm = await fetchTrustInvestmentFormForTransaction(client, {
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  handover = await fetchTransactionHandover(client, {
    developmentId: unit.development_id,
    unitId: unit.id,
    transaction,
    buyer,
  })
  occupationalRent = getOccupationalRentRecordFromEvents(transactionEvents, occupationalRent)

  const requirements = await fetchDocumentRequirements(client, unit.development_id)
  const checklistResult = transactionRequiredDocuments.length
    ? buildRequiredChecklistFromRows(transactionRequiredDocuments, documents)
    : buildDocumentChecklist(requirements, documents)
  const attorneyStage = resolveAttorneyOperationalStageKey({ transaction })

  timer.mark('onboarding_form_query_start')
  const onboardingFormData = transaction?.id
    ? await fetchOnboardingFormDataForTransaction(client, transaction.id, transaction?.purchaser_type)
    : null
  timer.mark('onboarding_form_query_end')
  const buyerOperationalAudit = buildTransactionBuyerOperationalAudit({
    transaction,
    onboarding,
    participants: transactionParticipants,
  })

  const payload = {
    unit,
    transaction,
    buyer,
    documents,
    clientPortalLinks,
    clientIssues,
    alterationRequests,
    serviceReviews,
    trustInvestmentForm,
    handover,
    occupationalRent,
    transactionSubprocesses,
    transactionFinanceWorkflow,
    onboarding,
    onboardingFormData,
    purchaserType: normalizePurchaserType(transaction?.purchaser_type),
    purchaserTypeLabel: getPurchaserTypeLabel(transaction?.purchaser_type),
    transactionRequiredDocuments,
    transactionParticipants,
    buyerOperationalAudit,
    activeViewerRole,
    activeViewerPermissions,
    transactionDiscussion,
    transactionStatusLink,
    transactionEvents,
    transactionProxyUpdates,
    appointments,
    documentRequests,
    documentRequestSummary: summarizeDocumentRequests(documentRequests),
    transactionChecklistItems,
    checklistSummary: summarizeChecklistItems(transactionChecklistItems, {
      stageKey: attorneyStage,
    }),
    issueOverrides,
    developmentSettings: settings,
    requiredDocumentChecklist: checklistResult.checklist,
    documentSummary: checklistResult.summary,
    stage: normalizeStage(transaction?.stage, unit.status),
    mainStage,
  }
  timer.end({
    found: true,
    hasTransaction: Boolean(transaction?.id),
    documents: payload.documents?.length || 0,
    comments: payload.transactionDiscussion?.length || 0,
  })
  return payload
}
