export function rentalChannelStatus(status = 'not_published') {
  const key = String(status || 'not_published').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['live', 'published', 'active', 'on_portal', 'current'].includes(key)) return { label: 'Live', tone: 'live', live: true }
  if (['needs_attention', 'attention', 'warning', 'blocked', 'missing', 'failed', 'error', 'withdrawal_failed'].includes(key)) return { label: 'Needs attention', tone: 'attention', live: false }
  const labels = { submitted: 'Submitted', accepted: 'Awaiting verification', pending: 'Pending', queued: 'Queued', awaiting_verification: 'Awaiting verification', syncing: 'Syncing', updating: 'Updating', publishing: 'Publishing', withdrawn: 'Withdrawn', expired: 'Expired', removed: 'Removed', not_published: 'Not published', unpublished: 'Not published', draft: 'Not published' }
  const tone = ['submitted', 'accepted', 'pending', 'queued', 'awaiting_verification', 'syncing', 'updating', 'publishing'].includes(key) ? 'syncing' : 'neutral'
  return { label: labels[key] || key.charAt(0).toUpperCase() + key.slice(1).replaceAll('_', ' '), tone, live: false }
}

