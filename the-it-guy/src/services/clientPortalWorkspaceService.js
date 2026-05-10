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
  resolvePortalStageKey,
} from '../content/clientPortalEducation'
import { getTransactionWorkflowReadModel } from './transactionWorkflowReadModelService'

function normalizeWorkspace(value = 'shared') {
  const normalized = String(value || 'shared').trim().toLowerCase()
  if (normalized === 'selling' || normalized === 'seller') return 'selling'
  if (normalized === 'buying' || normalized === 'buyer') return 'buying'
  return 'shared'
}

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeLaneKey(value = '') {
  const normalized = normalizeValue(value)
  if (normalized === 'attorney' || normalized === 'transfer_attorney') return 'transfer'
  if (normalized === 'bond_attorney') return 'bond'
  return normalized
}

function dedupeByKey(items = [], keyGetter = (item) => item?.id) {
  const map = new Map()
  for (const item of items || []) {
    if (!item) continue
    const key = String(keyGetter(item) || '').trim()
    if (!key || map.has(key)) continue
    map.set(key, item)
  }
  return [...map.values()]
}

function getStageProgressPercent(mainStage = '', stage = '') {
  if (normalizeValue(stage).includes('registered')) return 100
  const map = {
    avail: 8,
    dep: 20,
    otp: 35,
    fin: 52,
    atty: 68,
    xfer: 82,
    reg: 95,
  }
  return map[normalizeValue(mainStage)] || 12
}

function getClientLaneLabel(laneKey = '') {
  const normalized = normalizeLaneKey(laneKey)
  if (normalized === 'finance') return 'Finance'
  if (normalized === 'transfer') return 'Transfer'
  if (normalized === 'bond') return 'Bond Registration'
  return 'Progress'
}

function mapLaneStepToClientText(laneKey = '', step = null, fallback = '') {
  const normalizedLane = normalizeLaneKey(laneKey)
  const stepKey = normalizeValue(step?.key)
  const byLane = {
    finance: {
      bond_application_submitted: 'Your bond application has been submitted.',
      bond_approved: 'Your bond has been approved.',
      grant_issued: 'Your grant has been issued.',
      grant_signed: 'Your grant has been signed.',
    },
    transfer: {
      transfer_documents_prepared: 'The attorneys are preparing your transfer documents.',
      buyer_signed_transfer_documents: 'Buyer transfer documents have been signed.',
      seller_signed_transfer_documents: 'Seller transfer documents have been signed.',
      rates_clearance_requested: 'Rates clearance is in progress.',
      rates_clearance_uploaded: 'Rates clearance has been received.',
      levy_clearance_uploaded: 'Levy clearance has been received.',
      guarantees_received: 'Guarantees have been received.',
      lodgement_submitted: 'Your transfer has been lodged.',
      registration_confirmed: 'Registration has been completed.',
    },
    bond: {
      bond_documents_prepared: 'Your bond registration documents are being prepared.',
      buyer_signed_bond_documents: 'Bond signing has been completed.',
      bond_lodgement_submitted: 'Your bond registration has been lodged.',
      bond_registration_confirmed: 'Your bond registration has been completed.',
    },
  }
  if (byLane[normalizedLane]?.[stepKey]) return byLane[normalizedLane][stepKey]
  return fallback || String(step?.label || '').trim() || 'This part of your transaction is in progress.'
}

function mapWaitingOnKeyToSummary(waitingOnKey = '') {
  const normalized = normalizeValue(waitingOnKey)
  if (normalized === 'waiting_on_client') {
    return {
      key: 'waiting_on_client',
      label: 'Waiting on you',
      description: 'We need something from you before this can move forward.',
    }
  }
  if (normalized === 'waiting_on_attorney' || normalized === 'waiting_on_transfer') {
    return {
      key: 'waiting_on_attorney',
      label: 'Waiting on Attorneys',
      description: 'The attorneys are working on the transfer steps.',
    }
  }
  if (normalized === 'waiting_on_bond' || normalized === 'waiting_on_bond_originator') {
    return {
      key: 'waiting_on_bond_originator',
      label: 'Waiting on Bond Team',
      description: 'The bond team is progressing the finance and registration steps.',
    }
  }
  if (normalized === 'waiting_on_bank') {
    return {
      key: 'waiting_on_bank',
      label: 'Waiting on Bank',
      description: 'The bank is reviewing your bond application.',
    }
  }
  if (normalized === 'waiting_on_deeds_office' || normalized === 'lodged') {
    return {
      key: 'waiting_on_deeds_office',
      label: 'Waiting on Deeds Office',
      description: 'The Deeds Office is processing the lodged registration.',
    }
  }
  return {
    key: 'in_progress',
    label: 'In Progress',
    description: 'Your transaction team is actively progressing this step.',
  }
}

