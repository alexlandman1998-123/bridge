import { resolveDeveloperTransactionRelationshipProfile } from './developerTransactionRelationshipProfile.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

export function isDeveloperSaleTransaction(transaction = {}, unit = {}) {
  const normalizedType = normalizeKey(transaction?.transaction_type || transaction?.transactionType || transaction?.type)

  if (normalizedType === 'private' || normalizedType === 'private_property') {
    return false
  }

  if (['development', 'developer', 'developer_sale'].includes(normalizedType)) {
    return true
  }

  return Boolean(
    transaction?.development_id ||
      transaction?.developmentId ||
      transaction?.development?.id ||
      unit?.development_id ||
      unit?.developmentId ||
      unit?.development?.id,
  )
}

export function resolveTransactionWorkspaceProfile({ transaction = {}, unit = {}, workspaceRole = 'developer' } = {}) {
  const isDeveloperSale = isDeveloperSaleTransaction(transaction, unit)
  const normalizedRole = normalizeKey(workspaceRole || 'developer')

  if (isDeveloperSale) {
    const relationshipProfile = resolveDeveloperTransactionRelationshipProfile({
      transactionType: 'developer_sale',
      roleTypes: ['developer_contact', normalizedRole === 'agent' ? 'agent' : ''],
      hasExternalAgent: normalizedRole === 'agent',
    })

    return {
      key: 'developer_sale',
      transactionType: 'developer_sale',
      relationshipMode: 'developer_buyer',
      relationshipProfile,
      isDeveloperSale: true,
      isPrivateProperty: false,
      isAgentWorkspace: normalizedRole === 'agent',
      labels: {
        buyer: 'Buyer',
        buyerLong: 'Buyer / Purchaser',
        seller: 'Developer',
        sellerPending: 'Developer pending',
        agent: 'Selling Agent',
        onboardingTab: 'Buyer / Purchaser',
        onboardingPanel: 'Buyer / Purchaser Information',
        onboardingCopy: 'Buyer onboarding control panel for manual alignment, finance structure, and required-document readiness.',
        buyerOverview: 'Buyer / Purchaser Overview',
        financeTab: 'Reservation & Finance',
        overviewMeta: 'Development transaction',
      },
      header: {
        titleFallback: 'Development Transaction',
        subtitlePending: 'Buyer: Pending assignment',
        contextLabel: 'DEVELOPMENT TRANSACTION',
      },
      menuAliases: {
        activity: 'overview',
        alterations: 'snags_alterations',
        bond: 'workflows',
        cancellation: 'workflows',
        financials: 'workflows',
        snags: 'snags_alterations',
        tasks: 'workflows',
        transfer: 'workflows',
        ...(normalizedRole === 'agent' ? { bond: 'financials' } : {}),
      },
      features: {
        hasPrivateSeller: false,
        hasDeveloperModules: true,
        hasReservationDeposit: true,
      },
    }
  }

  return {
    key: 'private_property',
    transactionType: 'private_property',
    relationshipMode: 'seller_buyer',
    isDeveloperSale: false,
    isPrivateProperty: true,
    isAgentWorkspace: normalizedRole === 'agent',
    labels: {
      buyer: 'Buyer',
      buyerLong: 'Buyer',
      seller: 'Seller',
      sellerPending: 'Seller pending',
      agent: 'Assigned Agent',
      onboardingTab: 'Client Information',
      onboardingPanel: 'Client Information',
      onboardingCopy: 'Buyer onboarding control panel for manual alignment, finance structure, and required-document readiness.',
      buyerOverview: 'Buyer Overview',
      financeTab: 'Finance',
      overviewMeta: 'Transaction summary',
    },
    header: {
      titleFallback: 'Property Transaction',
      subtitlePending: 'Buyer: Pending assignment',
      contextLabel: 'TRANSACTION WORKSPACE',
    },
    menuAliases: {
      cancellation: 'transfer',
      ...(normalizedRole === 'agent' ? { bond: 'financials' } : {}),
    },
    features: {
      hasPrivateSeller: true,
      hasDeveloperModules: false,
      hasReservationDeposit: false,
    },
  }
}

