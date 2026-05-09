import {
  fetchClientPortalByToken,
  fetchClientPortalContextsByToken,
  fetchClientPortalCoreByToken,
} from '../lib/api'
import { generateClientPortalNextActions } from '../lib/clientPortalNextActionsEngine'
import {
  getClientPortalActivityFeed,
  groupClientActivityByDate,
} from './clientPortalActivityFeedService'
import {
  getClientPortalNotifications,
  syncNotificationsFromActivityFeed,
  syncNotificationsFromNextActions,
} from './clientPortalNotificationsService'
import {
  buildClientPortalEducationalContent,
  getEducationalContentForAction,
  getEducationalContentForDocument,
  getEducationalContentForRole,
  getEducationalContentForStage,
  getEducationalContentForRequirement,
} from '../content/clientPortalEducation'

function normalizeWorkspace(value = 'shared') {
  const normalized = String(value || 'shared').trim().toLowerCase()
  if (normalized === 'selling' || normalized === 'seller') return 'selling'
  if (normalized === 'buying' || normalized === 'buyer') return 'buying'
  return 'shared'
}

function hasActiveSellingContext(contexts = []) {
  return (contexts || []).some((context) => {
    const type = String(context?.contextType || context?.context_type || '').trim().toLowerCase()
    const status = String(context?.status || '').trim().toLowerCase()
    return type === 'selling' && ['active', 'pending'].includes(status)
  })
}

function resolveWorkspaceMode({ requestedWorkspace = 'shared', hasBuyingContext = true, hasSellingContext = false } = {}) {
  const normalizedWorkspace = normalizeWorkspace(requestedWorkspace)
  if (normalizedWorkspace === 'selling') {
    return hasSellingContext ? 'selling' : (hasBuyingContext ? 'buying' : 'shared')
  }
  if (normalizedWorkspace === 'buying') {
    return hasBuyingContext ? 'buying' : (hasSellingContext ? 'selling' : 'shared')
  }
  if (hasBuyingContext && hasSellingContext) return 'shared'
  if (hasSellingContext) return 'selling'
  return 'buying'
}

function normalizeDocumentStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable', 'cancelled'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'accepted') return 'approved'
  if (normalized === 'missing') return 'required'
  return 'required'
}

function normalizeAdditionalRequestAudience(request = {}) {
  const requestedFrom = String(request?.requestedFrom || request?.requested_from || '').trim().toLowerCase()
  return {
    buyer: requestedFrom === 'buyer' || requestedFrom === 'buyer_and_seller',
    seller: requestedFrom === 'seller' || requestedFrom === 'buyer_and_seller',
  }
}

function filterAdditionalRequestsByWorkspace(requests = [], workspaceMode = 'buying') {
  return (requests || []).filter((request) => {
    const visibility = String(request?.visibility || request?.visibility_scope || '').trim().toLowerCase()
    const clientVisible = request?.clientVisible === true || visibility === 'client_visible' || visibility === 'client'
    if (!clientVisible) return false

    const audience = normalizeAdditionalRequestAudience(request)
    if (workspaceMode === 'selling') return audience.seller
    if (workspaceMode === 'buying') return audience.buyer
    return audience.buyer || audience.seller
  })
}

function buildDocumentCenter(portalData, workspaceMode = 'buying') {
  const requiredDocuments = Array.isArray(portalData?.requiredDocuments) ? portalData.requiredDocuments : []
  const uploadedDocuments = Array.isArray(portalData?.documents) ? portalData.documents : []
  const additionalRequests = filterAdditionalRequestsByWorkspace(
    Array.isArray(portalData?.additionalDocumentRequests) ? portalData.additionalDocumentRequests : [],
    workspaceMode,
  )

  const statusFromDocument = (document = {}) =>
    normalizeDocumentStatus(document?.requiredDocumentStatus || document?.status || '')

  const approvedDocuments = requiredDocuments.filter((item) => {
    const status = statusFromDocument(item)
    return status === 'approved' || status === 'completed'
  })

  const rejectedDocuments = requiredDocuments.filter((item) => statusFromDocument(item) === 'rejected')
  const signedDocuments = uploadedDocuments.filter((document) => {
    const source = `${document?.document_type || ''} ${document?.name || ''} ${document?.category || ''}`.toLowerCase()
    return /signed|signature|otp|mandate/.test(source)
  })

  return {
    requiredDocuments,
    additionalRequests,
    uploadedDocuments,
    approvedDocuments,
    rejectedDocuments,
    signedDocuments,
  }
}