function buildWorkflowSummary({
  workflowReadModel = null,
  lifecycle = {},
  transaction = null,
  financeType = '',
  workspaceMode = 'buying',
  nextActions = [],
} = {}) {
  const fallbackStageKey = resolvePortalStageKey({
    mainStage: lifecycle?.mainStage || transaction?.current_main_stage || '',
    stage: lifecycle?.stage || transaction?.stage || '',
    financeType,
    workspace: workspaceMode,
  })
  const stageContent = getEducationalContentForStage(fallbackStageKey)
  const stageLabel = stageContent?.title || 'In Progress'

  const lanesRaw = Array.isArray(workflowReadModel?.lanes) ? workflowReadModel.lanes : []
  const activeLanes = lanesRaw
    .map((lane) => ({
      laneKey: normalizeLaneKey(lane?.laneKey),
      laneLabel: getClientLaneLabel(lane?.laneKey),
      status: String(lane?.status || 'not_started').trim(),
      progressPercent: Number(lane?.readiness?.completionPercent || 0),
      currentStep: mapLaneStepToClientText(lane?.laneKey, lane?.readiness?.currentStep, ''),
      nextStep: mapLaneStepToClientText(
        lane?.laneKey,
        lane?.readiness?.nextStep,
        'Your transaction team is progressing this lane.',
      ),
      visibleToClient: lane?.visibleToClient !== false,
    }))
    .filter((lane) => lane.visibleToClient && ['finance', 'transfer', 'bond'].includes(lane.laneKey))
    .filter((lane) => !(lane.laneKey === 'bond' && ['cash'].includes(normalizeValue(financeType))))

  const stageProgress = getStageProgressPercent(
    lifecycle?.mainStage || transaction?.current_main_stage || '',
    lifecycle?.stage || transaction?.stage || '',
  )
  const laneProgressValues = activeLanes.map((lane) => Number(lane.progressPercent || 0)).filter((value) => Number.isFinite(value))
  const laneAverageProgress = laneProgressValues.length
    ? Math.round(laneProgressValues.reduce((total, value) => total + value, 0) / laneProgressValues.length)
    : stageProgress
  const progressPercent = Math.max(stageProgress, laneAverageProgress)

  const rawClientBlockers = (workflowReadModel?.blockers || []).filter((item) => item?.visibility === 'client_visible')
  const blockers = dedupeByKey(
    rawClientBlockers.map((item, index) => ({
      id:
        item?.id ||
        `${item?.type || 'blocker'}_${item?.relatedEntityType || 'entity'}_${item?.relatedEntityId || index}`,
      type: item?.type || 'workflow_blocker',
      title: item?.title || 'Action required',
      description: item?.description || 'Something is still needed before we can progress this step.',
      relatedEntityType: item?.relatedEntityType || '',
      relatedEntityId: item?.relatedEntityId || '',
    })),
    (item) => item.id,
  )

  const hasBlockingClientAction = (nextActions || []).some((action) => action?.blocking)
  const waitingOnKeys = []
  if (hasBlockingClientAction || blockers.length) {
    waitingOnKeys.push('waiting_on_client')
  } else {
    const coordinationStatus = normalizeValue(workflowReadModel?.coordination?.status)
    if (coordinationStatus === 'waiting_on_transfer') waitingOnKeys.push('waiting_on_attorney')
    if (coordinationStatus === 'waiting_on_bond') waitingOnKeys.push('waiting_on_bond_originator')
    if (coordinationStatus === 'lodged') waitingOnKeys.push('waiting_on_deeds_office')

    const financeLane = activeLanes.find((lane) => lane.laneKey === 'finance' && lane.status !== 'completed')
    if (financeLane && ['bond', 'hybrid', 'combination'].includes(normalizeValue(financeType))) {
      waitingOnKeys.push('waiting_on_bank')
    }
    const transferLane = activeLanes.find((lane) => lane.laneKey === 'transfer' && lane.status !== 'completed')
    if (transferLane) waitingOnKeys.push('waiting_on_attorney')
    const bondLane = activeLanes.find((lane) => lane.laneKey === 'bond' && lane.status !== 'completed')
    if (bondLane) waitingOnKeys.push('waiting_on_bond_originator')
  }

  const waitingOn = dedupeByKey(waitingOnKeys.map(mapWaitingOnKeyToSummary), (item) => item.key)

  const clientVisibleMilestones = dedupeByKey(
    (workflowReadModel?.clientVisibleMilestones || []).map((milestone, index) => ({
      id: milestone?.id || `milestone_${milestone?.key || 'update'}_${index}`,
      key: milestone?.key || 'transaction_updated',
      title: milestone?.title || 'Transaction update',
      summary: milestone?.summary || 'Your transaction has a new update.',
      updatedAt: milestone?.updatedAt || null,
    })),
    (item) => item.id,
  )

  const nextStepFromLane = activeLanes.find((lane) => lane.status !== 'completed') || null
  const nextClientAction = (nextActions || []).find((action) => action?.blocking) || (nextActions || [])[0] || null
  const nextStep = nextClientAction
    ? {
        title: nextClientAction?.title || 'Next step',
        description: nextClientAction?.description || 'Please complete your next required action.',
        actionRequired: true,
      }
    : nextStepFromLane
      ? {
          title: nextStepFromLane?.laneLabel || 'Next step',
          description: nextStepFromLane?.nextStep || 'Your team is progressing this transaction.',
          actionRequired: false,
        }
      : {
          title: 'In Progress',
          description: 'Your transaction team is progressing the next steps.',
          actionRequired: false,
        }

  let overallStatus = 'in_progress'
  if (progressPercent >= 100 || normalizeValue(lifecycle?.mainStage) === 'reg' && normalizeValue(lifecycle?.stage).includes('registered')) {
    overallStatus = 'completed'
  } else if (hasBlockingClientAction || blockers.length) {
    overallStatus = 'action_required'
  }

  return {
    currentStage: String(lifecycle?.stage || transaction?.stage || '').trim() || 'In Progress',
    currentStageLabel: stageLabel,
    currentStageDescription: stageContent?.shortDescription || 'Your transaction is currently in progress.',
    overallStatus,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    activeLanes,
    clientVisibleMilestones,
    waitingOn,
    blockers,
    nextStep,
  }
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

function inferRequirementAudience(requirement = {}) {
  const expectedFromRole = normalizeValue(
    requirement?.expectedFromRole ||
      requirement?.expected_from_role ||
      requirement?.required_from_role ||
      requirement?.requestedFrom ||
      requirement?.requested_from,
  )
  if (expectedFromRole === 'seller') {
    return { buyer: false, seller: true }
  }
  if (expectedFromRole === 'buyer') {
    return { buyer: true, seller: false }
  }

  const signal = String(
    requirement?.key ||
      requirement?.label ||
      requirement?.document_label ||
      requirement?.document_key ||
      '',
  ).toLowerCase()

  if (signal.includes('mandate') || signal.includes('seller')) {
    return { buyer: false, seller: true }
  }
  if (
    signal.includes('otp') ||
    signal.includes('bond') ||
    signal.includes('proof_of_funds') ||
    signal.includes('proof of funds')
  ) {
    return { buyer: true, seller: false }
  }

  return { buyer: true, seller: true }
}

function filterRequiredDocumentsByWorkspace(requiredDocuments = [], workspaceMode = 'buying') {
  return (requiredDocuments || []).filter((requirement) => {
    const visibility = normalizeValue(requirement?.visibilityScope || requirement?.visibility_scope || 'client')
    if (visibility === 'internal' || visibility === 'internal_only') return false
    const audience = inferRequirementAudience(requirement)
    if (workspaceMode === 'selling') return audience.seller
    if (workspaceMode === 'buying') return audience.buyer
    return audience.buyer || audience.seller
  })
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
  const requiredDocumentsRaw = Array.isArray(portalData?.requiredDocuments) ? portalData.requiredDocuments : []
  const requiredDocuments = filterRequiredDocumentsByWorkspace(requiredDocumentsRaw, workspaceMode)
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
  let workflowReadModel = null
  try {
    if (portalData?.transaction?.id) {
      workflowReadModel = await getTransactionWorkflowReadModel(portalData.transaction.id).catch((error) => {
        console.warn('[client-portal-workflow] Read-model unavailable', {
          transactionId: portalData?.transaction?.id || null,
          error,
        })
        return null
      })
    }
  } catch (workflowError) {
    console.warn('[client-portal-workflow] Failed to resolve read-model', {
      transactionId: portalData?.transaction?.id || null,
      error: workflowError,
    })
  }

  const provisionalWorkflowSummary = buildWorkflowSummary({
    workflowReadModel,
    lifecycle,
    transaction: portalData?.transaction || null,
    financeType: portalData?.transaction?.finance_type || '',
    workspaceMode,
    nextActions: [],
  })

  const activityFeed = getClientPortalActivityFeed({
    transactionId: portalData?.transaction?.id || null,
    portalData,
    workspaceMode,
    workflowSummary: provisionalWorkflowSummary,
    workflowReadModel,
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
    workflowSummary: provisionalWorkflowSummary,
    workflowReadModel,
  })
  const nextActions = annotateNextActionsWithEducation(rawNextActions)
  const workflowSummary = buildWorkflowSummary({
    workflowReadModel,
    lifecycle,
    transaction: portalData?.transaction || null,
    financeType: portalData?.transaction?.finance_type || '',
    workspaceMode,
    nextActions,
  })
  let notifications = { unreadCount: 0, items: [] }
  const notificationContext = {
    token,
    clientRole,
    workspaceMode,
    transaction: portalData?.transaction || null,
    transactionId: portalData?.transaction?.id || null,
    nextActions,
    activityFeed,
    workflowSummary,
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
    workflowSummary,
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
