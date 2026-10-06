export const REVO_INBOX_VIEWS = Object.freeze([
  { key: 'all', label: 'All open' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'team', label: 'My team' },
  { key: 'waiting_on_us', label: 'Waiting on us' },
  { key: 'closed', label: 'Closed' },
])

export function resolveRevoInboxView(value) {
  return REVO_INBOX_VIEWS.find((view) => view.key === value)?.key || 'all'
}
