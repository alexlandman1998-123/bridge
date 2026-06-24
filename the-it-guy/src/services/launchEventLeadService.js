import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const EVENT_LEADS_TABLE = 'launch_event_leads'
const LOCAL_STORAGE_KEY = 'arch9:launch-event-leads:v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function readUtmParams() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search || '')
  return {
    source: normalizeText(params.get('utm_source')),
    medium: normalizeText(params.get('utm_medium')),
    campaign: normalizeText(params.get('utm_campaign')),
    content: normalizeText(params.get('utm_content')),
    term: normalizeText(params.get('utm_term')),
  }
}

function readDeviceContext() {
  if (typeof window === 'undefined') return {}
  return {
    pageUrl: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer || '',
    userAgent: navigator.userAgent || '',
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    submittedAt: new Date().toISOString(),
  }
}

function persistLocalLead(payload) {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const current = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY) || '[]')
    const nextLead = {
      ...payload,
      id: `local-${Date.now()}`,
      storedLocallyAt: new Date().toISOString(),
    }
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([nextLead, ...current].slice(0, 50)))
    return nextLead
  } catch {
    return null
  }
}

function shouldUseLocalLaunchCapture() {
  if (typeof window === 'undefined') return false
  const hostname = String(window.location.hostname || '').toLowerCase()
  const params = new URLSearchParams(window.location.search || '')
  if (params.get('forceRemote') === '1') return false
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function buildLaunchEventLeadPayload(form = {}) {
  const name = normalizeText(form.name)
  const phone = normalizeText(form.phone)
  const email = normalizeEmail(form.email)
  const interest = normalizeText(form.interest)
  const preferredWindow = normalizeText(form.preferredWindow)
  const note = normalizeText(form.note)
  const company = normalizeText(form.company)

  return {
    event_slug: 'arch9-launch-2026-06-24',
    full_name: name,
    phone,
    email: email || null,
    company: company || null,
    interest,
    preferred_window: preferredWindow || null,
    note: note || null,
    status: 'new',
    source: 'event_qr',
    metadata: {
      utm: readUtmParams(),
      device: readDeviceContext(),
      preferredFollowUp: normalizeText(form.preferredFollowUp) || 'private_follow_up_this_week',
    },
  }
}

export function validateLaunchEventLead(form = {}) {
  const errors = {}
  if (!normalizeText(form.name)) errors.name = 'Tell us your name.'
  if (!normalizeText(form.phone)) errors.phone = 'Add a phone number so the team can reach you.'
  if (!normalizeText(form.interest)) errors.interest = 'Choose what best describes you.'
  return errors
}

export async function submitLaunchEventLead(form = {}) {
  const payload = buildLaunchEventLeadPayload(form)

  if (shouldUseLocalLaunchCapture() || !isSupabaseConfigured || !supabase) {
    const localLead = persistLocalLead(payload)
    if (localLead) {
      return { lead: localLead, source: 'local' }
    }
    throw new Error('Arch9 could not save this request on this device. Please show this screen to the launch team.')
  }

  const { data, error } = await supabase
    .from(EVENT_LEADS_TABLE)
    .insert(payload)
    .select('id, full_name, status, created_at')
    .single()

  if (error) {
    console.warn('[launchEventLeadService] remote submit failed; saved locally instead', error)
    const localLead = persistLocalLead(payload)
    if (localLead) {
      return { lead: localLead, source: 'local', remoteError: error?.message || 'Remote submit failed.' }
    }
    throw new Error('We could not save your request yet. Please try again or show this screen to the Arch9 team.')
  }

  return { lead: data, source: 'remote' }
}
