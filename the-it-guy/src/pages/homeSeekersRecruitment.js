export const recruitmentPricing = Object.freeze({ monthlyFee: 7500, transactionFee: 1000, averageSalePrice: 1350000, commissionRate: 0.06, traditionalSplit: 0.3, balloonMonthlyFee: 8500, balloonSplit: 0.1, referralMonthlyCredit: 500 })
export function recruitmentExample(sales = 12) {
  const p = recruitmentPricing
  const commission = sales * p.averageSalePrice * p.commissionRate
  const cost = 12 * p.monthlyFee + sales * p.transactionFee
  const traditionalCost = commission * p.traditionalSplit
  const balloonCost = p.balloonMonthlyFee * 12 + commission * p.balloonSplit
  return { commission, cost, traditionalCost, balloonCost, youKeep: commission - cost, effectivePercent: commission ? cost / commission * 100 : null, breakEvenSales: 12 * p.monthlyFee / (p.averageSalePrice * p.commissionRate * p.traditionalSplit - p.transactionFee) }
}

export async function submitRecruitmentApplication(details, { fetcher = fetch, pageUrl = window.location.href, timeoutMs = 20000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher('/api/home-seekers/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ ...details, pageUrl }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.accepted !== true) throw new Error(result.error || 'Your application could not be recorded. Please try again.')
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The connection took too long. Your answers are still here. Please try again.')
    throw error
  } finally { clearTimeout(timeout) }
}

// IDs are configuration, never inferred from another brand's analytics account.
export const campaignMeasurementConfigured = Boolean(import.meta.env?.VITE_HOME_SEEKERS_GOOGLE_ANALYTICS_ID || import.meta.env?.VITE_HOME_SEEKERS_META_PIXEL_ID)
export function enableRecruitmentMeasurement() {
  const gaId = import.meta.env?.VITE_HOME_SEEKERS_GOOGLE_ANALYTICS_ID
  const pixelId = import.meta.env?.VITE_HOME_SEEKERS_META_PIXEL_ID
  if (/^G-[A-Z0-9]+$/.test(gaId || '') && !document.getElementById('hs-recruitment-ga')) {
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    window.gtag('config', gaId, { send_page_view: false })
    const script = document.createElement('script'); script.id = 'hs-recruitment-ga'; script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`; document.head.append(script)
  }
  if (/^\d+$/.test(pixelId || '') && !document.getElementById('hs-recruitment-meta')) {
    const queue = function (...args) { queue.callMethod ? queue.callMethod(...args) : queue.queue.push(args) }
    queue.queue = []; queue.loaded = true; queue.version = '2.0'; window.fbq = window.fbq || queue
    window.fbq('init', pixelId)
    const script = document.createElement('script'); script.id = 'hs-recruitment-meta'; script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.append(script)
  }
  window.gtag?.('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' })
  window.fbq?.('consent', 'grant')
}
export function disableRecruitmentMeasurement() {
  window.gtag?.('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  window.fbq?.('consent', 'revoke')
}
export function trackRecruitmentConversion(eventType, { measurementAllowed = false, duplicate = false, gaId = import.meta.env?.VITE_HOME_SEEKERS_GOOGLE_ANALYTICS_ID, pixelId = import.meta.env?.VITE_HOME_SEEKERS_META_PIXEL_ID } = {}) {
  if (duplicate || !measurementAllowed) return
  try {
    if (/^G-[A-Z0-9]+$/.test(gaId || '')) window.gtag?.('event', eventType, { send_to: gaId, page_path: '/demo/homeseekers/join' })
    if (/^\d+$/.test(pixelId || '')) window.fbq?.('trackSingleCustom', pixelId, eventType, { page_path: '/demo/homeseekers/join' })
  } catch { /* Measurement must never change the application result or navigation. */ }
}
