const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content']
const text = (value, limit = 160) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, '').trim().slice(0, limit) : ''
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const camelKey = (key) => `utm${key[0].toUpperCase()}${key.slice(1)}`
const SESSION_TTL = 24 * 60 * 60 * 1000

export function normalizeUtmAttribution(value) {
  const input = object(value)
  return Object.fromEntries(UTM_KEYS.map((key) => [`utm_${key}`, text(input[`utm_${key}`]) || text(input[camelKey(key)])]).filter(([, value]) => value))
}

export function attributionHost(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.hostname.toLowerCase().slice(0, 253) : ''
  } catch { return '' }
}

export function normalizeAttributionTouch(value) {
  const input = object(value)
  const capturedAt = Date.parse(input.capturedAt)
  return {
    utm: normalizeUtmAttribution(input.utm),
    sourceChannel: text(input.sourceChannel, 80).toLowerCase(),
    campaignCode: text(input.campaignCode, 80),
    landingHost: attributionHost(`https://${text(input.landingHost, 253)}`),
    referrerHost: attributionHost(`https://${text(input.referrerHost, 253)}`),
    ...(Number.isFinite(capturedAt) ? { capturedAt: new Date(capturedAt).toISOString() } : {}),
  }
}

// Anonymous campaign evidence stays within this agency and browser session.
// It contains no email, identity ID, token, full URL or persistent visitor ID.
export function captureAgencyIntakeAttribution(params, agencySlug, { now = Date.now(), storage, pageUrl, referrer } = {}) {
  const utm = normalizeUtmAttribution(Object.fromEntries(UTM_KEYS.map((key) => [`utm_${key}`, params.get(`utm_${key}`)])))
  const explicitSource = text(params.get('source') || params.get('channel'), 80).toLowerCase()
  const explicitCampaign = text(params.get('campaign') || params.get('campaign_code'), 80)
  const current = normalizeAttributionTouch({ utm, sourceChannel: explicitSource || utm.utm_source || 'website', campaignCode: explicitCampaign || utm.utm_campaign || '', capturedAt: new Date(now).toISOString(), landingHost: attributionHost(pageUrl), referrerHost: attributionHost(referrer) })
  const tagged = Boolean(Object.keys(utm).length || explicitSource || explicitCampaign)
  const slug = text(agencySlug, 160).toLowerCase()
  const key = `arch9:agency-intake-attribution:v1:${slug}`
  let saved
  if (slug && storage) {
    try { saved = JSON.parse(storage.getItem(key) || 'null') } catch { /* Optional storage cannot block an enquiry. */ }
  }
  const firstTime = Date.parse(saved?.firstTouch?.capturedAt)
  const lastTime = Date.parse(saved?.lastTouch?.capturedAt)
  const valid = saved?.version === 1 && Number.isFinite(firstTime) && Number.isFinite(lastTime) && firstTime <= lastTime && now - firstTime <= SESSION_TTL && firstTime <= now && lastTime <= now
  const firstTouch = valid ? normalizeAttributionTouch(saved.firstTouch) : current
  const previous = valid ? normalizeAttributionTouch(saved.lastTouch) : current
  const evidence = touch => JSON.stringify({ ...touch, capturedAt: undefined })
  const lastTouch = !valid || (tagged && evidence(current) !== evidence(previous)) ? current : previous
  if (slug && storage) {
    try { storage.setItem(key, JSON.stringify({ version: 1, firstTouch, lastTouch })) } catch { /* Private browsing/quota failures fall back to the current link. */ }
  }
  return { firstTouch, lastTouch }
}
