import { homeSeekersRecruitmentOrganisationId } from './recruitment/recruitmentDocumentsModel.js'

// Public advertising identifier supplied for homeseeker.co.za on 17 October 2026.
export const HOME_SEEKERS_META_PIXEL_ID = '2613784669083210'
export const HOME_SEEKERS_MEASUREMENT_CONSENT_EVENT = 'home-seekers-measurement-consent'
const consentKey = 'home-seekers-marketing-consent-v1'
const eventsKey = 'home-seekers-meta-events-v1'
const states = new WeakMap()

export function homeSeekersPixelSurface(browser = globalThis.window) {
  if (!browser?.location) return false
  try {
    const { hostname, pathname, search } = browser.location
    if (browser.self !== browser.top) return false
    if (new URLSearchParams(search).has('arch9_preview')) {
      try { browser.sessionStorage.setItem('home-seekers-internal-preview', '1') } catch { /* The query check still excludes this visit. */ }
      return false
    }
    try { if (browser.sessionStorage.getItem('home-seekers-internal-preview') === '1') return false }
    catch { /* The explicit hostname, query and frame checks still apply. */ }
    if (['homeseeker.co.za', 'www.homeseeker.co.za'].includes(hostname)) return !pathname.startsWith('/demo/')
    return hostname === 'app.arch9.co.za' && pathname === '/applicant/my-profile'
  } catch { return false }
}

function state() {
  const browser = globalThis.window
  if (!browser) return null
  if (!states.has(browser)) {
    let choice = null, fired = []
    try {
      const saved = browser.localStorage.getItem(consentKey)
      if (['granted', 'denied'].includes(saved)) choice = saved
      const retained = JSON.parse(browser.localStorage.getItem(eventsKey) || '[]')
      if (Array.isArray(retained)) fired = retained.filter(item => typeof item === 'string')
    } catch { /* Tracking choices and deduplication still work in memory. */ }
    states.set(browser, { choice, fired: new Set(fired), initialized: false, lastPage: null })
  }
  return states.get(browser)
}

export function homeSeekersMeasurementConsent() { return state()?.choice ?? null }

export function setHomeSeekersMeasurementConsent(allowed) {
  const current = state()
  if (!current) return
  current.choice = allowed ? 'granted' : 'denied'
  try { window.localStorage.setItem(consentKey, current.choice) } catch { /* Keep the in-memory choice. */ }
  try { if (current.initialized) window.fbq?.('consent', allowed ? 'grant' : 'revoke') }
  catch { /* A blocked advertising library must not prevent the choice changing. */ }
  try {
    window.dispatchEvent(new window.CustomEvent(HOME_SEEKERS_MEASUREMENT_CONSENT_EVENT))
  } catch { /* Measurement must never interrupt the website. */ }
}

export function pauseHomeSeekersPixel() {
  try { if (state()?.initialized) window.fbq?.('consent', 'revoke') }
  catch { /* Leaving the applicant portal must never depend on advertising. */ }
}

function initialize() {
  const current = state()
  if (!current || current.choice !== 'granted' || !homeSeekersPixelSurface()) return false
  if (current.initialized) return true
  if (!window.fbq) {
    const queue = function (...args) { queue.callMethod ? queue.callMethod(...args) : queue.queue.push(args) }
    queue.queue = []; queue.push = queue; queue.loaded = true; queue.version = '2.0'
    window.fbq = queue
    window._fbq = queue
  }
  // Only the explicit events below are allowed; never scrape application fields
  // or automatically track navigation into other agencies' private workspaces.
  window.fbq.disablePushState = true
  window.fbq('consent', 'grant')
  window.fbq('set', 'autoConfig', false, HOME_SEEKERS_META_PIXEL_ID)
  window.fbq('init', HOME_SEEKERS_META_PIXEL_ID)
  current.initialized = true
  if (!document.getElementById('hs-recruitment-meta')) {
    const script = document.createElement('script')
    script.id = 'hs-recruitment-meta'; script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.append(script)
  }
  return true
}

function track(event, parameters = {}) {
  try {
    if (!initialize()) return false
    window.fbq('consent', 'grant')
    window.fbq('trackSingle', HOME_SEEKERS_META_PIXEL_ID, event, parameters)
    return true
  } catch { return false }
}

export function trackHomeSeekersPage(pageKey) {
  const current = state()
  if (!current || current.lastPage === pageKey || !track('PageView')) return
  current.lastPage = pageKey
  if (window.location.pathname.replace(/\/$/, '') === '/join') track('ViewContent', { content_name: 'Agent Join Page' })
}

export function trackHomeSeekersRecruitmentSuccess(action, result, { endpoint, submissionKey } = {}) {
  if (!['/api/home-seekers/recruitment', '/api/recruitment/applicant-profile'].includes(endpoint) || result?.preview || result?.applicant?.submissionPreview) return
  const applicant = result?.applicant
  // Confirmed upload responses already include tenant-scoped document paths.
  // Their owner UUID is stable across files and avoids exposing any new API data.
  const documentOwner = applicant?.documents?.map(file => String(file.path || '').split('/'))
    .find(parts => parts[0] === homeSeekersRecruitmentOrganisationId)?.[1]
  const milestone = action === 'signup' && result?.accepted === true ? ['Lead', 'Agent Application', submissionKey]
    : action === 'verify_email' && applicant?.emailVerification === 'verified' ? ['CompleteRegistration', 'Agent Email Verified', applicant.contactSubmissionKey]
    : action === 'commit_document' && result?.saved === true && applicant?.documentsComplete === true ? ['SubmitApplication', 'Agent Documents Uploaded', documentOwner]
    : null
  if (!milestone) return
  const [event, contentName, receipt] = milestone
  // The receipt is used locally for deduplication and is never sent to Meta.
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(receipt || '')) return
  const current = state(), key = `${event}:${receipt}`
  if (!current || current.fired.has(key) || !track(event, { content_name: contentName })) return
  current.fired.add(key)
  try { window.localStorage.setItem(eventsKey, JSON.stringify([...current.fired].slice(-200))) } catch { /* Retain in-memory deduplication. */ }
}
