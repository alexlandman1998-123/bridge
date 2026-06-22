import { supabase } from '../lib/supabaseClient'

function normalizeText(value = '') {
  return String(value || '').trim()
}

export async function fetchMissionControlSnapshot({ signal } = {}) {
  const accessToken = await resolveAccessToken()
  if (!accessToken) {
    const error = new Error('Authentication is required.')
    error.status = 401
    error.code = 'unauthorized'
    throw error
  }

  const response = await fetch('/api/hq/mission-control', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = new Error(normalizeText(payload?.message) || 'Mission Control could not be loaded.')
    error.status = response.status
    error.code = normalizeText(payload?.error) || 'hq_snapshot_error'
    throw error
  }

  return payload
}

export async function fetchAdminMobileDashboard({ signal } = {}) {
  const accessToken = await resolveAccessToken()
  if (!accessToken) {
    const error = new Error('Authentication is required.')
    error.status = 401
    error.code = 'unauthorized'
    throw error
  }

  const response = await fetch('/api/admin/mobile-dashboard', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = new Error(normalizeText(payload?.message) || 'Admin mobile dashboard could not be loaded.')
    error.status = response.status
    error.code = normalizeText(payload?.error) || 'admin_mobile_dashboard_error'
    throw error
  }

  return payload
}

async function resolveAccessToken() {
  if (!supabase) return ''
  const session = await supabase.auth.getSession()
  if (session.error) throw session.error
  return normalizeText(session.data?.session?.access_token)
}
