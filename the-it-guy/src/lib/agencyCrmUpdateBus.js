export const AGENCY_CRM_UPDATED_EVENT = 'itg:agency-crm-updated'

function text(value = '') {
  return String(value || '').trim()
}

export function emitAgencyCrmUpdated({ organisationId = '', leadId = '', mutation = 'updated' } = {}) {
  if (typeof window === 'undefined') return
  const detail = {
    organisationId: text(organisationId),
    leadId: text(leadId),
    mutation: text(mutation) || 'updated',
    occurredAt: new Date().toISOString(),
  }
  if (typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new window.CustomEvent(AGENCY_CRM_UPDATED_EVENT, { detail }))
    return
  }
  window.dispatchEvent(new Event(AGENCY_CRM_UPDATED_EVENT))
}

export function getAgencyCrmUpdateDetail(event) {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  return {
    organisationId: text(detail.organisationId),
    leadId: text(detail.leadId),
    mutation: text(detail.mutation),
    occurredAt: text(detail.occurredAt),
  }
}
