import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { cleanListingBuilder } from './justListedCampaignModel'
import { propertyItems } from './listingCampaignContract'
import { loadJustListedSource } from './justListedCampaignService'
import { buildCampaignReadiness } from './campaignReadinessModel'

const eventFields = 'id,organisation_id,subject_type,subject_id,status,starts_at,ends_at,metadata,updated_at'
const errorText = (error) => error?.message || 'The selected campaign source could not be refreshed. Try again.'

async function confirmActor(organisationId, userId) {
  if (!organisationId || !userId || !isSupabaseConfigured || !supabase) throw new Error('Choose a connected agency workspace to review campaign sources.')
  const auth = await supabase.auth.getUser()
  if (auth.error || auth.data?.user?.id !== userId) throw new Error('Your account changed. Reopen the campaign to review its sources.')
}

function publicEvent(row, builder) {
  if (!row || row.subject_type !== 'listing' || row.subject_id !== builder.listingId || row.metadata?.visibility !== 'public' || !['planning', 'upcoming'].includes(row.status) || !Number.isFinite(Date.parse(row.starts_at)) || !Number.isFinite(Date.parse(row.ends_at))) return null
  // The current property recipe contract stores show-day dates/times in SAST.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.starts_at))
  const time = (value) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  return { id: row.id, listingId: row.subject_id, date, startTime: time(row.starts_at), endTime: time(row.ends_at), updatedAt: row.updated_at }
}

// A selected-campaign refresh only: one saved record, at most six authorised
// listing sources loaded serially, and one exact public event when required.
// This does not create drafts, approve delivery, contact anyone or send anything.
export async function loadCampaignReadiness(organisationId, userId, expected, { channel = 'email', now, timeZone = 'Africa/Johannesburg' } = {}) {
  await confirmActor(organisationId, userId)
  if (!expected?.id || !Number.isInteger(expected.revision)) throw new Error('Open a saved campaign revision before reviewing its sources.')
  // Optional recipe/playbook fields may not exist in an older workspace yet;
  // match the established campaign reader rather than requiring every column.
  const saved = await supabase.from('marketing_campaigns').select('*').eq('organisation_id', organisationId).eq('id', expected.id).maybeSingle()
  if (saved.error) throw new Error('The saved campaign could not be loaded. Refresh and try the source check again.')
  const campaign = saved.data
  if (!campaign || campaign.organisation_id !== organisationId || campaign.id !== expected.id) throw new Error('This campaign is no longer available in your current workspace.')
  if (campaign.revision !== expected.revision) throw new Error('This campaign changed. Reload the latest revision before reviewing its sources.')
  const clock = () => new Date(now ?? Date.now()).toISOString()
  const currents = []
  let sourceState = 'unchecked', sourceError = '', checkedAt = null
  let event = null, eventState = 'unchecked', eventError = '', eventCheckedAt = null
  if (campaign.listing_builder) {
    let builder
    try { builder = cleanListingBuilder(campaign.listing_builder) } catch (error) { sourceState = 'unavailable'; sourceError = errorText(error) }
    if (builder) {
      const items = propertyItems(builder)
      // These ids come from the freshly read saved campaign. Each source loader
      // independently verifies the listing's agency, current assignment and RLS.
      const choices = { listings: items.map((item) => ({ id: item.listingId })) }
      sourceState = 'available'
      for (const item of items) {
        try {
          currents.push(await loadJustListedSource(organisationId, userId, item.listingId, choices, builder.template))
        } catch (error) {
          sourceState = 'unavailable'
          sourceError = errorText(error)
          break
        }
      }
      checkedAt = sourceState === 'available' ? clock() : null
      if (builder.template === 'show-day' && builder.settings?.eventId) {
        try {
          const result = await supabase.from('marketing_events').select(eventFields)
            .eq('organisation_id', organisationId).eq('id', builder.settings.eventId)
            .eq('event_type', 'show_day').eq('subject_type', 'listing').eq('subject_id', builder.listingId)
            .eq('metadata->>visibility', 'public').in('status', ['planning', 'upcoming']).maybeSingle()
          if (result.error) throw new Error('The saved public show day could not be refreshed. Try the source check again.')
          event = result.data?.organisation_id === organisationId ? publicEvent(result.data, builder) : null
          eventState = 'available'
          eventCheckedAt = clock()
        } catch (error) { eventState = 'unavailable'; eventError = errorText(error) }
      }
    }
  }
  await confirmActor(organisationId, userId)
  // Do not attach a successful source review to a revision edited mid-refresh.
  const latest = await supabase.from('marketing_campaigns').select('revision').eq('organisation_id', organisationId).eq('id', campaign.id).maybeSingle()
  if (latest.error || latest.data?.revision !== campaign.revision) throw new Error('The campaign changed while its sources were checked. Reload it and review the latest revision.')
  return { ...buildCampaignReadiness(campaign, { currents, sourceState, checkedAt, event, eventState, now: now ?? Date.now(), channel, timeZone }), sourceState, eventState, sourceError, eventError, eventCheckedAt, checkedAt: clock() }
}
