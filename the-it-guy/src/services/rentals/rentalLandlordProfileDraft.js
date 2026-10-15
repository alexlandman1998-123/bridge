// Recovery stays in the signed-in user's browser tab, never shared localStorage.
export const LANDLORD_PROFILE_DRAFT_TTL = 8 * 60 * 60 * 1000
export function profileSignature(value) {
  const canonical = item => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item ?? ''
  return JSON.stringify(canonical(value))
}
export function mergeLandlordProfileDraft(base = {}, draft = {}, saved = {}) {
  const profile = { ...saved }
  const conflicts = {}
  for (const key of new Set([...Object.keys(base), ...Object.keys(draft), ...Object.keys(saved)])) {
    const localChanged = profileSignature(draft[key]) !== profileSignature(base[key])
    const remoteChanged = profileSignature(saved[key]) !== profileSignature(base[key])
    if (localChanged) profile[key] = draft[key]
    if (localChanged && remoteChanged && profileSignature(draft[key]) !== profileSignature(saved[key])) conflicts[key] = saved[key]
  }
  return { profile, conflicts }
}
export function landlordProfileDraftKey(context, leadId) {
  const actorId = context.actor?.id || context.actor?.userId
  return actorId && context.organisationId && leadId ? `arch9:landlord-profile:${context.organisationId}:${actorId}:${context.scope?.branchId || ''}:${leadId}` : ''
}
export function readLandlordProfileDraft(key, storage) {
  if (!key) return null
  try {
    storage ??= globalThis.sessionStorage
    const draft = JSON.parse(storage?.getItem(key) || 'null')
    if (!draft || draft.version !== 1 || !draft.profile || !draft.discovery || Date.now() - draft.updatedAt > LANDLORD_PROFILE_DRAFT_TTL) { storage?.removeItem(key); return null }
    return draft
  } catch { return null }
}
export function writeLandlordProfileDraft(key, profile, discovery, storage) {
  if (!key) return false
  try { storage ??= globalThis.sessionStorage; if (!storage) return false; storage.setItem(key, JSON.stringify({ version: 1, updatedAt: Date.now(), profile, discovery })); return true } catch { return false }
}
export function removeLandlordProfileDraft(key, profile, storage) {
  try {
    storage ??= globalThis.sessionStorage
    const current = readLandlordProfileDraft(key, storage)
    // A late acknowledgement must not remove a newer editor's draft.
    if (!profile || current && profileSignature(current.profile) === profileSignature(profile)) storage?.removeItem(key)
  } catch { /* beforeunload protection remains available when storage is blocked */ }
}
