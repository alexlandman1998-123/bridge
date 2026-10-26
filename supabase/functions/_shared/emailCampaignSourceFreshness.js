// Shared by authenticated review and the service-role delivery worker. The model
// never supplies these facts: they are copied from the authorised listing row.
// mandate_signed is explicitly live/active_market in the listing lifecycle;
// in_progress and listing_active are its supported legacy active aliases.
export const CAMPAIGN_MARKET_READY_STATUSES = Object.freeze(['active', 'listing_active', 'in_progress', 'mandate_signed', 'live', 'published'])
export const CAMPAIGN_ACTIVE_EVENT_STATUSES = Object.freeze(['planning', 'upcoming'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const status = (value) => String(value || '').trim().toLowerCase()
const result = (ready, code, reason = '', retryable = false) => ({ ready, code, reason, retryable })
const review = (code, reason) => result(false, code, `${reason} Regenerate this email from the current listing and review it again before sending.`)
const unavailable = () => result(false, 'source_unavailable', 'The current listing could not be checked. Delivery is waiting for a successful source check. Remaining recipients stay queued.', true)
const eventUnavailable = () => result(false, 'event_unavailable', 'The current show day could not be checked. Delivery is waiting for a successful event check. Remaining recipients stay queued.', true)
const price = (value) => value === null ? null : (typeof value === 'number' || (typeof value === 'string' && value.trim())) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined

export function isCampaignListingMarketReady(listing) {
  return listing?.is_active === true && CAMPAIGN_MARKET_READY_STATUSES.includes(status(listing.listing_status))
}

export function isCampaignShowDayMarketReady(event, listingId, organisationId) {
  return Boolean(event && event.organisation_id === organisationId && event.event_type === 'show_day' &&
    event.subject_type === 'listing' && event.subject_id === listingId &&
    CAMPAIGN_ACTIVE_EVENT_STATUSES.includes(status(event.status)) && status(event.metadata?.visibility) === 'public')
}

function sourceMetadata(campaign, now) {
  const document = campaign?.content_json
  if (!document || !Object.hasOwn(document, 'ai_campaign')) return result(true, 'not_applicable')
  const source = document.ai_campaign
  const snapshot = source?.source_snapshot
  if (!source || !snapshot || snapshot.version !== 1 || !UUID.test(source.listing_id || '') ||
      !UUID.test(campaign.organisation_id || '') || snapshot.listing_id !== source.listing_id ||
      snapshot.organisation_id !== campaign.organisation_id || price(snapshot.asking_price) === undefined ||
      !isCampaignListingMarketReady(snapshot) || !['new_listing', 'price_reduction', 'show_day'].includes(source.objective)) {
    return review('source_review_required', 'This email does not have a complete, market-ready listing snapshot.')
  }
  if (source.objective === 'price_reduction' &&
      (price(source.previous_price) == null || price(snapshot.asking_price) == null || price(source.previous_price) <= price(snapshot.asking_price))) {
    return review('source_review_required', 'The previous and current price reduction amounts need confirmation.')
  }
  if (source.objective === 'show_day') {
    if (source.event?.id !== undefined && !UUID.test(source.event.id || '')) return review('event_review_required', 'The saved show-day reference needs confirmation.')
    const start = eventInstant(source.event?.start), end = eventInstant(source.event?.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return review('event_review_required', 'The show-day date and times need confirmation.')
    const current = new Date(now).getTime()
    if (!Number.isFinite(current)) return unavailable()
    if (start <= current) return review('event_started', 'The advertised show day has already started or passed.')
  }
  return null
}

function eventInstant(value) {
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/.exec(value || '')
  if (!parts) return NaN
  const [, year, month, day, hour, minute, second, offset] = parts
  const local = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second))
  if (local.getUTCFullYear() !== +year || local.getUTCMonth() !== +month - 1 || local.getUTCDate() !== +day || +hour > 23 || +minute > 59 || +second > 59) return NaN
  if (offset !== 'Z' && (+offset.slice(1, 3) > 23 || +offset.slice(4, 6) > 59)) return NaN
  return Date.parse(value)
}

export function inspectCampaignSourceFreshness(campaign, listing, now = new Date()) {
  const metadata = sourceMetadata(campaign, now)
  if (metadata) return metadata
  const source = campaign.content_json.ai_campaign
  const snapshot = source.source_snapshot
  if (!listing || listing.id !== source.listing_id || listing.organisation_id !== campaign.organisation_id) {
    return review('source_missing', 'The original listing is no longer available in this agency.')
  }
  if (!isCampaignListingMarketReady(listing)) return review('source_inactive', 'The listing is no longer active and available for marketing.')
  if (price(listing.asking_price) === undefined) return unavailable()
  if (price(listing.asking_price) !== price(snapshot.asking_price)) return review('source_price_changed', 'The listing asking price changed after this email was prepared.')
  // Unrelated listing edits do not silently invalidate or rewrite approved copy.
  return result(true, 'source_current')
}

export function inspectCampaignEventFreshness(campaign, event, now = new Date()) {
  const metadata = sourceMetadata(campaign, now)
  if (metadata) return metadata
  const source = campaign.content_json.ai_campaign
  if (source.objective !== 'show_day' || !source.event?.id) return result(true, 'event_not_linked')
  if (!event || event.id !== source.event.id || event.organisation_id !== campaign.organisation_id ||
      event.event_type !== 'show_day' || event.subject_type !== 'listing' || event.subject_id !== source.listing_id) {
    return review('event_missing', 'The original show day is no longer available for this listing in this agency.')
  }
  if (!isCampaignShowDayMarketReady(event, source.listing_id, campaign.organisation_id)) {
    return review('event_inactive', 'The show day is no longer public and open for this campaign.')
  }
  const start = eventInstant(event.starts_at), end = eventInstant(event.ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return review('event_review_required', 'The saved show-day times need confirmation.')
  if (start <= new Date(now).getTime()) return review('event_started', 'The advertised show day has already started or passed.')
  if (start !== eventInstant(source.event.start) || end !== eventInstant(source.event.end)) return review('event_rescheduled', 'The show-day date or times changed after this email was prepared.')
  return result(true, 'event_current')
}

export async function checkCampaignSourceFreshness({ db, campaign, now = new Date() }) {
  const metadata = sourceMetadata(campaign, now)
  if (metadata) return metadata
  try {
    const { data: listing, error } = await db.from('private_listings')
      .select('id,organisation_id,asking_price,listing_status,is_active')
      .eq('organisation_id', campaign.organisation_id)
      .eq('id', campaign.content_json.ai_campaign.listing_id).maybeSingle()
    if (error) return unavailable()
    const source = inspectCampaignSourceFreshness(campaign, listing, now)
    if (!source.ready) return source
    const eventId = campaign.content_json.ai_campaign.event?.id
    if (!eventId || campaign.content_json.ai_campaign.objective !== 'show_day') return source
    try {
      const { data: event, error: eventError } = await db.from('marketing_events')
        .select('id,organisation_id,event_type,subject_type,subject_id,status,metadata,starts_at,ends_at')
        .eq('organisation_id', campaign.organisation_id).eq('id', eventId).maybeSingle()
      if (eventError) return eventUnavailable()
      const freshness = inspectCampaignEventFreshness(campaign, event, now)
      return freshness.ready ? source : freshness
    } catch { return eventUnavailable() }
  } catch { return unavailable() }
}
