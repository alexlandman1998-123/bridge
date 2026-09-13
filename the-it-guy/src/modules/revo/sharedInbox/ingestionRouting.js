const SOURCES = new Set(['website', 'property24', 'private_property'])

function text(value = '') {
  return String(value ?? '').trim()
}

function normalizeSource(value = '') {
  const key = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (key === 'p24') return 'property24'
  if (key === 'privateproperty') return 'private_property'
  return key
}

function normalizeAddress(value = '') {
  const address = text(value).toLowerCase()
  if (!address) return ''
  if (address.includes('@')) return address
  return `+${address.replace(/\D/g, '')}`
}

export function normalizeRevoExternalEnquiry(input = {}) {
  const source = normalizeSource(input.source || input.sourceChannel)
  const externalReference = text(input.externalReference || input.external_reference || input.enquiryId || input.id)
  const contact = input.contact && typeof input.contact === 'object' ? input.contact : {}
  const contactAddress = normalizeAddress(input.contactAddress || input.email || input.phone || contact.email || contact.phone)
  if (!SOURCES.has(source)) throw new Error('Use Website, Property24, or Private Property as the enquiry source.')
  if (!externalReference) throw new Error('The source enquiry reference is required for idempotent inbox ingestion.')
  return {
    source,
    externalReference,
    contactName: text(input.contactName || input.name || contact.name),
    contactAddress,
    subject: text(input.subject || input.propertyTitle || input.listingTitle),
    messageBody: text(input.message || input.body || input.enquiry),
    listingId: text(input.listingId || input.listing_id) || null,
    leadId: text(input.leadId || input.lead_id) || null,
    receivedAt: input.receivedAt || input.received_at || new Date().toISOString(),
  }
}

export function resolveRevoEnquiryRouting({ listing = null, fallback = {} } = {}) {
  const row = listing && typeof listing === 'object' ? listing : {}
  const fallbackRoute = fallback && typeof fallback === 'object' ? fallback : {}
  const listingOwnerId = text(row.assigned_user_id || row.assignedUserId || row.assigned_agent_id || row.assignedAgentId || row.agent_id || row.agentId || row.owner_user_id || row.ownerUserId)
  const listingBranchId = text(row.branch_id || row.branchId)
  const fallbackUserId = text(fallbackRoute.assignedUserId || fallbackRoute.assigned_user_id)
  const fallbackTeamId = text(fallbackRoute.assignedTeamId || fallbackRoute.assigned_team_id)
  const fallbackBranchId = text(fallbackRoute.branchId || fallbackRoute.branch_id)
  return {
    assignedUserId: listingOwnerId || fallbackUserId || null,
    assignedTeamId: listingOwnerId ? null : fallbackTeamId || null,
    branchId: listingBranchId || fallbackBranchId || null,
    reason: listingOwnerId ? 'listing_owner' : fallbackUserId ? 'source_fallback_user' : fallbackTeamId ? 'source_fallback_team' : 'unassigned',
  }
}
