import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { CAMPAIGN_MARKET_READY_STATUSES } from '../../../supabase/functions/_shared/emailCampaignSourceFreshness.js'
import { buildCampaignOpportunities } from './campaignOpportunityModel'

const LISTING_LIMIT = 200
const EVENT_LIMIT = 100
const listingFields = 'id,organisation_id,assigned_agent_id,title,suburb,city,asking_price,listing_category,listing_status,listing_visibility,is_active,created_at,updated_at'
const eventFields = 'id,organisation_id,title,subject_type,subject_id,status,starts_at,ends_at,image_url,metadata,updated_at'

async function confirmActor(organisationId, userId) {
  if (!organisationId || !userId || !isSupabaseConfigured || !supabase) throw new Error('Choose a connected agency workspace to see campaign opportunities.')
  const auth = await supabase.auth.getUser()
  if (auth.error || auth.data?.user?.id !== userId) throw new Error('Your account changed. Reopen Campaigns to refresh opportunities.')
}

// Read-only, bounded and subject to the existing source-table RLS. Suggested
// opportunities do not require Campaign Setup and never create a campaign.
export async function loadCampaignOpportunities(organisationId, userId, { campaigns = [], emailCampaigns = [], campaignsAvailable = true, emailCampaignsAvailable = true, now = Date.now(), timeZone = 'Africa/Johannesburg', limit = 6 } = {}) {
  await confirmActor(organisationId, userId)
  const nowMs = new Date(now).getTime()
  if (!Number.isFinite(nowMs)) throw new Error('The opportunity check needs a valid current time.')
  const permission = await supabase.rpc('email_campaign_can_send', { p_organisation_id: organisationId })
  if (permission.error) throw new Error('Listing access could not be checked. Refresh opportunities to try again.')
  let query = supabase.from('private_listings').select(listingFields).eq('organisation_id', organisationId)
    .in('listing_status', CAMPAIGN_MARKET_READY_STATUSES).eq('is_active', true)
    .order('updated_at', { ascending: false }).order('id', { ascending: true }).limit(LISTING_LIMIT)
  if (permission.data !== true) query = query.eq('assigned_agent_id', userId)
  const [listingResult, eventResult] = await Promise.allSettled([
    query,
    supabase.from('marketing_events').select(eventFields).eq('organisation_id', organisationId)
      .eq('event_type', 'show_day').eq('subject_type', 'listing').eq('metadata->>visibility', 'public')
      .in('status', ['planning', 'upcoming']).gte('starts_at', new Date(nowMs).toISOString())
      .lte('starts_at', new Date(nowMs + 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('starts_at', { ascending: true }).limit(EVENT_LIMIT),
  ])
  await confirmActor(organisationId, userId)
  const listings = listingResult.status === 'fulfilled' && !listingResult.value.error ? listingResult.value.data || [] : null
  const events = eventResult.status === 'fulfilled' && !eventResult.value.error ? eventResult.value.data || [] : null
  const warnings = []
  if (!listings) warnings.push('Listings are unavailable. Listing-based opportunities could not be checked.')
  if (!events) warnings.push('Show days are unavailable. Event opportunities could not be checked.')
  if (listings?.length === LISTING_LIMIT) warnings.push('Opportunities cover the 200 most recently updated available listings. Other listings may also need a campaign.')
  if (events?.length === EVENT_LIMIT) warnings.push('Opportunities cover the next 100 public show days within 14 days.')
  const model = buildCampaignOpportunities({
    organisationId, now: nowMs, timeZone, limit, campaigns, emailCampaigns, campaignsAvailable, emailCampaignsAvailable,
    listings: (listings || []).filter((row) => row.organisation_id === organisationId && row.is_active === true && (permission.data === true || row.assigned_agent_id === userId) && !['archived', 'deleted', 'withdrawn'].includes(row.listing_visibility)).map((row) => ({ id: row.id, organisationId: row.organisation_id, title: row.title, suburb: row.suburb, city: row.city, askingPrice: row.asking_price, listingCategory: row.listing_category, listingStatus: row.listing_status, isActive: row.is_active === true, createdAt: row.created_at, updatedAt: row.updated_at })),
    events: (events || []).map((row) => ({ id: row.id, organisationId: row.organisation_id, listingId: row.subject_type === 'listing' ? row.subject_id : null, status: row.status, visibility: row.metadata?.visibility, startsAt: row.starts_at, endsAt: row.ends_at, image: row.image_url, updatedAt: row.updated_at })),
  })
  return { ...model, warnings: [...warnings, ...model.warnings], checkedAt: new Date(nowMs).toISOString(), sourceStates: { listings: listings ? 'available' : 'unavailable', events: events ? 'available' : 'unavailable', campaigns: campaignsAvailable ? 'available' : 'unavailable', emailCampaigns: emailCampaignsAvailable ? 'available' : 'unavailable' } }
}