function buildLifecycle(portalData = {}) {
  const stage = portalData?.stage || portalData?.transaction?.stage || ''
  const mainStage = portalData?.mainStage || portalData?.transaction?.current_main_stage || ''
  return {
    stage,
    mainStage,
    updatedAt: portalData?.lastUpdated || portalData?.transaction?.updated_at || portalData?.transaction?.created_at || null,
  }
}

function buildTimeline(portalData = {}) {
  const discussion = Array.isArray(portalData?.discussion) ? portalData.discussion : []
  const events = Array.isArray(portalData?.events) ? portalData.events : []
  return {
    discussion,
    events,
    latestUpdateAt:
      discussion[0]?.createdAt ||
      discussion[0]?.created_at ||
      portalData?.lastUpdated ||
      portalData?.transaction?.updated_at ||
      null,
  }
}

function annotateNextActionsWithEducation(nextActions = []) {
  return (nextActions || []).map((action) => {
    const content = getEducationalContentForAction(action?.type || '')
    return {
      ...action,
      educationalSummary: content?.shortExplanation || '',
    }
  })
}

function buildRoleEducation(rolePlayers = {}) {
  const roles = [
    rolePlayers?.team?.assignedAgent ? 'agent' : '',
    rolePlayers?.team?.assignedAttorney ? 'attorney' : '',
    rolePlayers?.team?.assignedBondOriginator ? 'bond_originator' : '',
    rolePlayers?.team?.assignedAgent || rolePlayers?.team?.assignedAttorney ? 'developer' : '',
  ].filter(Boolean)
  return roles.map((role) => getEducationalContentForRole(role))
}

function buildLegacyPortalPayload({ portalData, contexts, hasBuyingContext, hasSellingContext, workspaceMode }) {
  const roles = hasSellingContext ? ['buyer', 'seller'] : ['buyer']
  const additionalDocumentRequests = filterAdditionalRequestsByWorkspace(
    Array.isArray(portalData?.additionalDocumentRequests) ? portalData.additionalDocumentRequests : [],
    workspaceMode,
  )

  return {
    ...portalData,
    additionalDocumentRequests,
    __portalType: 'buyer',
    __workspaceRoles: roles,
    __portalContexts: contexts,
    __hasBuyingContext: hasBuyingContext !== false,
    __hasSellingContext: Boolean(hasSellingContext),
  }
}

export async function resolveClientPortalContext(token) {
  const contextsResult = await fetchClientPortalContextsByToken(token).catch((error) => {
    console.warn('[client-portal-context] Failed to resolve contexts', { token, error })
    return { contexts: [], hasBuyingContext: true, hasSellingContext: false }
  })
  const contexts = Array.isArray(contextsResult?.contexts) ? contextsResult.contexts : []
  const hasSellingContext = Boolean(contextsResult?.hasSellingContext || hasActiveSellingContext(contexts))
  const hasBuyingContext = contextsResult?.hasBuyingContext !== false

  return {
    contexts,
    hasBuyingContext,
    hasSellingContext,
    workspaceRoles: hasSellingContext ? ['buyer', 'seller'] : ['buyer'],
  }
}

