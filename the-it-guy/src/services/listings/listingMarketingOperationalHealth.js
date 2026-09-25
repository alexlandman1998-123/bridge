const INACTIVE_STATUSES = new Set(['expired', 'inactive', 'removed', 'withdrawn'])
const ACTIVE_STATUSES = new Set(['active', 'live', 'published'])

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function time(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function isTracked(channel = {}) {
  const stage = key(channel.publicationState?.stage)
  return Boolean(
    channel.connected || channel.live || text(channel.reference) || text(channel.publicUrl) ||
    (stage && stage !== 'not_published'),
  )
}

export function buildListingMarketingOperationalHealth({
  listingStatus = '',
  activityAvailable = true,
  channels = [],
  now = Date.now(),
  staleAfterMs = 24 * 60 * 60 * 1000,
} = {}) {
  const withdrawnListing = key(listingStatus) === 'withdrawn'
  const trackedChannels = (Array.isArray(channels) ? channels : []).filter(isTracked)
  const issues = []
  const issueIds = new Set()
  const addIssue = (issue) => {
    if (issueIds.has(issue.id)) return
    issueIds.add(issue.id)
    issues.push(issue)
  }

  if (!activityAvailable && trackedChannels.length) {
    addIssue({
      id: 'activity_monitoring_unavailable',
      severity: 'high',
      channel: 'All channels',
      title: 'Publication history is unavailable',
      detail: 'Refresh monitoring before treating any portal state as current.',
    })
  }

  for (const channel of trackedChannels) {
    const channelKey = key(channel.key || channel.label)
    const label = text(channel.label) || 'Listing channel'
    const stage = key(channel.publicationState?.stage)
    const actualStatus = key(channel.actualStatus)
    const live = Boolean(channel.live || ACTIVE_STATUSES.has(actualStatus))
    const inactive = INACTIVE_STATUSES.has(actualStatus)
    const updateStatus = key(channel.updateState?.status)
    const requiresReference = channel.requiresReference !== false

    if ((withdrawnListing || stage === 'withdrawn') && live) {
      addIssue({
        id: `${channelKey}_withdrawal_drift`,
        severity: 'high',
        channel: label,
        title: 'Withdrawn in Arch9 but still live',
        detail: `Refresh ${label} and reconcile the external listing before continuing.`,
      })
      continue
    }

    if (stage === 'withdrawal_failed') {
      addIssue({
        id: `${channelKey}_withdrawal_failed`,
        severity: 'high',
        channel: label,
        title: 'Withdrawal needs attention',
        detail: text(channel.publicationState?.failureDetail) || `Retry the failed ${label} withdrawal.`,
      })
    } else if (stage === 'failed') {
      addIssue({
        id: `${channelKey}_publication_failed`,
        severity: 'high',
        channel: label,
        title: 'Publication failed',
        detail: text(channel.publicationState?.failureDetail) || `Review and retry the latest ${label} publication.`,
      })
    } else if (!withdrawnListing && stage === 'verified' && inactive) {
      addIssue({
        id: `${channelKey}_portal_inactive_drift`,
        severity: 'high',
        channel: label,
        title: 'Portal state no longer matches Arch9',
        detail: `${label} reports the listing as inactive although Arch9 still has a verified publication.`,
      })
    }

    if (updateStatus === 'needs_attention' && !['failed', 'withdrawal_failed'].includes(stage)) {
      addIssue({
        id: `${channelKey}_update_needs_attention`,
        severity: 'high',
        channel: label,
        title: 'Latest channel update needs attention',
        detail: text(channel.updateState?.detail) || `Review the latest ${label} update.`,
      })
    }

    if (live && requiresReference && !text(channel.reference)) {
      addIssue({
        id: `${channelKey}_missing_reference`,
        severity: 'warning',
        channel: label,
        title: 'Live reference is missing',
        detail: `Save the ${label} listing reference so future updates target the correct record.`,
      })
    }
    if (live && !text(channel.publicUrl)) {
      addIssue({
        id: `${channelKey}_missing_public_url`,
        severity: 'warning',
        channel: label,
        title: 'Public listing link is missing',
        detail: `Add the confirmed ${label} URL so agents can verify changes.`,
      })
    }
    if (live && Number(channel.publicationState?.changeCount || 0) > 0) {
      addIssue({
        id: `${channelKey}_unpublished_changes`,
        severity: 'warning',
        channel: label,
        title: 'Saved changes are not published',
        detail: `${channel.publicationState.changeCount} Arch9 change${channel.publicationState.changeCount === 1 ? '' : 's'} differ from the last channel snapshot.`,
      })
    }

    if (['submitted', 'accepted'].includes(stage)) {
      const startedAt = time(channel.publicationState?.acceptedAt || channel.publicationState?.submittedAt)
      if (startedAt && Number(now) - startedAt >= staleAfterMs) {
        addIssue({
          id: `${channelKey}_publication_stuck`,
          severity: 'warning',
          channel: label,
          title: 'Publication confirmation is overdue',
          detail: `${label} has remained ${stage} for more than ${Math.round(staleAfterMs / 3_600_000)} hours. Refresh its status.`,
        })
      }
    }
  }

  const highSeverityCount = issues.filter((issue) => issue.severity === 'high').length
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length
  const status = highSeverityCount ? 'hold' : warningCount ? 'watch' : trackedChannels.length ? 'healthy' : 'not_started'
  return {
    status,
    label: status === 'hold' ? 'Action required' : status === 'watch' ? 'Watch' : status === 'healthy' ? 'Healthy' : 'Not monitoring yet',
    trackedChannelCount: trackedChannels.length,
    issueCount: issues.length,
    highSeverityCount,
    warningCount,
    issues,
    observedAt: new Date(Number(now)).toISOString(),
  }
}