export function resolveTransactionWorkspaceMenuAlias(profile = {}, requestedMenu = 'overview') {
  const normalizedMenu = normalizeText(requestedMenu || 'overview')
  return profile?.menuAliases?.[normalizedMenu] || normalizedMenu || 'overview'
}

export function buildTransactionWorkspaceMenuItems(profile = {}, options = {}) {
  const {
    isAgentWorkspace = false,
    onboardingStatus = 'Not Started',
    documentsCount = 0,
    financeMeta = 'Not set',
    mainStageLabel = 'Available',
    taskCount = 0,
    activityCount = 0,
    canViewBondWorkspaceTab = false,
    bondApplicationStatus = 'Not started',
    isRegisteredUnit = false,
    handoverMeta = 'Pending',
    alterationEnabled = false,
    alterationCount = 0,
    snagEnabled = false,
    snagCount = 0,
  } = options

  const labels = profile?.labels || {}
  const hasDeveloperModules = Boolean(profile?.features?.hasDeveloperModules)

  if (isAgentWorkspace) {
    return [
      { id: 'overview', label: 'Overview' },
      { id: 'onboarding', label: labels.onboardingTab || 'Parties', meta: onboardingStatus },
      { id: 'documents', label: 'Documents', meta: `${documentsCount}` },
      { id: 'financials', label: labels.financeTab || 'Finance', meta: financeMeta },
      { id: 'transfer', label: 'Transfer', meta: mainStageLabel },
      ...(hasDeveloperModules ? [{ id: 'handover', label: 'Handover', meta: handoverMeta }] : []),
      { id: 'tasks', label: 'Next Actions', meta: `${taskCount}` },
      { id: 'activity', label: 'Activity', meta: `${activityCount}` },
      ...(hasDeveloperModules && alterationEnabled ? [{ id: 'alterations', label: 'Alterations', meta: `${alterationCount}` }] : []),
      ...(hasDeveloperModules && snagEnabled ? [{ id: 'snags', label: 'Snags', meta: `${snagCount}` }] : []),
    ]
  }

  if (hasDeveloperModules) {
    return [
      {
        id: 'overview',
        label: 'Overview',
        meta: isRegisteredUnit ? 'Unit summary' : labels.overviewMeta || 'Transaction summary',
      },
      {
        id: 'workflows',
        label: 'Workflows',
        meta: mainStageLabel,
      },
      { id: 'onboarding', label: labels.onboardingTab || 'Buyer / Purchaser', meta: onboardingStatus },
      { id: 'documents', label: 'Documents', meta: `${documentsCount} files` },
      { id: 'handover', label: 'Handover', meta: handoverMeta },
      {
        id: 'snags_alterations',
        label: 'Snags & Alterations',
        meta: `${snagEnabled ? snagCount : 0} / ${alterationEnabled ? alterationCount : 0}`,
      },
    ]
  }

  return [
    {
      id: 'overview',
      label: 'Overview',
      meta: isRegisteredUnit ? 'Unit summary' : labels.overviewMeta || 'Transaction summary',
    },
    { id: 'onboarding', label: labels.onboardingTab || 'Client Information', meta: onboardingStatus },
    ...(canViewBondWorkspaceTab ? [{ id: 'bond', label: 'Bond', meta: bondApplicationStatus }] : []),
    { id: 'documents', label: 'Documents', meta: `${documentsCount} files` },
    ...(hasDeveloperModules ? [{ id: 'handover', label: 'Handover', meta: handoverMeta }] : []),
    ...(hasDeveloperModules
      ? [
          {
            id: 'alterations',
            label: 'Alterations',
            meta: alterationEnabled ? `${alterationCount} requests` : 'Module off',
          },
          {
            id: 'snags',
            label: 'Snags',
            meta: snagEnabled ? `${snagCount} logged` : 'Module off',
          },
        ]
      : []),
  ]
}
