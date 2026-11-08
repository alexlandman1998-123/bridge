export const WEBSITE_SESSION_MS = 30 * 60 * 1000
const KEY = 'arch9-website-measurement-v1'
const PREVIEW_KEY = 'arch9-website-internal-preview'
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export type Touch = { at: number; source?: string; medium?: string; campaign?: string; content?: string; term?: string; token?: string; referrer?: string }
export type Measurement = { version: 1; sessionId: string; lastActivity: number; visitRecorded: boolean; firstTouch: Touch; lastTouch: Touch }
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void }
type BrowserLike = { location: { href: string; search: string; pathname: string }; self?: unknown; top?: unknown; sessionStorage: StorageLike; doNotTrack?: string }
type NavigatorLike = { doNotTrack?: string | null; webdriver?: boolean }
const memory = new WeakMap<BrowserLike, Measurement>()
const internalPreviews = new WeakSet<BrowserLike>()
const text = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export function isAutomatedWebsiteTraffic(userAgent: string, purpose = '') {
  return /prefetch|preview/i.test(purpose) || /bot\b|crawler|spider|slurp|headless|phantomjs|selenium|playwright|puppeteer|barracuda|proofpoint|mimecast|safelinks|urlscan|linkchecker|security.?scan|curl\/|wget\//i.test(userAgent)
}
export function websiteTrackingAllowed(browser: BrowserLike, navigator: NavigatorLike) {
  const preview = new URLSearchParams(browser.location.search).has('arch9_preview')
  if (preview) internalPreviews.add(browser)
  try {
    if (preview) browser.sessionStorage.setItem(PREVIEW_KEY, '1')
    if (browser.sessionStorage.getItem(PREVIEW_KEY) === '1') internalPreviews.add(browser)
  } catch { /* Frame, automation and in-memory preview exclusions still apply. */ }
  return !internalPreviews.has(browser) && browser.self === browser.top && navigator.webdriver !== true && navigator.doNotTrack !== '1' && browser.doNotTrack !== '1' && !browser.location.pathname.startsWith('/demo/')
}
function currentTouch(href: string, now: number, referrer = ''): Touch | null {
  const url = new URL(href)
  const source = text(url.searchParams.get('utm_source')), medium = text(url.searchParams.get('utm_medium')), campaign = text(url.searchParams.get('utm_campaign'))
  const content = text(url.searchParams.get('utm_content')), term = text(url.searchParams.get('utm_term'))
  const token = text(url.searchParams.get('arch9_attribution'), 128)
  if (!source && !medium && !campaign && !content && !term && !token) return null
  let origin = ''
  try { origin = new URL(referrer).origin } catch { /* Direct visits have no referrer. */ }
  return { at: now, source: source || undefined, medium: medium || undefined, campaign: campaign || undefined, content: content || undefined, term: term || undefined,
    token: /^[a-zA-Z0-9_-]{20,128}$/.test(token) ? token : undefined, referrer: origin || undefined }
}
export function saveWebsiteMeasurement(browser: BrowserLike, measurement: Measurement) {
  memory.set(browser, measurement)
  try { browser.sessionStorage.setItem(KEY, JSON.stringify(measurement)) } catch { /* Storage denial must not break browsing/forms. */ }
}
export function readWebsiteMeasurement(browser: BrowserLike, navigator: NavigatorLike, now = Date.now(), referrer = ''): Measurement | null {
  if (!websiteTrackingAllowed(browser, navigator)) return null
  let previous: Measurement | null = memory.get(browser) || null
  try {
    const stored = JSON.parse(browser.sessionStorage.getItem(KEY) || 'null') as Measurement | null
    if (stored?.version === 1 && /^[a-zA-Z0-9_-]{12,100}$/.test(stored.sessionId) && Number.isFinite(stored.lastActivity) && stored.firstTouch && stored.lastTouch) previous = stored
  } catch { /* Fall back to this page's memory, without inventing persistent visitors. */ }
  const touch = currentTouch(browser.location.href, now, referrer)
  const validPrevious = previous && now >= previous.lastActivity && now - previous.firstTouch.at <= WINDOW_MS ? previous : null
  const newSession = !validPrevious || now - validPrevious.lastActivity >= WEBSITE_SESSION_MS
  const sameTouch = touch && validPrevious && ['source','medium','campaign','content','term','token'].every(key => touch[key as keyof Touch] === validPrevious.lastTouch[key as keyof Touch])
  const direct = { at: now, source: 'direct' }
  const measurement: Measurement = {
    version: 1, sessionId: newSession ? crypto.randomUUID() : validPrevious!.sessionId,
    lastActivity: now, visitRecorded: !newSession && validPrevious!.visitRecorded,
    firstTouch: validPrevious?.firstTouch || touch || direct,
    lastTouch: touch && !sameTouch ? touch : validPrevious?.lastTouch || touch || direct,
  }
  saveWebsiteMeasurement(browser, measurement)
  return measurement
}
export function browserWebsiteMeasurement() {
  if (typeof window === 'undefined') return null
  return readWebsiteMeasurement(window, navigator, Date.now(), document.referrer)
}
// Server-side allow-list. Tracking fields are evidence hints, never authorisation.
export function normaliseMeasurement(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const touch = (input: unknown) => {
    if (!input || typeof input !== 'object') return undefined
    const row = input as Record<string, unknown>
    return { at: typeof row.at === 'number' && Number.isFinite(row.at) ? row.at : undefined,
      source: text(row.source) || undefined, medium: text(row.medium) || undefined, campaign: text(row.campaign) || undefined,
      content: text(row.content) || undefined, term: text(row.term) || undefined,
      token: /^[a-zA-Z0-9_-]{20,128}$/.test(text(row.token,128)) ? text(row.token,128) : undefined }
  }
  const id = text(source.sessionId,100)
  return { sessionId: /^[a-zA-Z0-9_-]{12,100}$/.test(id) ? id : undefined, firstTouch: touch(source.firstTouch), lastTouch: touch(source.lastTouch) }
}
