export function resolveAgencyLeadWorkspaceTab(search = '') {
  const params = new URLSearchParams(search)
  return String(params.get('tab') || params.get('sellerWorkspace') || '').trim().toLowerCase() || 'overview'
}
