export const AGENCY_LEAD_VIEW_PREFERENCE_KEY = 'arch9:agency-leads:view-preference:v1'

export function normalizeAgencyLeadViewPreference(value = '') {
  return String(value || '').trim().toLowerCase() === 'kanban' ? 'kanban' : 'table'
}

function preferenceStorageKey({ userId = '', workspaceId = '' } = {}) {
  const user = String(userId || '').trim()
  const workspace = String(workspaceId || '').trim()
  return user && workspace ? `${AGENCY_LEAD_VIEW_PREFERENCE_KEY}:${user}:${workspace}` : ''
}

export function getAgencyLeadViewPreference(scope = {}) {
  const key = preferenceStorageKey(scope)
  if (!key || typeof window === 'undefined' || !window.localStorage) return 'table'
  try {
    return normalizeAgencyLeadViewPreference(window.localStorage.getItem(key))
  } catch {
    return 'table'
  }
}

export function saveAgencyLeadViewPreference(scope = {}, value = 'table') {
  const preference = normalizeAgencyLeadViewPreference(value)
  const key = preferenceStorageKey(scope)
  if (!key || typeof window === 'undefined' || !window.localStorage) return preference
  try {
    window.localStorage.setItem(key, preference)
  } catch {
    // A storage restriction must not prevent a user from changing the current view.
  }
  return preference
}
