import { supabase } from '../lib/supabaseClient'

const DEFAULT_PAGE_SIZE = 25

function normalizeText(value = '') {
  return String(value || '').trim()
}

async function getAccessToken() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('Authentication is required.')
  return data.session.access_token
}

async function requestAdminLeads(path, options = {}) {
  const accessToken = await getAccessToken()
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.message || 'Intake leads request failed.')
  return data
}

export async function listAdminIntakeLeads({
  search = '',
  stage = 'all',
  priority = 'all',
  assignment = 'all',
  source = 'all',
  intakeKind = 'all',
  sort = 'newest',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const params = new URLSearchParams({
    page: String(Math.max(1, Number(page) || 1)),
    limit: String(Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)),
    sort: normalizeText(sort) || 'newest',
  })

  if (normalizeText(search)) params.set('q', normalizeText(search))
  if (stage !== 'all') params.set('stage', normalizeText(stage))
  if (priority !== 'all') params.set('priority', normalizeText(priority))
  if (assignment !== 'all') params.set('assignment', normalizeText(assignment))
  if (source !== 'all') params.set('source', normalizeText(source))
  if (intakeKind !== 'all') params.set('intakeKind', normalizeText(intakeKind))

  const data = await requestAdminLeads(`/api/admin/demo-enquiries?${params.toString()}`)
  return {
    leads: Array.isArray(data.enquiries) ? data.enquiries : [],
    count: Number(data.count || 0),
    page: Number(data.page || 1),
    pageSize: Number(data.pageSize || pageSize),
    pageCount: Number(data.pageCount || 1),
    summary: {
      total: Number(data.summary?.total || 0),
      new: Number(data.summary?.new || 0),
      unassigned: Number(data.summary?.unassigned || 0),
      overdue: Number(data.summary?.overdue || 0),
    },
    assignees: Array.isArray(data.assignees) ? data.assignees : [],
    health: data.health && typeof data.health === 'object' ? data.health : null,
  }
}

export async function updateAdminIntakeLead(id, patch) {
  const leadId = normalizeText(id)
  if (!leadId) throw new Error('A lead id is required.')
  const data = await requestAdminLeads('/api/admin/demo-enquiries', {
    method: 'PATCH',
    body: JSON.stringify({ id: leadId, patch }),
  })
  return data.enquiry || null
}

export async function getAdminIntakeLeadContext(id) {
  const leadId = normalizeText(id)
  if (!leadId) throw new Error('A lead id is required.')
  const params = new URLSearchParams({ leadContext: leadId })
  const data = await requestAdminLeads(`/api/admin/demo-enquiries?${params.toString()}`)
  return {
    dedupeStatus: normalizeText(data.context?.dedupeStatus) || 'canonical',
    duplicateOfEnquiryId: normalizeText(data.context?.duplicateOfEnquiryId),
    candidates: Array.isArray(data.context?.candidates) ? data.context.candidates : [],
    activity: Array.isArray(data.context?.activity) ? data.context.activity : [],
  }
}

export async function reviewAdminIntakeLeadDuplicate(id, { dedupeStatus, duplicateOfEnquiryId = null } = {}) {
  const leadId = normalizeText(id)
  if (!leadId) throw new Error('A lead id is required.')
  const data = await requestAdminLeads('/api/admin/demo-enquiries', {
    method: 'PATCH',
    body: JSON.stringify({
      id: leadId,
      action: 'review_duplicate',
      dedupeStatus: normalizeText(dedupeStatus),
      duplicateOfEnquiryId: normalizeText(duplicateOfEnquiryId) || null,
    }),
  })
  return data.enquiry || null
}

export async function retryAdminIntakeLeadNotification(id) {
  const leadId = normalizeText(id)
  if (!leadId) throw new Error('A lead id is required.')
  const data = await requestAdminLeads('/api/admin/demo-enquiries', {
    method: 'PATCH',
    body: JSON.stringify({ id: leadId, action: 'retry_notification' }),
  })
  return {
    lead: data.enquiry || null,
    notification: data.notification || {},
  }
}

export async function getAdminIntakeConversionContext(id) {
  const leadId = normalizeText(id)
  if (!leadId) throw new Error('A lead id is required.')
  const params = new URLSearchParams({ conversionContext: leadId })
  const data = await requestAdminLeads(`/api/admin/demo-enquiries?${params.toString()}`)
  const context = data.context && typeof data.context === 'object' ? data.context : {}
  return {
    eligible: context.eligible === true,
    blockers: Array.isArray(context.blockers) ? context.blockers : [],
    defaults: context.defaults && typeof context.defaults === 'object' ? context.defaults : {},
    convertedOrganization: context.convertedOrganization || null,
    matchingOrganizations: Array.isArray(context.matchingOrganizations) ? context.matchingOrganizations : [],
  }
}

export async function convertAdminIntakeLead(id, { mode, organisation = {}, existingOrganisationId = null } = {}) {
  const leadId = normalizeText(id)
  if (!leadId) throw new Error('A lead id is required.')
  const data = await requestAdminLeads('/api/admin/demo-enquiries', {
    method: 'PATCH',
    body: JSON.stringify({
      id: leadId,
      action: 'convert_lead',
      mode: normalizeText(mode),
      organisation,
      existingOrganisationId: normalizeText(existingOrganisationId) || null,
    }),
  })
  return {
    lead: data.enquiry || null,
    conversion: data.conversion || null,
  }
}
