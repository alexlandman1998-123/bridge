export const LISTING_WORKSPACE_UI_FRAMEWORK_VERSION = 'arch9_listing_workspace_ui_framework_phase2_v1'

export const LISTING_WORKSPACE_TYPES = Object.freeze({
  sales: 'sales',
  rentals: 'rentals',
})

const OWNER_LABELS = Object.freeze({
  [LISTING_WORKSPACE_TYPES.sales]: 'Seller',
  [LISTING_WORKSPACE_TYPES.rentals]: 'Landlord',
})

const LISTING_TYPE_ALIASES = Object.freeze({
  sale: LISTING_WORKSPACE_TYPES.sales,
  sales: LISTING_WORKSPACE_TYPES.sales,
  residential: LISTING_WORKSPACE_TYPES.sales,
  resale: LISTING_WORKSPACE_TYPES.sales,
  rental: LISTING_WORKSPACE_TYPES.rentals,
  rentals: LISTING_WORKSPACE_TYPES.rentals,
  lease: LISTING_WORKSPACE_TYPES.rentals,
  letting: LISTING_WORKSPACE_TYPES.rentals,
})

export const LISTING_WORKSPACE_TAB_KEYS = Object.freeze([
  'overview',
  'owner',
  'property',
  'mandate',
  'marketing',
  'features',
  'media',
  'syndication',
  'activity',
])

const BASE_TABS = Object.freeze([
  {
    key: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
  },
  {
    key: 'owner',
    label: 'Owner',
    shortLabel: 'Owner',
  },
  {
    key: 'property',
    label: 'Property',
    shortLabel: 'Property',
  },
  {
    key: 'mandate',
    label: 'Mandate',
    shortLabel: 'Mandate',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    shortLabel: 'Marketing',
  },
  {
    key: 'features',
    label: 'Features',
    shortLabel: 'Features',
  },
  {
    key: 'media',
    label: 'Media',
    shortLabel: 'Media',
  },
  {
    key: 'syndication',
    label: 'Syndication',
    shortLabel: 'Syndication',
  },
  {
    key: 'activity',
    label: 'Activity',
    shortLabel: 'Activity',
  },
])

const STEP_TITLES = Object.freeze({
  overview: 'Review listing',
  owner: 'Capture owner',
  property: 'Capture property',
  mandate: 'Confirm mandate',
  marketing: 'Prepare marketing',
  features: 'Add features',
  media: 'Add media',
  syndication: 'Publish channels',
  activity: 'Track activity',
})

export const SALES_LISTING_WORKSPACE_TAB_TARGETS = Object.freeze({
  overview: Object.freeze({
    activeTab: 'overview',
  }),
  owner: Object.freeze({
    activeTab: 'seller',
    sellerWorkspaceTab: 'seller',
  }),
  property: Object.freeze({
    activeTab: 'property_details',
  }),
  mandate: Object.freeze({
    activeTab: 'seller',
    sellerWorkspaceTab: 'overview',
  }),
  marketing: Object.freeze({
    activeTab: 'seller',
    sellerWorkspaceTab: 'marketing',
  }),
  features: Object.freeze({
    activeTab: 'property_details',
  }),
  media: Object.freeze({
    activeTab: 'property_details',
  }),
  syndication: Object.freeze({
    activeTab: 'seller',
    sellerWorkspaceTab: 'marketing',
    openProperty24Manage: true,
  }),
  activity: Object.freeze({
    activeTab: 'seller',
    sellerWorkspaceTab: 'activity',
  }),
})

