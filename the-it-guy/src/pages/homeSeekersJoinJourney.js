import { homeSeekersMeasurementConsent, HOME_SEEKERS_META_PIXEL_ID } from './homeSeekersPixel'
import { calculateSplitCosts } from './homeSeekersSplitCalculatorModel'

export const joinEvents = ['book_call', 'book_session', 'apply_start', 'apply_complete', 'calculator_used', 'breakdown_emailed']
const fired = new Set()
// Receipts deduplicate actual outcomes. No answers or contact details go to ad platforms.
export function trackJoinEvent(event, section, receipt) {
  if (!joinEvents.includes(event) || homeSeekersMeasurementConsent() !== 'granted') return false
  const key = `${event}:${receipt}`
  if (!receipt || fired.has(key)) return false
  try {
    const parameters = { section, page_path: '/join' }
    const gaId = import.meta.env?.VITE_HOME_SEEKERS_GOOGLE_ANALYTICS_ID
    if (/^G-[A-Z0-9]+$/.test(gaId || '')) window.gtag?.('event', event, { ...parameters, send_to: gaId })
    window.fbq?.('trackSingleCustom', HOME_SEEKERS_META_PIXEL_ID, event, parameters)
    fired.add(key)
    return true
  } catch { return false }
}
export function joinCalculatorContext(inputs) {
  const result = calculateSplitCosts(inputs || {})
  return result ? { inputs: { ...inputs }, result } : null
}
export function salesBand(sales) { return Number(sales) < 5 ? 'under 5' : Number(sales) < 10 ? '5-9' : Number(sales) < 20 ? '10-19' : '20+' }
export async function submitJoinFollowUp(type, details, id, { fetcher = fetch } = {}) {
  const response = await fetcher('/api/home-seekers/join-follow-up', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ type, ...details, idempotencyKey: id, pageUrl: window.location.href }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.accepted) throw new Error(result.error || 'Your details could not be sent. Please try again.')
  return result
}
