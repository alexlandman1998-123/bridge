const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max)
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const purposeIntent = { valuation: 'sell', seller: 'sell', buyer: 'buy' }
export const CAMPAIGN_EMAIL_CONSENT_VERSION = 'campaign-email-marketing-v1'
export const CAMPAIGN_EMAIL_CONSENT_COPY = 'I would also like to receive future property marketing emails from this agency. I can unsubscribe at any time.'

function unavailable() { return Object.assign(new Error('This campaign response link is unavailable. Ask the agent for a current link.'), { status: 404, code: 'campaign_response_unavailable' }) }

export function campaignResponseToken(payload = {}, params = null) {
  const value = text(params?.get('campaignResponse') || payload.campaignResponseToken || object(payload.context).campaignResponseToken, 200)
  if (value && !UUID.test(value)) throw unavailable()
  return value
}

export async function resolveCampaignPublicResponse(client, token, intakeLink) {
  if (!UUID.test(token || '')) throw unavailable()
  const response = await client.from('marketing_campaign_response_links').select('id,organisation_id,campaign_id,campaign_revision,intake_link_id,purpose,assigned_user_id,disabled_at')
    .eq('token', token).eq('intake_link_id', intakeLink.id).eq('organisation_id', intakeLink.organisation_id).is('disabled_at', null).maybeSingle()
  if (response.error) throw Object.assign(new Error('Campaign response storage is unavailable. Please try again later.'), { status: 503, code: 'campaign_response_unavailable' })
  const link = response.data
  if (!link || link.organisation_id !== intakeLink.organisation_id || link.intake_link_id !== intakeLink.id || link.disabled_at) throw unavailable()
  const [campaign, member] = await Promise.all([
    client.from('marketing_campaigns').select('id').eq('id', link.campaign_id).eq('organisation_id', link.organisation_id).maybeSingle(),
    client.from('organisation_users').select('user_id').eq('organisation_id', link.organisation_id).eq('user_id', link.assigned_user_id).in('status', ['active', 'accepted']).limit(1).maybeSingle(),
  ])
  if (campaign.error || member.error) throw Object.assign(new Error('The campaign response route could not be checked. Please try again.'), { status: 503, code: 'campaign_response_unavailable' })
  if (!campaign.data || !member.data) throw unavailable()
  const intent = purposeIntent[link.purpose] || ''
  if (intent && !intakeLink.enabled_intents?.includes(intent)) throw unavailable()
  return { link, public: { purpose: link.purpose, intent, marketingConsentCopy: CAMPAIGN_EMAIL_CONSENT_COPY, marketingConsentVersion: CAMPAIGN_EMAIL_CONSENT_VERSION, marketingConsentOptional: true, notice: 'Your enquiry creates a request for the agency to contact you. Future marketing permission is a separate, optional choice.' } }
}

export function campaignResponseData(normalized = {}, payload = {}, privacyVersion = '') {
  const requirement = object(normalized.requirement), seller = object(normalized.seller)
  const marketing = payload.emailMarketingConsent === true
  if (marketing && payload.marketingConsentVersion !== CAMPAIGN_EMAIL_CONSENT_VERSION) throw Object.assign(new Error('Review the separate optional marketing consent before submitting.'), { status: 422, code: 'marketing_consent_invalid' })
  if (marketing && !normalized.contactEmail) throw Object.assign(new Error('Add an email address for optional future marketing emails, or leave that choice unchecked.'), { status: 422, code: 'marketing_consent_invalid' })
  return {
    intent: normalized.intent,
    idempotencyKey: normalized.idempotencyKey,
    contactName: text(normalized.contactName, 240),
    contactEmail: text(normalized.contactEmail, 254).toLowerCase(),
    contactPhone: text(normalized.contactPhone, 40),
    privacyConsent: normalized.privacyConsent === true,
    privacyVersion: text(privacyVersion, 80),
    emailMarketingConsent: marketing,
    marketingConsentVersion: marketing ? CAMPAIGN_EMAIL_CONSENT_VERSION : null,
    budgetMin: normalized.budgetMin ?? null,
    budgetMax: normalized.budgetMax ?? null,
    area: text(normalized.intent === 'sell' ? seller.suburb : requirement.areas, 500),
    propertyType: text(normalized.intent === 'sell' ? seller.propertyType : requirement.propertyType, 120),
    propertyAddress: text(normalized.intent === 'sell' ? seller.propertyAddress : '', 1000),
    estimatedValue: typeof seller.estimatedValue === 'number' && Number.isFinite(seller.estimatedValue) && seller.estimatedValue >= 0 ? seller.estimatedValue : null,
    message: text(payload.message, 2000),
  }
}

export async function acceptCampaignPublicResponse(client, { token, link, normalized, payload, ipHash = '' }) {
  await resolveCampaignPublicResponse(client, token, link)
  const privacyVersion = link.privacy_policy_version || 'agency-public-intake-v1'
  if (normalized.privacyPolicyVersion !== privacyVersion) throw Object.assign(new Error('The privacy information changed. Reload this form and review the current consent before submitting.'), { status: 422, code: 'privacy_consent_changed' })
  const data = campaignResponseData(normalized, payload, privacyVersion)
  const response = await client.rpc('marketing_campaign_accept_response', { p_token: token, p_slug: link.slug, p_data: data, p_ip_hash: ipHash || null })
  if (response.error) {
    const code = response.error.code
    if (/^Too many intake submissions/.test(response.error.message || '')) throw Object.assign(new Error('Too many intake submissions. Please try again later.'), { status: 429, code: 'agency_public_intake_rate_limited' })
    if (code === '23505') throw Object.assign(new Error('Your earlier enquiry was already saved. Start a new enquiry to send different details.'), { status: 409, code: 'campaign_response_changed' })
    if (code === '42501') throw unavailable()
    throw Object.assign(new Error('Your campaign enquiry could not be confirmed. Your details are still here; retry the same submission.'), { status: 503, code: 'campaign_response_unavailable' })
  }
  if (response.data?.accepted !== true || response.data?.followUpPrepared !== true) throw Object.assign(new Error('The campaign enquiry could not be confirmed. Retry the same submission.'), { status: 503, code: 'campaign_response_unavailable' })
  return { accepted: true, duplicate: response.data.duplicate === true, lead: { followUpPrepared: true }, marketingConsentRecorded: response.data.marketingConsentRecorded === true }
}
