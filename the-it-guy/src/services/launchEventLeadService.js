import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const EVENT_LEADS_TABLE = 'launch_event_leads'
const REFERRAL_CLICKS_TABLE = 'launch_event_referral_clicks'
const LOCAL_STORAGE_KEY = 'arch9:launch-event-leads:v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeSelectionList(value = []) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean)
  }
  const text = normalizeText(value)
  return text ? [text] : []
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

function readReferralClickContext() {
  if (typeof window === 'undefined') return {}
  return {
    pageUrl: window.location.href,
    referrer: document.referrer || '',
    userAgent: navigator.userAgent || '',
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    clickedAt: new Date().toISOString(),
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
  const name = normalizeText(form.fullName || form.name)
  const phone = normalizeText(form.phone)
  const email = normalizeEmail(form.email)
  const roleType = normalizeText(form.roleType || form.interest)
  const discussionFocusSelections = normalizeSelectionList(form.discussionFocus)
  const discussionFocus = discussionFocusSelections.join('; ')
  const preferredTime = normalizeText(form.preferredTime || form.preferredWindow)
  const note = normalizeText(form.notes || form.note)
  const company = normalizeText(form.company)

  return {
    event_slug: 'arch9-launch-2026-06-24',
    event_name: 'Arch9 Launch',
    event_date: '2026-06-24',
    full_name: name,
    phone,
    email: email || null,
    company: company || null,
    interest: roleType,
    role_type: roleType,
    discussion_focus: discussionFocus || null,
    preferred_time: preferredTime || null,
    preferred_window: preferredTime || null,
    note: note || null,
    status: 'new',
    source: 'arch9_launch_qr',
    metadata: {
      utm: readUtmParams(),
      device: readDeviceContext(),
      followUpRequest: {
        fullName: name,
        email: email || '',
        phone,
        company,
        roleType,
        discussionFocus,
        discussionFocusSelections,
        notes: note,
        preferredTime,
        source: 'arch9_launch_qr',
        eventName: 'Arch9 Launch',
        eventDate: '2026-06-24',
        status: 'new',
      },
    },
  }
}

export function validateLaunchEventLead(form = {}) {
  const errors = {}
  const email = normalizeEmail(form.email)
  if (!normalizeText(form.fullName || form.name)) errors.name = 'Tell us your name.'
  if (!normalizeText(form.phone)) errors.phone = 'Add a phone number so the team can reach you.'
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
  if (!normalizeText(form.roleType || form.interest)) errors.roleType = 'Choose what best describes you.'
  const discussionFocusCount = normalizeSelectionList(form.discussionFocus).length
  if (!discussionFocusCount) errors.discussionFocus = 'Choose at least one option.'
  if (discussionFocusCount > 2) errors.discussionFocus = 'Select up to 2.'
  if (!normalizeText(form.preferredTime || form.preferredWindow)) errors.preferredTime = 'Choose a preferred time.'
  return errors
}

async function sendLaunchConfirmationEmail(payload) {
  if (!payload?.email) {
    return { sent: false, skipped: true, reason: 'missing_email' }
  }

  const { data, error } = await invokeEdgeFunction('send-email', {
    body: {
      type: 'arch9_launch_confirmation',
      to: payload.email,
      recipientName: payload.full_name,
      roleType: payload.role_type,
      discussionFocus: payload.discussion_focus,
      preferredTime: payload.preferred_time,
      source: 'arch9_launch_qr',
    },
  })

  if (error || data?.error) {
    console.warn('[launchEventLeadService] confirmation email failed', error || data)
    return {
      sent: false,
      error: error?.message || data?.error || 'Confirmation email failed.',
    }
  }

  return { sent: Boolean(data?.sent), data }
}

async function sendLaunchInternalNotificationEmail(payload) {
  const { data, error } = await invokeEdgeFunction('send-email', {
    body: {
      type: 'arch9_launch_internal_notification',
      to: 'alexlandman1998@gmail.com',
      fullName: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      company: payload.company,
      roleType: payload.role_type,
      discussionFocus: payload.discussion_focus,
      preferredTime: payload.preferred_time,
      note: payload.note,
      pageUrl: payload.metadata?.device?.pageUrl,
      submittedAt: payload.metadata?.device?.submittedAt,
      source: 'arch9_launch_qr',
    },
  })

  if (error || data?.error) {
    console.warn('[launchEventLeadService] internal notification email failed', error || data)
    return {
      sent: false,
      error: error?.message || data?.error || 'Internal notification email failed.',
    }
  }

  return { sent: Boolean(data?.sent), data }
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

  const { error } = await supabase
    .from(EVENT_LEADS_TABLE)
    .insert(payload)

  if (error) {
    console.warn('[launchEventLeadService] remote submit failed; saved locally instead', error)
    const localLead = persistLocalLead(payload)
    if (localLead) {
      return { lead: localLead, source: 'local', remoteError: error?.message || 'Remote submit failed.' }
    }
    throw new Error('We could not save your request yet. Please try again or show this screen to the Arch9 team.')
  }

  const confirmationEmail = await sendLaunchConfirmationEmail(payload)
  const internalNotificationEmail = await sendLaunchInternalNotificationEmail(payload)

  return {
    lead: {
      full_name: payload.full_name,
      status: payload.status,
      created_at: new Date().toISOString(),
    },
    source: 'remote',
    confirmationEmail,
    internalNotificationEmail,
  }
}

export async function recordLaunchReferralClick({ action, shareLink, eventName } = {}) {
  const normalizedAction = normalizeText(action)
  const normalizedShareLink = normalizeText(shareLink)

  if (!normalizedAction || !normalizedShareLink) {
    return { tracked: false, skipped: true, reason: 'missing_required_fields' }
  }

  if (shouldUseLocalLaunchCapture() || !isSupabaseConfigured || !supabase) {
    return { tracked: false, skipped: true, source: 'local' }
  }

  const context = readReferralClickContext()
  const payload = {
    event_slug: 'arch9-launch-2026-06-24',
    event_name: 'Arch9 Launch',
    action: normalizedAction,
    source: 'launch_concierge_success',
    share_link: normalizedShareLink,
    page_url: context.pageUrl || null,
    referrer: context.referrer || null,
    user_agent: context.userAgent || null,
    metadata: {
      eventName: normalizeText(eventName),
      device: context,
    },
  }

  const { error } = await supabase
    .from(REFERRAL_CLICKS_TABLE)
    .insert(payload)

  if (error) {
    console.warn('[launchEventLeadService] referral click tracking failed', error)
    return { tracked: false, error: error?.message || 'Referral click tracking failed.' }
  }

  return { tracked: true }
}
