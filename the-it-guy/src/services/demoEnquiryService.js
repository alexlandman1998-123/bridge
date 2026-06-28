import { supabase } from '../lib/supabaseClient'

const DEFAULT_LIMIT = 100

function normalizeText(value = '') {
  return String(value || '').trim()
}

async function getAccessToken() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) {
    throw new Error('Authentication is required.')
  }
  return data.session.access_token
}

async function requestDemoEnquiries(path, options = {}) {
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
  if (!response.ok) {
    throw new Error(data?.message || 'Demo enquiries request failed.')
  }
  return data
}

export async function listDemoEnquiries({ status = 'all', search = '', limit = DEFAULT_LIMIT } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit || DEFAULT_LIMIT))
  if (normalizeText(status) && status !== 'all') params.set('status', status)
  if (normalizeText(search)) params.set('q', normalizeText(search))
  const data = await requestDemoEnquiries(`/api/admin/demo-enquiries?${params.toString()}`)
  return {
    enquiries: Array.isArray(data.enquiries) ? data.enquiries : [],
    count: Number(data.count || 0),
  }
}

export async function updateDemoEnquiryStatus(id, status) {
  const data = await requestDemoEnquiries('/api/admin/demo-enquiries', {
    method: 'PATCH',
    body: JSON.stringify({ id, status }),
  })
  return data.enquiry || null
}
