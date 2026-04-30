const AGENT_PRIVATE_LISTINGS_STORAGE_KEY = 'itg:agent-private-listings:v1'

export const SELLER_ONBOARDING_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  COMPLETED: 'completed',
}

export const OFFER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
}

export const SELLER_REQUIRED_DOCUMENTS = [
  { key: 'mandate_to_sell', label: 'Mandate to Sell', status: 'requested', required: true },
  { key: 'rates_account', label: 'Rates Account (Municipal)', status: 'requested', required: true },
  { key: 'levies_statement', label: 'Levies Statement', status: 'requested', required: false },
  { key: 'bond_statement', label: 'Bond Statement', status: 'requested', required: false },
  { key: 'utility_bill', label: 'Utility Bill', status: 'requested', required: false },
  { key: 'id_document', label: 'ID Document', status: 'requested', required: true },
  { key: 'proof_of_address', label: 'Proof of Address', status: 'requested', required: true },
  { key: 'entity_documents', label: 'Company / Trust Documents', status: 'requested', required: false },
]

export function generateId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now()}`
}

export function generateSellerOnboardingToken() {
  return `seller-${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`
}

export function buildSellerOnboardingLink(token, baseUrl = '') {
  if (!token) return ''
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.bridgenine.co.za')
  return `${origin}/seller/onboarding/${token}`
}

export function readAgentPrivateListings() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(AGENT_PRIVATE_LISTINGS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeAgentPrivateListings(rows) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AGENT_PRIVATE_LISTINGS_STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []))
}

export function findListingBySellerOnboardingToken(token) {
  if (!token) return null
  const normalized = String(token).trim()
  return readAgentPrivateListings().find((listing) => String(listing?.sellerOnboarding?.token || '').trim() === normalized) || null
}

export function updateListingBySellerOnboardingToken(token, updater) {
  if (!token || typeof updater !== 'function') return null
  const normalized = String(token).trim()
  const rows = readAgentPrivateListings()
  let updatedListing = null
  const nextRows = rows.map((row) => {
    if (String(row?.sellerOnboarding?.token || '').trim() !== normalized) return row
    const nextRow = updater({ ...row })
    updatedListing = nextRow
    return nextRow
  })
  if (updatedListing) {
    writeAgentPrivateListings(nextRows)
  }
  return updatedListing
}

