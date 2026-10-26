import { isCampaignListingMarketReady } from '../../../supabase/functions/_shared/emailCampaignSourceFreshness.js'

const DAY = 24 * 60 * 60 * 1000
const EMAIL_OBJECTIVES = { 'new-listing': 'new_listing', 'price-reduced': 'price_reduction', 'show-day': 'show_day' }
const text = (value) => String(value ?? '').trim()
const timestamp = (value) => value ? Date.parse(value) : NaN
const active = (listing) => isCampaignListingMarketReady({ listing_status: listing.listingStatus, is_active: listing.isActive }) && listing.listingCategory !== 'rental'
const amount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  // Only compare the repository's explicit rand display values. A missing price,
  // POA or a figure in another currency is not evidence of a price reduction.
  if (!/^R\s*\d[\d\s,]*(?:\.\d{1,2})?$/.test(text(value))) return null
  const parsed = Number(text(value).replace(/^R\s*/, '').replace(/[\s,]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
const money = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)
const validUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '' } catch { return '' }
}

export function campaignSourceTime(value, timeZone = 'Africa/Johannesburg') {
  if (!Number.isFinite(timestamp(value))) return 'Update time not recorded'
  try {
    return new Intl.DateTimeFormat('en-ZA', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(new Date(value))
  } catch {
    return campaignSourceTime(value, 'Africa/Johannesburg')
  }
}

function evidenceId(values) {
  let hash = 2166136261
  for (const char of JSON.stringify(values)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}

export function campaignOpportunityHref(item, { ai = false } = {}) {
  const query = new URLSearchParams({ section: 'email', view: 'create', listingId: item.listingId, objective: EMAIL_OBJECTIVES[item.recipe] || 'new_listing' })
  if (ai) query.set('ai', '1')
  if (item.eventId) query.set('eventId', item.eventId)
  return `/marketing?${query}`
}

function campaignListings(campaign) {
  const builder = campaign.listing_builder
  return builder ? [builder, ...(builder.additionalListings || [])] : []
}

// Inputs must already be authorised. The service supplies only the public
// marketing projection, never the private seller/onboarding record.
export function buildCampaignOpportunities({ listings = [], events = [], campaigns = [], emailCampaigns = [], organisationId, now = Date.now(), timeZone = 'Africa/Johannesburg', campaignsAvailable = true, emailCampaignsAvailable = true, limit = 6 } = {}) {
  if (!text(organisationId)) return { items: [], warnings: ['Choose an agency workspace to check campaign opportunities.'] }
  const nowMs = new Date(now).getTime()
  if (!Number.isFinite(nowMs)) return { items: [], warnings: ['Opportunities could not be checked because the current time is unavailable.'] }
  const scoped = listings.filter((listing) => listing.id && listing.organisationId === organisationId && active(listing))
  const listingMap = new Map(scoped.map((listing) => [listing.id, listing]))
  const plans = campaigns.filter((campaign) => campaign.organisation_id === organisationId)
  const currentPlans = plans.filter((campaign) => campaign.status !== 'completed')
  // The scoped channel reader supplies explicit saved AI associations. A name,
  // matching subject line or free-form copy is never evidence of a listing link.
  const activeEmails = emailCampaigns.filter((campaign) => (!campaign.organisation_id || campaign.organisation_id === organisationId) && ['draft', 'scheduled', 'queued', 'sending', 'active'].includes(text(campaign.status).toLowerCase()))
  const items = []
  const warnings = campaignsAvailable ? [] : ['Existing campaigns are unavailable. Review your drafts before creating another campaign.']
  if (!emailCampaignsAvailable) warnings.push('Email drafts are unavailable. Review channel activity before creating another property email.')
  const hasPlan = (listingId, recipe, eventId = '') => currentPlans.some((campaign) => campaign.listing_builder?.template === recipe && campaignListings(campaign).some((item) => item.listingId === listingId) && (!eventId || campaign.listing_builder.settings?.eventId === eventId)) || activeEmails.some((campaign) => campaign.ai_listing_id === listingId && campaign.ai_objective === EMAIL_OBJECTIVES[recipe] && (!eventId || !campaign.ai_event_id || campaign.ai_event_id === eventId))
  const base = (listing, recipe, evidence, key = '') => ({
    id: `${recipe}:${listing.id}:${evidenceId([key, listing.updatedAt, listing.askingPrice, ...evidence.map((item) => [item.value, item.recordedAt])])}`,
    recipe,
    listingId: listing.id,
    title: text(listing.title) || 'Untitled listing',
    area: [listing.suburb, listing.city].map(text).filter(Boolean).join(', '),
    price: amount(listing.askingPrice) ? money(amount(listing.askingPrice)) : 'Price to confirm',
    coverUrl: '',
    sourceLabel: `Saved listing · ${Number.isFinite(timestamp(listing.updatedAt)) ? 'updated ' : ''}${campaignSourceTime(listing.updatedAt, timeZone)}`,
    evidence,
    actionLabel: 'Prepare campaign',
    priority: 2,
  })

  for (const event of events) {
    const listing = listingMap.get(event.listingId)
    const start = timestamp(event.startsAt), end = timestamp(event.endsAt)
    if (!listing || event.organisationId !== organisationId || event.visibility !== 'public' || !['planning', 'upcoming'].includes(text(event.status).toLowerCase()) || !Number.isFinite(start) || !Number.isFinite(end) || start <= nowMs || end <= start || start > nowMs + 14 * DAY || hasPlan(listing.id, 'show-day', event.id)) continue
    const evidence = [{ label: 'Public show day', value: campaignSourceTime(event.startsAt, timeZone), recordedAt: event.updatedAt || '' }]
    items.push({ ...base(listing, 'show-day', evidence, event.id), eventId: event.id, title: `Invite buyers to ${text(listing.title) || 'your show day'}`, coverUrl: validUrl(event.image), reason: `A saved public show day starts ${campaignSourceTime(event.startsAt, timeZone)}. Review the time and location before inviting buyers.`, sourceLabel: `Public show day · ${Number.isFinite(timestamp(event.updatedAt)) ? 'updated ' : ''}${campaignSourceTime(event.updatedAt, timeZone)}`, priority: 0, eventStartsAt: event.startsAt })
  }

  for (const listing of scoped) {
    const currentPrice = amount(listing.askingPrice)
    const saved = plans.flatMap((campaign) => campaignListings(campaign).filter((item) => item.listingId === listing.id).map((item) => ({ campaign, item, at: timestamp(campaign.updated_at || campaign.created_at) })))
      .filter((entry) => Number.isFinite(entry.at) && entry.at <= nowMs)
      .sort((a, b) => b.at - a.at)[0]
    const oldPrice = saved ? amount(saved.item.source?.price) : null
    // The most recent saved snapshot is the evidence. Do not hunt through older
    // campaigns for a more impressive discount when a later draft has caught up.
    if (currentPrice && oldPrice && currentPrice < oldPrice && !hasPlan(listing.id, 'price-reduced')) {
      const evidence = [{ label: 'Current saved asking price', value: money(currentPrice), recordedAt: listing.updatedAt || '' }, { label: 'Price in the latest saved campaign', value: money(oldPrice), recordedAt: saved.campaign.updated_at || saved.campaign.created_at }]
      items.push({ ...base(listing, 'price-reduced', evidence, `${saved.campaign.id}:${saved.campaign.revision}`), title: 'Bring the new asking price to buyers', reason: `The asking price is lower than in “${text(saved.campaign.name) || 'your latest campaign'}”. Confirm the change before using price-reduction wording; the saved campaign is not a price-history record.`, existingCampaignId: saved.campaign.id, priority: 1 })
    }
    const created = timestamp(listing.createdAt)
    if (Number.isFinite(created) && created <= nowMs && created >= nowMs - 14 * DAY && !hasPlan(listing.id, 'new-listing')) {
      const evidence = [{ label: 'Listing record created', value: campaignSourceTime(listing.createdAt, timeZone), recordedAt: listing.createdAt }]
      items.push({ ...base(listing, 'new-listing', evidence), title: `Introduce ${text(listing.title) || 'your listing'}`, reason: 'This available sale listing was added in the last 14 days. Prepare its introduction from the saved facts; the creation date does not confirm when it was published.' })
    }
  }
  const take = Number.isFinite(Number(limit)) ? Math.max(0, Math.min(12, Number(limit))) : 6
  return { items: items.sort((a, b) => a.priority - b.priority || (timestamp(a.eventStartsAt) || 0) - (timestamp(b.eventStartsAt) || 0) || a.title.localeCompare(b.title)).slice(0, take).map((item) => ({ ...item, href: campaignOpportunityHref(item) })), warnings }
}
