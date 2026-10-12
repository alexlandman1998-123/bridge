export const SOURCE_CHANNELS = [
  ['all', 'All sources'], ['portal', 'Property portals'], ['social', 'Social'],
  ['search', 'Search'], ['email', 'Email'], ['referral', 'Referrals'],
  ['website', 'Website'], ['other', 'Other'], ['unknown', 'Unknown'],
]

const sourceNames = { property24: 'Property24', privateproperty: 'Private Property', private_property: 'Private Property', facebook: 'Facebook', instagram: 'Instagram', google: 'Google', bing: 'Bing', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', revo_newsletter: 'Revo newsletter' }
const normalize = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')

export function sourceName(touch) {
  const raw = touch?.utm_source || touch?.source_channel
  if (!raw) return 'Source not captured'
  return sourceNames[normalize(raw)] || String(raw).replace(/_/g, ' ')
}

export function sourceChannel(touch) {
  const source = normalize(touch.utm_source || touch.source_channel)
  const medium = normalize(touch.utm_medium)
  if (['email', 'newsletter'].includes(medium) || /newsletter/.test(source)) return 'email'
  if (['property24', 'privateproperty', 'private_property'].includes(source)) return 'portal'
  if (['social', 'paid_social', 'organic_social'].includes(medium) || ['facebook', 'instagram', 'linkedin', 'tiktok'].includes(source)) return 'social'
  if (['organic', 'organic_search', 'paid_search', 'cpc', 'ppc'].includes(medium) || ['google', 'bing'].includes(source)) return 'search'
  if (medium === 'referral' || source === 'referral') return 'referral'
  if (['website', 'web'].includes(source)) return 'website'
  return source || medium ? 'other' : 'unknown'
}

export function hasTrackingTags(touch) {
  return ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].some(key => Boolean(touch[key]))
}

export function sourceEvidence(touch) {
  return touch.evidence_kind === 'browser_session' ? 'Captured browser session' : touch.evidence_kind === 'enquiry_record' ? 'Enquiry record' : 'Recorded source'
}

export function sourceChannelCounts(touches) {
  const counts = new Map()
  for (const touch of touches) {
    const key = sourceChannel(touch)
    if (!counts.has(key)) counts.set(key, new Set())
    counts.get(key).add(touch.lead_id || touch.id)
  }
  return SOURCE_CHANNELS.filter(([key]) => counts.has(key)).map(([key, label]) => ({ key, label, count: counts.get(key).size }))
}

export function filterSourceTouches(touches, { channel = 'all', search = '', tracking = 'all', order = 'journey' } = {}) {
  const query = search.trim().toLowerCase()
  return touches.filter(touch => (channel === 'all' || sourceChannel(touch) === channel)
    && (tracking === 'all' || hasTrackingTags(touch) === (tracking === 'tagged'))
    && (!query || [sourceName(touch), touch.utm_source, touch.source_channel, touch.utm_medium, touch.utm_campaign, touch.campaign_code, touch.utm_content, touch.utm_term, touch.landing_host, touch.referrer_host].filter(Boolean).join(' ').toLowerCase().includes(query)))
    .sort((a, b) => (order === 'journey' ? 1 : -1) * (Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) || String(a.id).localeCompare(String(b.id)))
}
