export function developmentCampaignPublicUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !['localhost','127.0.0.1','[::1]'].includes(url.hostname) && !/\/object\/sign\//i.test(url.pathname) && ![...url.searchParams.keys()].some(key => /token|signature|credential|expires/i.test(key)) ? url.href : ''
  } catch { return '' }
}
export function developmentCampaignWebsite(content = {}) {
  const config = content.listingConfiguration || content.listing_configuration || {}
  if (![true,'true'].includes(config.publicVisibility ?? config.public_visibility) || (config.marketingStatus || config.marketing_status) !== 'live') return ''
  return developmentCampaignPublicUrl(content.externalLinks?.developmentLandingPageUrl || content.external_links?.development_landing_page_url) ||
    ((config.listingSlug || config.listing_slug) ? `https://app.arch9.co.za/development/${encodeURIComponent(config.listingSlug || config.listing_slug)}` : '')
}
const notApplicable = { ready: true, state: 'not_applicable', code: 'not_applicable', reason: '', retryable: false }
const blocked = reason => ({ ready: false, state: 'development_review_required', code: 'development_review_required', reason, retryable: false })
const unavailable = () => ({ ready: false, state: 'development_source_unavailable', code: 'development_source_unavailable', reason: 'The development source could not be checked. Delivery will retry; remaining recipients stay queued.', retryable: true })
export async function checkDevelopmentCampaignSource({ db, campaign, now = new Date() }) {
  const context = campaign?.content_json?.arch9_context || campaign?.parameter_values?.__arch9_context
  if (context?.source !== 'development_workspace') return notApplicable
  if (context.version !== 1 || context.organisation_id !== campaign.organisation_id || !context.development_id) return blocked('Refresh this campaign from its development workspace before sending.')
  try {
    const development = await db.from('developments').select('id,organisation_id,status').eq('organisation_id', campaign.organisation_id).eq('id', context.development_id).maybeSingle()
    if (development.error) return unavailable()
    if (!development.data || development.data.status === 'archived') return blocked('The campaign development is unavailable. Review the source before sending.')
    if (context.website_url) {
      const profile = await db.from('development_profiles').select('marketing_content').eq('development_id', context.development_id).maybeSingle()
      if (profile.error) return unavailable()
      if (developmentCampaignWebsite(profile.data?.marketing_content) !== context.website_url) return blocked('The development website is no longer published. Prepare a fresh campaign before sending.')
    }
    if (context.event_id) {
      const result = await db.from('marketing_events').select('id,title,status,starts_at,location,address,description,subject_type,subject_id,organisation_id')
        .eq('organisation_id', campaign.organisation_id).eq('id', context.event_id).eq('subject_type', 'development').eq('subject_id', context.development_id).maybeSingle()
      const event = result.data, snapshot = context.event_snapshot
      if (result.error) return unavailable()
      if (!event || !['planning','upcoming'].includes(event.status) || !Number.isFinite(Date.parse(event.starts_at)) || Date.parse(event.starts_at) <= new Date(now).getTime()) return blocked('The development event is cancelled, unavailable or has started. Prepare a fresh invitation before sending.')
      if (!snapshot || event.title !== snapshot.title || Date.parse(event.starts_at) !== Date.parse(snapshot.starts_at) || (event.location || event.address || '') !== snapshot.location || (event.description || '') !== (snapshot.description || '')) return blocked('The development event details changed. Prepare a fresh invitation before sending.')
    }
    return { ready: true, state: 'development_current', code: 'development_current', reason: '', retryable: false }
  } catch { return unavailable() }
}