export const RENTAL_LISTING_WORKSPACE_TAB_TARGETS = Object.freeze({
  overview: Object.freeze({
    detailTab: 'overview',
  }),
  owner: Object.freeze({
    detailTab: 'landlord',
  }),
  property: Object.freeze({
    detailTab: 'property',
  }),
  mandate: Object.freeze({
    detailTab: 'mandate',
  }),
  marketing: Object.freeze({
    detailTab: 'marketing',
  }),
  features: Object.freeze({
    detailTab: 'property',
  }),
  media: Object.freeze({
    detailTab: 'marketing',
  }),
  syndication: Object.freeze({
    detailTab: 'syndication',
  }),
  activity: Object.freeze({
    detailTab: 'activity',
  }),
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return [value].filter(Boolean)
}

export function resolveListingWorkspaceType(value = LISTING_WORKSPACE_TYPES.sales) {
  const key = normalizeKey(value)
  return LISTING_TYPE_ALIASES[key] || LISTING_WORKSPACE_TYPES.sales
}

export function getListingWorkspaceOwnerLabel(type = LISTING_WORKSPACE_TYPES.sales) {
  return OWNER_LABELS[resolveListingWorkspaceType(type)]
}

export function buildListingWorkspaceTabs(type = LISTING_WORKSPACE_TYPES.sales, options = {}) {
  const listingType = resolveListingWorkspaceType(type)
  const ownerLabel = getListingWorkspaceOwnerLabel(listingType)
  const hiddenTabs = new Set(normalizeArray(options.hiddenTabs))
  const badges = options.badges || {}

  return BASE_TABS
    .filter((tab) => !hiddenTabs.has(tab.key))
    .map((tab) => {
      const label = tab.key === 'owner' ? ownerLabel : tab.label

      return {
        ...tab,
        listingType,
        label,
        shortLabel: tab.key === 'owner' ? ownerLabel : tab.shortLabel,
        badge: badges[tab.key] || null,
      }
    })
}

export function resolveListingWorkspaceTab(value, type = LISTING_WORKSPACE_TYPES.sales, options = {}) {
  const tabs = buildListingWorkspaceTabs(type, options)
  const tabKeys = new Set(tabs.map((tab) => tab.key))
  const key = normalizeKey(value)

  return tabKeys.has(key) ? key : 'overview'
}

export function buildListingWorkspaceStepModel(type = LISTING_WORKSPACE_TYPES.sales, completion = {}) {
  const listingType = resolveListingWorkspaceType(type)
  const ownerLabel = getListingWorkspaceOwnerLabel(listingType)
  const tabs = buildListingWorkspaceTabs(listingType)
  const firstIncompleteIndex = tabs.findIndex((tab) => !completion[tab.key])

  return tabs.map((tab, index) => {
    const isComplete = Boolean(completion[tab.key])
    const isCurrent = !isComplete && index === firstIncompleteIndex
    const title = tab.key === 'owner' ? `Capture ${ownerLabel.toLowerCase()}` : STEP_TITLES[tab.key]

    return {
      key: tab.key,
      listingType,
      label: tab.label,
      title,
      position: index + 1,
      status: isComplete ? 'complete' : isCurrent ? 'current' : 'pending',
    }
  })
}

export function buildListingWorkspacePortalReadiness({
  type = LISTING_WORKSPACE_TYPES.sales,
  portal = 'Property24',
  missingFields = [],
  setupBlockers = [],
  published = false,
  checked = false,
} = {}) {
  const listingType = resolveListingWorkspaceType(type)
  const normalizedMissingFields = normalizeArray(missingFields)
  const normalizedSetupBlockers = normalizeArray(setupBlockers)

  if (published) {
    return {
      type: listingType,
      portal,
      label: 'Published',
      tone: 'success',
      ready: true,
      missingFields: normalizedMissingFields,
      setupBlockers: normalizedSetupBlockers,
    }
  }

  if (normalizedSetupBlockers.length > 0) {
    return {
      type: listingType,
      portal,
      label: 'Setup needed',
      tone: 'warning',
      ready: false,
      missingFields: normalizedMissingFields,
      setupBlockers: normalizedSetupBlockers,
    }
  }

  if (normalizedMissingFields.length > 0) {
    return {
      type: listingType,
      portal,
      label: 'Missing fields',
      tone: 'warning',
      ready: false,
      missingFields: normalizedMissingFields,
      setupBlockers: normalizedSetupBlockers,
    }
  }

  if (checked) {
    return {
      type: listingType,
      portal,
      label: 'Ready',
      tone: 'success',
      ready: true,
      missingFields: normalizedMissingFields,
      setupBlockers: normalizedSetupBlockers,
    }
  }

  return {
    type: listingType,
    portal,
    label: 'Not checked',
    tone: 'neutral',
    ready: false,
    missingFields: normalizedMissingFields,
    setupBlockers: normalizedSetupBlockers,
  }
}

export function buildListingWorkspacePortalSummary({
  type = LISTING_WORKSPACE_TYPES.sales,
  portal = 'Property24',
  logoSrc = '',
  missingFields = [],
  setupBlockers = [],
  published = false,
  checked = false,
  reference = '',
  lastSynced = '',
  detail = '',
  actionLabel = '',
  actionTarget = '',
} = {}) {
  const readiness = buildListingWorkspacePortalReadiness({
    type,
    portal,
    missingFields,
    setupBlockers,
    published,
    checked,
  })
  const issues = [
    ...normalizeArray(missingFields),
    ...normalizeArray(setupBlockers),
  ]
  const normalizedMissingFields = normalizeArray(missingFields)
  const normalizedSetupBlockers = normalizeArray(setupBlockers)

  return {
    key: normalizeKey(portal) || 'portal',
    type: readiness.type,
    portal: readiness.portal,
    logoSrc,
    label: readiness.label,
    tone: readiness.tone,
    ready: readiness.ready,
    published: Boolean(published),
    missingFields: normalizedMissingFields,
    setupBlockers: normalizedSetupBlockers,
    reference: normalizeText(reference),
    lastSynced: normalizeText(lastSynced),
    detail: normalizeText(detail),
    issues,
    actionLabel: normalizeText(actionLabel),
    actionTarget: normalizeText(actionTarget),
  }
}

function buildPortalIssueList(portals = [], key = 'issues') {
  return portals.flatMap((portal) => {
    const values = normalizeArray(portal?.[key])
    return values.map((value) => `${portal.portal || 'Portal'}: ${value}`)
  })
}

function resolveListingIssueWorkspaceTarget(issue = '', type = LISTING_WORKSPACE_TYPES.sales) {
  const listingType = resolveListingWorkspaceType(type)
  const text = normalizeKey(issue)

  if (/(image|photo|picture|media|floor_plan|floorplan|video|matterport|tour|youtube)/.test(text)) return 'media'
  if (/(description|heading|title|price|rent|levy|levies|rate|rates|marketing|channel|web_ref|reference)/.test(text)) return 'marketing'
  if (/(mandate|signed|expiry|authority|approval)/.test(text)) return 'mandate'
  if (/(seller|landlord|owner|agent|contact|email|mobile|phone)/.test(text)) return 'owner'
  if (/(address|suburb|city|province|postal|location|bed|bath|garage|parking|erf|floor|size|property|feature|furnished|pet|lease|deposit|available|occupation)/.test(text)) return 'property'

  return listingType === LISTING_WORKSPACE_TYPES.rentals ? 'property' : 'marketing'
}

function getListingWorkspaceTabActionLabel(tabKey = 'overview') {
  const labels = {
    owner: 'Open owner details',
    property: 'Open property details',
    mandate: 'Open mandate',
    marketing: 'Open marketing',
    features: 'Open features',
    media: 'Open media',
    syndication: 'Open syndication',
    activity: 'Open activity',
  }
  return labels[tabKey] || 'Open listing'
}

export function buildListingWorkspacePortalActionPlan(items = [], options = {}) {
  const portals = normalizeArray(items).filter(Boolean)
  if (!portals.length) return null

  const counts = portals.reduce((result, item) => {
    result.total += 1
    if (item.published) result.live += 1
    else if (item.ready) result.ready += 1
    else if (item.label === 'Setup needed' || item.label === 'Missing fields' || item.issues?.length) result.blocked += 1
    else result.notChecked += 1
    return result
  }, {
    total: 0,
    live: 0,
    ready: 0,
    blocked: 0,
    notChecked: 0,
  })

  const setupItem = portals.find((item) => item.label === 'Setup needed')
  const missingItem = portals.find((item) => item.label === 'Missing fields' || item.issues?.length)
  const readyItem = portals.find((item) => item.ready && !item.published)
  const uncheckedItem = portals.find((item) => item.label === 'Not checked')
  const publishedItem = portals.find((item) => item.published)
  const focus = setupItem || missingItem || readyItem || uncheckedItem || publishedItem || portals[0]
  const issueCount = Array.isArray(focus?.issues) ? focus.issues.length : 0
  const portalLabel = focus?.portal || 'Portal'

  let label = 'Check readiness'
  let tone = 'neutral'
  let detail = `${portalLabel} has not been checked yet. Start with the readiness check before publishing.`
  let actionLabel = focus?.actionLabel || `Open ${portalLabel}`

  if (setupItem) {
    label = 'Finish setup first'
    tone = 'warning'
    detail = `${portalLabel} still has account or agent setup that must be finished before a live publish.`
    actionLabel = focus?.actionLabel || `Fix ${portalLabel} setup`
  } else if (missingItem) {
    label = 'Fix listing details'
    tone = 'warning'
    detail = `${portalLabel} needs ${issueCount || 'some'} listing detail${issueCount === 1 ? '' : 's'} before it can be published.`
    actionLabel = focus?.actionLabel || `Fix ${portalLabel}`
  } else if (readyItem) {
    label = 'Ready to send'
    tone = 'success'
    detail = `${portalLabel} is ready. Open the syndication area to review and publish or update the portal listing.`
    actionLabel = focus?.actionLabel || `Open ${portalLabel}`
  } else if (uncheckedItem) {
    label = 'Check readiness'
    tone = 'neutral'
    detail = `${portalLabel} should be checked before publishing so the user sees any missing fields first.`
    actionLabel = focus?.actionLabel || `Check ${portalLabel}`
  } else if (publishedItem) {
    label = 'Monitor live portals'
    tone = 'success'
    detail = `${portalLabel} is already marked as live. Use the syndication area for updates, status checks, and lead sync.`
    actionLabel = focus?.actionLabel || `Manage ${portalLabel}`
  }

  return {
    key: 'portal_action_plan',
    type: resolveListingWorkspaceType(options.type || focus?.type),
    label,
    tone,
    detail,
    portal: portalLabel,
    actionLabel: normalizeText(actionLabel),
    actionTarget: focus?.actionTarget || '',
    focusKey: focus?.key || normalizeKey(portalLabel),
    counts,
  }
}

export function buildListingWorkspacePortalChecklist(items = [], options = {}) {
  const portals = normalizeArray(items).filter(Boolean)
  if (!portals.length) return []

  const type = resolveListingWorkspaceType(options.type || portals[0]?.type)
  const setupIssues = buildPortalIssueList(portals, 'setupBlockers')
  const missingIssues = buildPortalIssueList(portals, 'missingFields')
  const checkedCount = portals.filter((portal) => portal.published || portal.ready || portal.label !== 'Not checked').length
  const liveCount = portals.filter((portal) => portal.published).length
  const readyCount = portals.filter((portal) => portal.ready && !portal.published).length
  const portalCount = portals.length

  return [
    {
      key: 'portal_setup',
      type,
      label: 'Portal setup',
      status: setupIssues.length ? 'Needs setup' : 'Done',
      tone: setupIssues.length ? 'warning' : 'success',
      complete: setupIssues.length === 0,
      detail: setupIssues.length
        ? `${setupIssues.length} setup item${setupIssues.length === 1 ? '' : 's'} still need attention.`
        : 'Agency, credentials, and portal connection checks are clear for these portals.',
      issues: setupIssues,
    },
    {
      key: 'listing_fields',
      type,
      label: `${type === LISTING_WORKSPACE_TYPES.rentals ? 'Rental' : 'Sales'} listing details`,
      status: missingIssues.length ? 'Incomplete' : 'Complete',
      tone: missingIssues.length ? 'warning' : 'success',
      complete: missingIssues.length === 0,
      detail: missingIssues.length
        ? `${missingIssues.length} listing detail${missingIssues.length === 1 ? '' : 's'} must be completed before publishing.`
        : 'Required listing details are ready for the connected portal checks.',
      issues: missingIssues,
    },
    {
      key: 'readiness_check',
      type,
      label: 'Readiness check',
      status: checkedCount === portalCount ? 'Checked' : 'Check needed',
      tone: checkedCount === portalCount ? 'success' : 'neutral',
      complete: checkedCount === portalCount,
      detail: checkedCount === portalCount
        ? 'Portal readiness has been checked for the connected publishing paths.'
        : `${portalCount - checkedCount} portal${portalCount - checkedCount === 1 ? '' : 's'} still need a readiness check.`,
      issues: [],
    },
    {
      key: 'publish_tracking',
      type,
      label: 'Publish tracking',
      status: liveCount ? `${liveCount} live` : readyCount ? `${readyCount} ready` : 'Not live yet',
      tone: liveCount ? 'success' : readyCount ? 'success' : 'neutral',
      complete: liveCount > 0,
      detail: liveCount
        ? `${liveCount} portal${liveCount === 1 ? '' : 's'} are marked live and should be monitored from syndication.`
        : readyCount
          ? `${readyCount} portal${readyCount === 1 ? '' : 's'} are ready to send, but not marked live yet.`
          : 'No connected portal is marked live yet.',
      issues: [],
    },
  ]
}

export function buildListingWorkspacePortalPublishGate(items = [], options = {}) {
  const portals = normalizeArray(items).filter(Boolean)
  if (!portals.length) return null

  const type = resolveListingWorkspaceType(options.type || portals[0]?.type)
  const setupIssues = buildPortalIssueList(portals, 'setupBlockers')
  const missingIssues = buildPortalIssueList(portals, 'missingFields')
  const uncheckedPortals = portals.filter((portal) => !portal.published && !portal.ready && portal.label === 'Not checked')
  const readyPortals = portals.filter((portal) => portal.ready && !portal.published)
  const livePortals = portals.filter((portal) => portal.published)
  const focus = portals.find((portal) => portal.label === 'Setup needed')
    || portals.find((portal) => portal.label === 'Missing fields' || portal.issues?.length)
    || readyPortals[0]
    || uncheckedPortals[0]
    || livePortals[0]
    || portals[0]
  const blockerCount = setupIssues.length + missingIssues.length
  const portalLabel = focus?.portal || 'Portal'

  let label = 'Check before publishing'
  let status = 'Check needed'
  let tone = 'neutral'
  let detail = 'Run the portal readiness check before any listing is sent live.'
  let actionLabel = focus?.actionLabel || `Check ${portalLabel}`
  let actionTarget = focus?.actionTarget || ''
  let canPublish = false

  if (setupIssues.length > 0) {
    label = 'Blocked by setup'
    status = 'Blocked'
    tone = 'warning'
    detail = `${setupIssues.length} portal setup item${setupIssues.length === 1 ? '' : 's'} must be fixed before publishing.`
    actionLabel = focus?.actionLabel || 'Open syndication'
    actionTarget = focus?.actionTarget || 'syndication'
  } else if (missingIssues.length > 0) {
    label = 'Blocked by listing details'
    status = 'Blocked'
    tone = 'warning'
    detail = `${missingIssues.length} listing detail${missingIssues.length === 1 ? '' : 's'} must be completed before publishing.`
    actionLabel = focus?.actionLabel || 'Fix listing details'
  } else if (readyPortals.length > 0) {
    label = 'Ready for publish review'
    status = 'Ready'
    tone = 'success'
    detail = `${readyPortals.length} portal${readyPortals.length === 1 ? '' : 's'} are ready. Review the publish controls before sending updates.`
    actionLabel = focus?.actionLabel || 'Open publish controls'
    canPublish = true
  } else if (uncheckedPortals.length > 0) {
    label = 'Readiness check needed'
    status = 'Check needed'
    tone = 'neutral'
    detail = `${uncheckedPortals.length} portal${uncheckedPortals.length === 1 ? '' : 's'} still need a readiness check before publishing.`
    actionLabel = focus?.actionLabel || `Check ${portalLabel}`
  } else if (livePortals.length > 0) {
    label = 'Live listing monitoring'
    status = 'Live'
    tone = 'success'
    detail = `${livePortals.length} portal${livePortals.length === 1 ? '' : 's'} are live. Use syndication to track updates, status, and leads.`
    actionLabel = focus?.actionLabel || 'Manage live listing'
  }

  return {
    key: 'portal_publish_gate',
    type,
    label,
    status,
    tone,
    detail,
    portal: portalLabel,
    actionLabel: normalizeText(actionLabel),
    actionTarget: normalizeText(actionTarget),
    canPublish,
    counts: {
      portals: portals.length,
      ready: readyPortals.length,
      live: livePortals.length,
      blocked: blockerCount,
      unchecked: uncheckedPortals.length,
    },
    blockers: [
      ...setupIssues.map((issue) => ({ key: normalizeKey(`setup_${issue}`), label: issue, type: 'setup' })),
      ...missingIssues.map((issue) => ({ key: normalizeKey(`field_${issue}`), label: issue, type: 'field' })),
    ],
  }
}

export function buildListingWorkspacePortalGoLiveProof(items = [], options = {}) {
  const portals = normalizeArray(items).filter(Boolean)
  if (!portals.length) return null

  const type = resolveListingWorkspaceType(options.type || portals[0]?.type)
  const setupIssues = buildPortalIssueList(portals, 'setupBlockers')
  const missingIssues = buildPortalIssueList(portals, 'missingFields')
  const checkedPortals = portals.filter((portal) => portal.published || portal.ready || portal.label !== 'Not checked')
  const readyPortals = portals.filter((portal) => portal.ready && !portal.published)
  const livePortals = portals.filter((portal) => portal.published)
  const blockedCount = setupIssues.length + missingIssues.length
  const uncheckedCount = portals.length - checkedPortals.length
  const hasReadyEvidence = blockedCount === 0 && uncheckedCount === 0 && (readyPortals.length > 0 || livePortals.length > 0)

  let status = 'Not ready'
  let tone = 'warning'
  let detail = `${blockedCount} item${blockedCount === 1 ? '' : 's'} must be cleared before go-live evidence is ready.`

  if (blockedCount === 0 && uncheckedCount > 0) {
    status = 'Check needed'
    tone = 'neutral'
    detail = `${uncheckedCount} portal${uncheckedCount === 1 ? '' : 's'} still need a readiness check before go-live evidence is complete.`
  } else if (hasReadyEvidence) {
    status = 'Evidence ready'
    tone = 'success'
    detail = 'Setup, listing data, readiness checks, and portal tracking are ready for review.'
  } else if (blockedCount === 0) {
    status = 'Review needed'
    tone = 'neutral'
    detail = 'Portal setup and listing data are clear. Confirm the publish controls before go-live.'
  }

  return {
    key: 'portal_go_live_proof',
    type,
    label: 'Go-live proof',
    status,
    tone,
    detail,
    ready: hasReadyEvidence,
    rows: [
      {
        key: 'setup',
        label: 'Portal setup',
        value: setupIssues.length ? `${setupIssues.length} issue${setupIssues.length === 1 ? '' : 's'}` : 'Clear',
        tone: setupIssues.length ? 'warning' : 'success',
        detail: setupIssues.length ? 'Agency, credentials, or agent setup still needs attention.' : 'No portal setup blockers found.',
      },
      {
        key: 'listing_data',
        label: 'Listing data',
        value: missingIssues.length ? `${missingIssues.length} missing` : 'Complete',
        tone: missingIssues.length ? 'warning' : 'success',
        detail: missingIssues.length ? 'Required portal fields are still missing.' : 'Required listing fields are complete for the connected portals.',
      },
      {
        key: 'readiness',
        label: 'Readiness checks',
        value: `${checkedPortals.length}/${portals.length} checked`,
        tone: uncheckedCount ? 'neutral' : 'success',
        detail: uncheckedCount ? 'Run the portal readiness check before publishing.' : 'Connected portal readiness has been checked.',
      },
      {
        key: 'tracking',
        label: 'Portal tracking',
        value: livePortals.length ? `${livePortals.length} live` : readyPortals.length ? `${readyPortals.length} ready` : 'Not live yet',
        tone: livePortals.length || readyPortals.length ? 'success' : 'neutral',
        detail: livePortals.length
          ? 'Live portal records can be monitored from syndication.'
          : readyPortals.length
            ? 'Ready portals still need publish review before they become live.'
            : 'No portal is ready or live yet.',
      },
    ],
    portals: portals.map((portal) => ({
      key: portal.key || normalizeKey(portal.portal),
      portal: portal.portal || 'Portal',
      status: portal.label || 'Not checked',
      tone: portal.tone || 'neutral',
      reference: portal.reference || 'No reference yet',
      lastSynced: portal.lastSynced || 'Not synced yet',
    })),
  }
}

export function buildListingWorkspacePortalFixGuide(items = [], options = {}) {
  const portals = normalizeArray(items).filter(Boolean)
  if (!portals.length) return []

  const type = resolveListingWorkspaceType(options.type || portals[0]?.type)
  const guideItems = []
  const pushGuideItem = ({
    portal,
    category,
    issue,
    actionTarget,
    tone = 'warning',
    status = 'Needs attention',
  }) => {
    const target = actionTarget || resolveListingIssueWorkspaceTarget(issue, type)
    guideItems.push({
      key: normalizeKey(`${portal}_${category}_${issue}_${target}`) || `fix_${guideItems.length + 1}`,
      type,
      portal,
      category,
      issue: normalizeText(issue),
      label: category === 'setup' ? `${portal} setup` : `${portal} listing detail`,
      detail: category === 'setup'
        ? 'This is controlled from the syndication setup for the listing.'
        : `This should be fixed from the ${target === 'owner' ? getListingWorkspaceOwnerLabel(type).toLowerCase() : target} section.`,
      actionTarget: target,
      actionLabel: getListingWorkspaceTabActionLabel(target),
      tone,
      status,
    })
  }

  portals.forEach((portal) => {
    normalizeArray(portal.setupBlockers).forEach((issue) => {
      pushGuideItem({
        portal: portal.portal || 'Portal',
        category: 'setup',
        issue,
        actionTarget: 'syndication',
      })
    })

    normalizeArray(portal.missingFields).forEach((issue) => {
      pushGuideItem({
        portal: portal.portal || 'Portal',
        category: 'field',
        issue,
      })
    })

    if (!portal.published && !portal.ready && portal.label === 'Not checked') {
      pushGuideItem({
        portal: portal.portal || 'Portal',
        category: 'readiness',
        issue: 'Run a portal readiness check before publishing.',
        actionTarget: 'syndication',
        tone: 'neutral',
        status: 'Check needed',
      })
    }
  })

  return guideItems
}

export function resolveSalesListingWorkspaceTarget(tabKey = 'overview') {
  const key = resolveListingWorkspaceTab(tabKey, LISTING_WORKSPACE_TYPES.sales)
  return {
    workspaceTab: key,
    ...SALES_LISTING_WORKSPACE_TAB_TARGETS[key],
  }
}

export function resolveSalesListingWorkspaceTabFromLegacyState({
  activeTab = 'overview',
  sellerWorkspaceTab = 'overview',
} = {}) {
  const normalizedActiveTab = normalizeKey(activeTab)
  const normalizedSellerWorkspaceTab = normalizeKey(sellerWorkspaceTab)

  if (normalizedActiveTab === 'seller') {
    if (normalizedSellerWorkspaceTab === 'seller') return 'owner'
    if (normalizedSellerWorkspaceTab === 'marketing') return 'marketing'
    if (normalizedSellerWorkspaceTab === 'activity') return 'activity'
    return 'mandate'
  }

  if (normalizedActiveTab === 'property_details') return 'property'
  if (normalizedActiveTab === 'documents') return 'mandate'
  if (normalizedActiveTab === 'role_players') return 'activity'
  if (normalizedActiveTab === 'pipeline' || normalizedActiveTab === 'offers') return 'activity'

  return resolveListingWorkspaceTab(normalizedActiveTab, LISTING_WORKSPACE_TYPES.sales)
}

export function resolveRentalListingWorkspaceTarget(tabKey = 'overview') {
  const key = resolveListingWorkspaceTab(tabKey, LISTING_WORKSPACE_TYPES.rentals)
  return {
    workspaceTab: key,
    ...RENTAL_LISTING_WORKSPACE_TAB_TARGETS[key],
  }
}

export function resolveRentalListingWorkspaceTabFromDetailTab(detailTab = 'overview') {
  const key = normalizeKey(detailTab)

  if (key === 'landlord') return 'owner'
  if (key === 'terms' || key === 'mandate') return 'mandate'
  if (key === 'inspection' || key === 'property') return 'property'
  if (key === 'marketing') return 'marketing'
  if (key === 'syndication') return 'syndication'
  if (key === 'applications' || key === 'activity') return 'activity'

  return resolveListingWorkspaceTab(key, LISTING_WORKSPACE_TYPES.rentals)
}
