const LEAD_WORKSPACE_SESSION_SNAPSHOT_PREFIX = 'arch9:lead-workspace-snapshot'
const leadWorkspaceSnapshotCache = new Map()

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLeadIdentityKey(value = '') {
  const raw = normalizeText(value)
  const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0]
  return uuid || raw
}

function getSnapshotKey(organisationId = '', leadId = '') {
  const organisationKey = normalizeText(organisationId)
  const leadKey = normalizeLeadIdentityKey(leadId)
  return organisationKey && leadKey ? `${LEAD_WORKSPACE_SESSION_SNAPSHOT_PREFIX}:${organisationKey}:${leadKey}` : ''
}

function readSessionSnapshot(key = '') {
  if (!key || typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || 'null')
    return parsed && Array.isArray(parsed.leads) && parsed.leads.length ? parsed : null
  } catch {
    return null
  }
}

export function readAgencyLeadWorkspaceSnapshot(organisationId = '', leadId = '') {
  const key = getSnapshotKey(organisationId, leadId)
  if (!key) return null
  const memorySnapshot = leadWorkspaceSnapshotCache.get(key)
  if (memorySnapshot?.leads?.length) return memorySnapshot
  const sessionSnapshot = readSessionSnapshot(key)
  if (sessionSnapshot) leadWorkspaceSnapshotCache.set(key, sessionSnapshot)
  return sessionSnapshot
}

export function writeAgencyLeadWorkspaceSnapshot(organisationId = '', leadId = '', snapshot = {}) {
  const key = getSnapshotKey(organisationId, leadId)
  const leads = Array.isArray(snapshot?.leads) ? snapshot.leads.filter(Boolean) : []
  if (!key || !leads.length) return snapshot
  const nextSnapshot = {
    ...snapshot,
    leads,
    savedAt: new Date().toISOString(),
  }
  leadWorkspaceSnapshotCache.set(key, nextSnapshot)
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(nextSnapshot))
    } catch {
      // Session storage is a resilience cache; the in-memory snapshot remains authoritative.
    }
  }
  return nextSnapshot
}

export function seedAgencyLeadWorkspaceSnapshot(organisationId = '', leadId = '', core = {}, source = 'lead_core') {
  const lead = core?.lead || null
  if (!lead) return null
  const resolvedLeadId = normalizeLeadIdentityKey(lead?.leadId || lead?.lead_id || leadId)
  const requestedLeadId = normalizeLeadIdentityKey(leadId || resolvedLeadId)
  const existing = readAgencyLeadWorkspaceSnapshot(organisationId, requestedLeadId) || {}
  const contact = core?.contact || null
  const contactId = normalizeText(contact?.contactId || contact?.contact_id)
  const existingContacts = Array.isArray(existing.contacts) ? existing.contacts : []
  const existingLeads = Array.isArray(existing.leads) ? existing.leads : []
  const nextSnapshot = {
    ...existing,
    organisationId: normalizeText(organisationId),
    requestedLeadId,
    resolvedLeadId,
    contacts: contact
      ? [contact, ...existingContacts.filter((row) => normalizeText(row?.contactId || row?.contact_id) !== contactId)]
      : existingContacts,
    leads: [lead, ...existingLeads.filter((row) => normalizeLeadIdentityKey(row?.leadId || row?.lead_id) !== resolvedLeadId)],
    leadActivities: Array.isArray(existing.leadActivities) ? existing.leadActivities : [],
    tasks: Array.isArray(existing.tasks) ? existing.tasks : [],
    linkedListings: Array.isArray(existing.linkedListings) ? existing.linkedListings : [],
    leadWorkspaceStatus: 'ready',
    leadWorkspaceReason: source,
    source,
  }
  const written = writeAgencyLeadWorkspaceSnapshot(organisationId, requestedLeadId, nextSnapshot)
  if (resolvedLeadId && resolvedLeadId !== requestedLeadId) {
    writeAgencyLeadWorkspaceSnapshot(organisationId, resolvedLeadId, written)
  }
  return written
}

export function clearAgencyLeadWorkspaceSnapshotCache() {
  leadWorkspaceSnapshotCache.clear()
}
