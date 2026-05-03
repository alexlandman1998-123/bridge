const VIEWING_REQUESTS_STORAGE_KEY = 'itg:viewing-requests:v1'

export const VIEWING_STATUS = {
  REQUESTED: 'viewing_requested',
  PENDING_APPROVAL: 'pending_approval',
  CONFIRMED: 'confirmed',
  DECLINED: 'declined',
  RESCHEDULE_REQUESTED: 'reschedule_requested',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
}

export const VIEWING_RESPONSE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PROPOSED_NEW_TIME: 'proposed_new_time',
}

function readRows() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(VIEWING_REQUESTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRows(rows) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(VIEWING_REQUESTS_STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []))
  window.dispatchEvent(new Event('itg:viewings-updated'))
}

function generateId(prefix = 'viewing') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now()}`
}

function buildParticipants(payload) {
  const listingType = String(payload?.listingType || 'private_listing').trim().toLowerCase()
  const createdByRole = String(payload?.createdByRole || 'agent').trim().toLowerCase()

  const participants = [
    {
      participant_id: generateId('participant'),
      role: 'buyer',
      name: payload?.buyerName || 'Buyer',
      response_status: createdByRole === 'buyer' ? VIEWING_RESPONSE_STATUS.ACCEPTED : VIEWING_RESPONSE_STATUS.PENDING,
      responded_at: createdByRole === 'buyer' ? new Date().toISOString() : null,
    },
    {
      participant_id: generateId('participant'),
      role: 'agent',
      name: payload?.agentName || 'Agent',
      response_status: createdByRole === 'agent' ? VIEWING_RESPONSE_STATUS.ACCEPTED : VIEWING_RESPONSE_STATUS.PENDING,
      responded_at: createdByRole === 'agent' ? new Date().toISOString() : null,
    },
  ]

  if (listingType === 'development') {
    participants.push({
      participant_id: generateId('participant'),
      role: 'developer',
      name: payload?.developerName || 'Developer Sales Team',
      response_status: createdByRole === 'developer' ? VIEWING_RESPONSE_STATUS.ACCEPTED : VIEWING_RESPONSE_STATUS.PENDING,
      responded_at: createdByRole === 'developer' ? new Date().toISOString() : null,
    })
  } else {
    participants.push({
      participant_id: generateId('participant'),
      role: 'seller',
      name: payload?.sellerName || 'Seller',
      response_status: createdByRole === 'seller' ? VIEWING_RESPONSE_STATUS.ACCEPTED : VIEWING_RESPONSE_STATUS.PENDING,
      responded_at: createdByRole === 'seller' ? new Date().toISOString() : null,
    })
  }

  return participants
}

function deriveViewingStatus(participants = [], fallback = VIEWING_STATUS.PENDING_APPROVAL) {
  const rows = Array.isArray(participants) ? participants : []
  if (!rows.length) return fallback
  if (rows.some((participant) => participant?.response_status === VIEWING_RESPONSE_STATUS.DECLINED)) {
    return VIEWING_STATUS.DECLINED
  }
  if (rows.some((participant) => participant?.response_status === VIEWING_RESPONSE_STATUS.PROPOSED_NEW_TIME)) {
    return VIEWING_STATUS.RESCHEDULE_REQUESTED
  }
  if (rows.every((participant) => participant?.response_status === VIEWING_RESPONSE_STATUS.ACCEPTED)) {
    return VIEWING_STATUS.CONFIRMED
  }
  return VIEWING_STATUS.PENDING_APPROVAL
}

export function formatViewingStatusLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function readViewingRequests() {
  return readRows()
}

export function createViewingRequest(payload = {}) {
  const participants = buildParticipants(payload)
  const request = {
    viewing_id: generateId('viewing'),
    listing_id: payload?.listingId || '',
    listing_type: payload?.listingType || 'private_listing',
    listing_title: payload?.listingTitle || 'Listing',
    buyer_lead_id: payload?.buyerLeadId || '',
    buyer_name: payload?.buyerName || 'Buyer',
    agent_id: payload?.agentId || '',
    seller_id: payload?.sellerId || '',
    developer_id: payload?.developerId || '',
    created_by: payload?.createdBy || 'agent',
    created_by_role: payload?.createdByRole || 'agent',
    proposed_date: payload?.proposedDate || '',
    proposed_time: payload?.proposedTime || '',
    alternative_times: Array.isArray(payload?.alternativeTimes) ? payload.alternativeTimes : [],
    location: payload?.location || '',
    notes: payload?.notes || '',
    status: deriveViewingStatus(participants, VIEWING_STATUS.PENDING_APPROVAL),
    participants,
    feedback: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  writeRows([request, ...readRows()])
  return request
}

export function updateViewingParticipantResponse(viewingId, role, responseStatus, options = {}) {
  const rows = readRows()
  let updated = null
  const nextRows = rows.map((row) => {
    if (String(row?.viewing_id || '') !== String(viewingId)) return row
    const participants = (row?.participants || []).map((participant) =>
      String(participant?.role || '') === String(role || '')
        ? {
            ...participant,
            response_status: responseStatus,
            responded_at: new Date().toISOString(),
          }
        : participant,
    )

    let nextStatus = deriveViewingStatus(participants, row?.status || VIEWING_STATUS.PENDING_APPROVAL)
    const nextRow = {
      ...row,
      participants,
      updated_at: new Date().toISOString(),
      proposed_date: options?.proposedDate || row?.proposed_date || '',
      proposed_time: options?.proposedTime || row?.proposed_time || '',
      notes: options?.notes ? `${row?.notes ? `${row.notes}\n` : ''}${options.notes}` : row?.notes || '',
    }

    if (responseStatus === VIEWING_RESPONSE_STATUS.PROPOSED_NEW_TIME) {
      nextStatus = VIEWING_STATUS.RESCHEDULE_REQUESTED
    }

    updated = {
      ...nextRow,
      status: nextStatus,
    }
    return updated
  })
  if (updated) writeRows(nextRows)
  return updated
}

export function rescheduleViewingRequest(viewingId, payload = {}) {
  const rows = readRows()
  let updated = null
  const nextRows = rows.map((row) => {
    if (String(row?.viewing_id || '') !== String(viewingId)) return row
    const nextParticipants = (row?.participants || []).map((participant) => ({
      ...participant,
      response_status:
        String(participant?.role || '') === String(payload?.proposedByRole || 'agent')
          ? VIEWING_RESPONSE_STATUS.ACCEPTED
          : VIEWING_RESPONSE_STATUS.PENDING,
      responded_at:
        String(participant?.role || '') === String(payload?.proposedByRole || 'agent')
          ? new Date().toISOString()
          : null,
    }))
    updated = {
      ...row,
      proposed_date: payload?.proposedDate || row?.proposed_date || '',
      proposed_time: payload?.proposedTime || row?.proposed_time || '',
      status: VIEWING_STATUS.PENDING_APPROVAL,
      participants: nextParticipants,
      updated_at: new Date().toISOString(),
      notes: payload?.notes ? `${row?.notes ? `${row.notes}\n` : ''}${payload.notes}` : row?.notes || '',
    }
    return updated
  })
  if (updated) writeRows(nextRows)
  return updated
}

export function completeViewingRequest(viewingId) {
  const rows = readRows()
  let updated = null
  const nextRows = rows.map((row) => {
    if (String(row?.viewing_id || '') !== String(viewingId)) return row
    updated = {
      ...row,
      status: VIEWING_STATUS.COMPLETED,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return updated
  })
  if (updated) writeRows(nextRows)
  return updated
}

export function saveViewingFeedback(viewingId, payload = {}) {
  const rows = readRows()
  let updated = null
  const nextRows = rows.map((row) => {
    if (String(row?.viewing_id || '') !== String(viewingId)) return row
    updated = {
      ...row,
      feedback: {
        interest_level: payload?.interestLevel || '',
        feedback_notes: payload?.feedbackNotes || '',
        next_action: payload?.nextAction || '',
        created_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }
    return updated
  })
  if (updated) writeRows(nextRows)
  return updated
}

export function getViewingRequestsForListing(listingId) {
  return readRows()
    .filter((row) => String(row?.listing_id || '') === String(listingId || ''))
    .sort((left, right) => new Date(right?.updated_at || 0) - new Date(left?.updated_at || 0))
}

export function getViewingRequestsForLead(leadId) {
  return readRows()
    .filter((row) => String(row?.buyer_lead_id || '') === String(leadId || ''))
    .sort((left, right) => new Date(right?.updated_at || 0) - new Date(left?.updated_at || 0))
}

export function getViewingDashboardSummary() {
  const rows = readRows()
  const now = Date.now()
  const pendingApproval = rows.filter((row) => row?.status === VIEWING_STATUS.PENDING_APPROVAL || row?.status === VIEWING_STATUS.RESCHEDULE_REQUESTED)
  const upcoming = rows.filter((row) => {
    if (row?.status !== VIEWING_STATUS.CONFIRMED) return false
    const date = new Date(`${row?.proposed_date || ''}T${row?.proposed_time || '00:00'}`)
    return !Number.isNaN(date.getTime()) && date.getTime() >= now
  })
  const missed = rows.filter((row) => {
    const date = new Date(`${row?.proposed_date || ''}T${row?.proposed_time || '00:00'}`)
    return !Number.isNaN(date.getTime()) && date.getTime() < now && ![VIEWING_STATUS.COMPLETED, VIEWING_STATUS.CANCELLED, VIEWING_STATUS.NO_SHOW].includes(row?.status)
  })
  return {
    rows: rows.sort((left, right) => new Date(right?.updated_at || 0) - new Date(left?.updated_at || 0)),
    pendingApproval,
    upcoming,
    missed,
  }
}
