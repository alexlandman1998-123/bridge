// One Inbox entry for every workspace navigation, immediately after its dashboard.
export function withSharedInboxNavigation(items = []) {
  const clean = items.filter(item => !['shared_inbox', 'revo_shared_inbox'].includes(item.key))
  const dashboard = clean.findIndex(item => item.key === 'dashboard' || item.key?.endsWith('_dashboard') || item.label === 'Dashboard')
  const index = dashboard < 0 ? 0 : dashboard + 1
  return [...clean.slice(0, index), {
    key: 'revo_shared_inbox', label: 'Inbox', to: '/inbox', activeMatch: ['/inbox', '/revo/inbox'],
  }, ...clean.slice(index)]
}
