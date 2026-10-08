// Agent overview supplied on 8 October 2026. All fees and examples exclude VAT.
export const recruitmentPricing = Object.freeze({ monthlyFee: 9000, dealFundedMonthlyFee: 10000, upfrontAnnualFee: 100000, transactionFee: 1500, averageSalePrice: 1500000, commissionRate: 0.05, traditionalSplit: 0.3, balloonMonthlyFee: 8500, balloonSplit: 0.1, balloonCommissionRate: 0.06, capMonthlyFee: 950, capSplit: 0.29, annualCap: 150000, capRoyalty: 0.04, referralMonthlyCredit: 750, referralLimit: 12 })
export const recruitmentPaymentOptions = Object.freeze([
  Object.freeze({ id: 'deals', title: 'Paid from your deals', amount: recruitmentPricing.dealFundedMonthlyFee, period: '/ month', annualFee: 12 * recruitmentPricing.dealFundedMonthlyFee, copy: 'Your monthly fee builds up as a balance and is deducted when your deals register. A maximum of 50% of any one deal goes towards that balance, so you retain at least half of each cheque.', note: 'Solo agents only.' }),
  Object.freeze({ id: 'monthly', title: 'Monthly debit order', amount: recruitmentPricing.monthlyFee, period: '/ month', annualFee: 12 * recruitmentPricing.monthlyFee, copy: 'Pay by debit order on the first of each month. Your subscription is settled separately from your deals, with no brokerage commission split.', note: 'The standard option. Available to solo agents and teams.' }),
  Object.freeze({ id: 'upfront', title: 'Annual upfront payment', amount: recruitmentPricing.upfrontAnnualFee, period: '/ year', annualFee: recruitmentPricing.upfrontAnnualFee, copy: 'Pay once and your seat is settled until the same date next year. Save R8,000 compared with the monthly debit order subscription.', note: 'Available to solo agents and teams.' }),
])
export function recruitmentExample(sales = 10, optionId = 'monthly') {
  const p = recruitmentPricing
  const option = recruitmentPaymentOptions.find((item) => item.id === optionId)
  if (!option) throw new RangeError('Unknown recruitment payment option')
  const commission = sales * p.averageSalePrice * p.commissionRate
  const cost = option.annualFee + sales * p.transactionFee
  const traditionalCost = commission * p.traditionalSplit
  const balloonCost = p.balloonMonthlyFee * 12 + sales * p.averageSalePrice * p.balloonCommissionRate * p.balloonSplit
  const capCost = p.capMonthlyFee * 12 + Math.min(commission * p.capSplit, p.annualCap) + commission * p.capRoyalty
  return { commission, cost, traditionalCost, balloonCost, capCost, youKeep: commission - cost, effectivePercent: commission ? cost / commission * 100 : null, breakEvenSales: option.annualFee / (p.averageSalePrice * p.commissionRate * p.traditionalSplit - p.transactionFee) }
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
