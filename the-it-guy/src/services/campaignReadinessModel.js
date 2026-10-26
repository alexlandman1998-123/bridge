import { cleanListingBuilder, justListedGaps } from './justListedCampaignModel'
import { propertyItems } from './listingCampaignContract'
import { projectPropertySource, propertyCampaignGaps } from './listingCampaignModel'
import { campaignSourceTime } from './campaignOpportunityModel'
import { contactProvenanceReview, PROPERTY_CONTACT_FIELDS } from './campaignContactProvenance'

const text = (value) => String(value ?? '').trim()
const sourceFields = { title: 'headline', price: 'asking price', location: 'public location', facts: 'property facts', description: 'description', agencyName: 'agency name', agentName: 'agent name', agentEmail: 'agent email', agentPhone: 'agent phone', destination: 'enquiry destination', language: 'language', tone: 'tone', primaryColor: 'brand colour' }
const unavailable = new Set(['sold', 'under_offer', 'transaction_created', 'withdrawn', 'archived', 'deleted'])
const check = (id, status, label, detail) => ({ id, status, label, detail })

function sourceChecks(builder, currents, checkedAt, timeZone) {
  const checks = []
  for (const item of propertyItems(builder)) {
    const current = currents.find((row) => row.listingId === item.listingId)
    const prefix = `listing:${item.listingId}`
    if (!current) {
      checks.push(check(prefix, 'blocked', 'Listing unavailable', 'This selected listing could not be refreshed in your current workspace. Choose an available listing before preparing the campaign.'))
      continue
    }
    const allowedSold = builder.template === 'just-sold' && current.listingStatus === 'sold'
    if ((!allowedSold && unavailable.has(current.listingStatus)) || (builder.template === 'just-sold' && current.listingStatus !== 'sold')) {
      checks.push(check(`${prefix}:availability`, 'blocked', 'Listing availability changed', 'Refresh the campaign from a listing with the right availability for this recipe.'))
    } else if (!current.listingStatus) {
      checks.push(check(`${prefix}:availability`, 'review', 'Confirm listing availability', 'The refreshed source did not include an availability status. Check it in the listing before sending.'))
    } else {
      checks.push(check(`${prefix}:availability`, 'ready', 'Listing availability checked', `Current listing status: ${current.listingStatus.replaceAll('_', ' ')}.`))
    }
    const fresh = builder.version === 2 ? projectPropertySource(builder.template, current, builder.settings) : current.source
    const contactReview = contactProvenanceReview(item, fresh)
    const changed = Object.keys(sourceFields).filter((key) => !PROPERTY_CONTACT_FIELDS.includes(key) && text(item.source?.[key]) !== text(fresh?.[key]))
    if (text(item.agentId) !== text(current.agentId)) changed.push('agentId')
    if (changed.length) {
      checks.push(check(`${prefix}:facts`, 'blocked', 'Saved source needs updating', `Changed: ${changed.map((key) => sourceFields[key] || 'assigned agent').join(', ')}. Refresh and save the campaign; review related wording before continuing.`))
    } else {
      checks.push(check(`${prefix}:facts`, 'ready', 'Saved facts match the refreshed source', `Compared the saved headline, price, public location, facts and agency identity.${checkedAt ? ` Checked ${campaignSourceTime(checkedAt, timeZone)}.` : ''}`))
    }
    checks.push(check(`${prefix}:contact-review`, contactReview.ready ? 'ready' : 'blocked', contactReview.ready ? 'Contact source and overrides confirmed' : 'Refresh campaign contact details', contactReview.ready ? 'The recorded public contacts still match. Any campaign-only overrides were explicitly saved and confirmed.' : contactReview.message))
    const updatedAt = current.source?.listingUpdatedAt
    checks.push(check(`${prefix}:time`, Number.isFinite(Date.parse(updatedAt)) ? 'ready' : 'review', 'Source update time', Number.isFinite(Date.parse(updatedAt)) ? `Listing last updated ${campaignSourceTime(updatedAt, timeZone)}. This is its saved record time, not proof of a recent viewing or seller confirmation.` : 'The listing update time was not recorded. Verify the price and availability with the listing owner before sending.'))
    const photoRequired = !(builder.template === 'coming-soon' && !builder.settings?.revealPhotos)
    if (photoRequired) {
      const selected = (current.images || []).find((image) => image.id === item.source.imageId)
      let valid = false
      try { const url = new URL(selected?.url); valid = url.protocol === 'https:' && !url.username && !url.password } catch { /* Missing/invalid images remain a review item. */ }
      checks.push(check(`${prefix}:image`, valid ? 'ready' : 'review', valid ? 'Selected photograph available' : 'Review the selected photograph', valid ? 'The saved photo is still present in the refreshed listing. Email artwork must use approved delivery-safe assets.' : 'The selected photograph is missing or unavailable. Select a current photo before producing artwork; a plain text email can still be prepared.'))
    }
  }
  return checks
}

