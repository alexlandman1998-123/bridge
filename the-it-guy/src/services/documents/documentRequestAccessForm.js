export const DOCUMENT_REQUEST_ACCESS_OPTIONS = Object.freeze([
  { value: 'requested_party', label: 'Requested party' },
  { value: 'professional_group', label: 'Professional roleplayers' },
  { value: 'agent', label: 'Agent' },
  { value: 'attorney', label: 'Attorney team' },
  { value: 'bond_originator', label: 'Bond originator' },
  { value: 'developer', label: 'Developer' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
])

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
}

function uniqueValues(values = []) {
  return [...new Set(values.map(normalizeKey).filter(Boolean))]
}

export function getDefaultDocumentAccessSelections(visibility = 'client_visible') {
  const normalized = normalizeKey(visibility)
  if (['shared', 'shared_role_players', 'professional_shared'].includes(normalized)) {
    return ['professional_group']
  }
  if (['internal', 'internal_only'].includes(normalized)) {
    return []
  }
  return ['requested_party']
}

export function toggleDocumentAccessSelection(selections = [], value = '') {
  const normalizedValue = normalizeKey(value)
  if (!normalizedValue) return uniqueValues(selections)
  const current = uniqueValues(selections)
  if (current.includes(normalizedValue)) {
    return current.filter((selection) => selection !== normalizedValue)
  }
  return [...current, normalizedValue]
}

function principalForAudience(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized || normalized === 'other') return null
  if (normalized === 'client') return { clientGroup: 'client', label: 'Client' }
  if (normalized === 'buyer') return { clientGroup: 'buyer', label: 'Buyer' }
  if (normalized === 'seller') return { clientGroup: 'seller', label: 'Seller' }
  if (normalized === 'buyer_and_seller') return { clientGroup: 'buyer_and_seller', label: 'Buyer and seller' }
  if (normalized === 'bank') return { role: 'bond_originator', label: 'Bank / bond originator' }
  return { role: normalized, label: normalized.replace(/_/g, ' ') }
}

function principalForAccessSelection(selection = '', draft = {}) {
  const normalized = normalizeKey(selection)
  if (normalized === 'requested_party') {
    return principalForAudience(draft.requestedFrom || draft.requested_from || draft.assignedToRole || draft.assigned_to_role)
  }
  if (normalized === 'professional_group') {
    return { professionalGroup: true, label: 'Professional roleplayers' }
  }
  return principalForAudience(normalized)
}

export function buildDocumentRequestTargets(draft = {}) {
  const principal = principalForAudience(draft.requestedFrom || draft.requested_from || draft.assignedToRole || draft.assigned_to_role)
  return principal ? [principal] : []
}

export function buildDocumentRequestAccessGrants(draft = {}) {
  const selections = uniqueValues(
    Array.isArray(draft.accessSelections || draft.access_selections)
      ? draft.accessSelections || draft.access_selections
      : getDefaultDocumentAccessSelections(draft.visibility || draft.visibility_scope),
  )

  return selections
    .map((selection) => principalForAccessSelection(selection, draft))
    .filter(Boolean)
    .map((principal) => ({
      ...principal,
      canView: true,
      canDownload: true,
    }))
}