export async function getClientPortalWorkspaceData(token, workspace = 'shared', options = {}) {
  const { mode = 'full' } = options
  const context = await resolveClientPortalContext(token)
  const workspaceMode = resolveWorkspaceMode({
    requestedWorkspace: workspace,
    hasBuyingContext: context.hasBuyingContext,
    hasSellingContext: context.hasSellingContext,
  })

  const portalData = mode === 'core'
    ? await fetchClientPortalCoreByToken(token)
    : await fetchClientPortalByToken(token)

  const documentCenter = buildDocumentCenter(portalData, workspaceMode)
  const appointments = Array.isArray(portalData?.appointments) ? portalData.appointments : []
  const lifecycle = buildLifecycle(portalData)
  const timeline = buildTimeline(portalData)
  const clientRole = workspaceMode === 'selling' ? 'seller' : 'buyer'
  const activityFeed = getClientPortalActivityFeed({
    transactionId: portalData?.transaction?.id || null,
    portalData,
    workspaceMode,
  }, clientRole)
  const groupedActivityFeed = groupClientActivityByDate(activityFeed)
  const rawNextActions = generateClientPortalNextActions({
    portalContext: {
      token,
      workspace: workspaceMode,
    },
    workspaceMode,
    portalData,
    appointments,
    documentCenter,
    onboarding: portalData?.onboarding || null,
    mandate: {
      packet: portalData?.activeSellingContext?.mandatePacket || null,
    },
    transaction: portalData?.transaction || null,
    finance: {
      type: portalData?.transaction?.finance_type || null,
      readiness: portalData?.buyerReadiness?.finance || null,
    },
    lifecycle,
    timeline,
    activityFeed,
    groupedActivityFeed,
  })
  const nextActions = annotateNextActionsWithEducation(rawNextActions)
  let notifications = { unreadCount: 0, items: [] }
  const notificationContext = {
    token,
    clientRole,
    workspaceMode,
    transaction: portalData?.transaction || null,
    transactionId: portalData?.transaction?.id || null,
    nextActions,
    activityFeed,
    portalContext: {
      token,
      workspace: workspaceMode,
    },
  }
  try {
    if (mode !== 'core') {
      await Promise.all([
        syncNotificationsFromNextActions(notificationContext),
        syncNotificationsFromActivityFeed(notificationContext),
      ])
    }
    notifications = await getClientPortalNotifications(token, clientRole)
  } catch (notificationError) {
    console.warn('[client-portal-notifications] Failed to sync notifications', {
      token,
      workspaceMode,
      error: notificationError,
    })
  }
  const rolePlayers = {
    attorney: portalData?.attorneyRolePlayers || null,
    team: portalData?.transaction ? {
      assignedAgent: portalData.transaction.assigned_agent || null,
      assignedAttorney: portalData.transaction.attorney || null,
      assignedBondOriginator: portalData.transaction.bond_originator || null,
    } : null,
  }

  const educationalContent = buildClientPortalEducationalContent({
    stage: lifecycle?.stage || portalData?.transaction?.stage || '',
    mainStage: lifecycle?.mainStage || portalData?.transaction?.current_main_stage || '',
    financeType: portalData?.transaction?.finance_type || '',
    workspace: workspaceMode,
    nextActions,
    requiredDocuments: documentCenter?.requiredDocuments || [],
  })
  const stageEducation = getEducationalContentForStage(educationalContent?.currentStage?.stageKey || '')
  const documentEducation = (documentCenter?.requiredDocuments || []).slice(0, 6).map((item) =>
    getEducationalContentForDocument(item?.key || item?.label || ''),
  )

  const legacyPortalData = buildLegacyPortalPayload({
    portalData,
    contexts: context.contexts,
    hasBuyingContext: context.hasBuyingContext,
    hasSellingContext: context.hasSellingContext,
    workspaceMode,
  })

  return {
    portalContext: {
      token,
      workspace: workspaceMode,
      requestedWorkspace: normalizeWorkspace(workspace),
      contexts: context.contexts,
      hasBuyingContext: context.hasBuyingContext,
      hasSellingContext: context.hasSellingContext,
      workspaceRoles: context.workspaceRoles,
    },
    client: portalData?.buyer || null,
    transaction: portalData?.transaction || null,
    listing: null,
    property: portalData?.unit || null,
    appointments,
    rolePlayers,
    lifecycle,
    timeline,
    nextActions,
    documentCenter,
    onboarding: portalData?.onboarding || null,
    mandate: {
      packet: portalData?.activeSellingContext?.mandatePacket || null,
    },
    finance: {
      type: portalData?.transaction?.finance_type || null,
      readiness: portalData?.buyerReadiness?.finance || null,
    },
    activityFeed,
    notifications,
    educationalContent: {
      ...educationalContent,
      currentStage: {
        ...educationalContent?.currentStage,
        ...stageEducation,
      },
      rolePlayerGuidance: buildRoleEducation(rolePlayers),
      documentGuidance: documentEducation,
    },
    visibility: {
      workspace: workspaceMode,
      buyerVisible: workspaceMode !== 'selling',
      sellerVisible: workspaceMode !== 'buying',
      clientOnly: true,
    },
    permissions: {
      canUploadDocuments: true,
      canComment: true,
      canViewActivityFeed: true,
    },
    legacyPortalData,
  }
}