// Readiness is a factual review of draft preparation. The existing channel's
// recipient, sender, approval, cost and dispatch checks remain authoritative.
export function buildCampaignReadiness(campaign, { currents = [], sourceState = 'unchecked', checkedAt = null, event = null, eventState = 'unchecked', now = Date.now(), channel = 'email', timeZone = 'Africa/Johannesburg' } = {}) {
  const checks = []
  const revision = Number.isInteger(campaign?.revision) && campaign.revision > 0 ? campaign.revision : null
  checks.push(check('revision', campaign?.id && revision ? 'ready' : 'blocked', 'Saved campaign revision', campaign?.id && revision ? `Reviewing revision ${revision}. Later edits need a fresh review.` : 'Save this campaign before preparing a channel draft.'))
  if (campaign?.status !== 'draft') checks.push(check('draft', 'blocked', 'Open a campaign draft', 'Prepare channel content from a saved draft. Duplicate a completed campaign to start fresh.'))
  const copy = campaign?.channel_content?.[channel]
  checks.push(check('content', text(copy?.title) && text(copy?.body) ? 'ready' : 'blocked', `${channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : 'Channel'} wording`, text(copy?.title) && text(copy?.body) ? 'A subject or headline and message are saved for this channel.' : 'Add a subject or headline and a message, then save the campaign.'))
  if (!campaign?.planned_channels?.includes(channel)) checks.push(check('channel', 'blocked', 'Add this channel', 'Include this channel in the saved campaign before preparing its content.'))
  if (campaign?.playbook && campaign.playbook.sourceRevision !== campaign.revision) checks.push(check('playbook', 'review', 'Playbook needs review', 'The campaign brief changed after the playbook was saved. Review and save the playbook before preparing a playbook step.'))
  if (campaign?.listing_builder) {
    let builder
    try { builder = cleanListingBuilder(campaign.listing_builder) } catch (error) { checks.push(check('recipe', 'blocked', 'Review the property recipe', error.message)) }
    if (builder) {
      const gaps = builder.version === 2 ? propertyCampaignGaps(builder, new Date(now).getTime()) : justListedGaps(builder.source)
      checks.push(check('recipe', gaps.length ? 'blocked' : 'ready', 'Property recipe details', gaps.length ? gaps.join(' ') : 'The saved recipe has its required public details.'))
      if (sourceState === 'available') checks.push(...sourceChecks(builder, currents, checkedAt, timeZone))
      else checks.push(check('source', sourceState === 'unavailable' ? 'blocked' : 'unchecked', sourceState === 'unavailable' ? 'Fresh listing details unavailable' : 'Refresh listing details', sourceState === 'unavailable' ? 'Current sources could not be loaded. Your draft remains saved; try the source check again before preparing it.' : 'Compare the saved campaign with the current listing, price, availability and public contact before preparing the channel draft.'))
      if (builder.template === 'price-reduced') checks.push(check('previous-price', 'review', 'No previous price is assumed', 'This recipe uses the confirmed current asking price. A former price or discount needs separate verified evidence; a saved campaign alone does not establish price history.'))
      if (builder.template === 'show-day' && builder.settings.eventId) {
        if (eventState !== 'available') checks.push(check('event', eventState === 'unavailable' ? 'blocked' : 'unchecked', 'Refresh the public show day', 'Confirm that the saved public event is still available, with the same date, time and listing.'))
        else {
          const changed = !event || event.id !== builder.settings.eventId || event.listingId !== builder.listingId || ['date', 'startTime', 'endTime'].some((key) => text(event[key]) !== text(builder.settings[key]))
          checks.push(check('event', changed ? 'blocked' : 'ready', 'Saved public show day', changed ? 'The show day changed or is no longer public. Refresh the event and save the campaign.' : 'The saved date, start, end and selected listing match the refreshed public event.'))
        }
      }
    }
  } else {
    checks.push(check('source', 'review', 'Review factual claims', 'This campaign has no linked listing snapshot. Check property facts, prices and any specific claims in the wording before sending.'))
  }
  checks.push(check('delivery', 'unchecked', 'Final delivery review', 'In the channel editor, review the exact draft, verified sender, reply-to, eligible recipients, exclusions, approval, timing and actual delivery costs before sending.'))
  const blockers = checks.filter((item) => item.status === 'blocked')
  const warnings = checks.filter((item) => item.status === 'review')
  return { checks, blockers, warnings, revision, sourceCheckedAt: sourceState === 'available' ? checkedAt : null, readyToPrepare: blockers.length === 0 && !checks.some((item) => item.status === 'unchecked' && item.id !== 'delivery'), label: blockers.length ? `${blockers.length} ${blockers.length === 1 ? 'item needs' : 'items need'} attention` : checks.some((item) => item.status === 'unchecked' && item.id !== 'delivery') ? 'Source check needed' : 'Ready for channel review' }
}
