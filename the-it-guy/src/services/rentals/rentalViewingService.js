import { createPrivateListingActivity, getPrivateListingActivity } from '../privateListingService'
import { listRentalListingsForAgent } from './rentalListingDraftService'
import { findRentalViewingOutcomeActivity, findScheduledRentalViewingActivity, RENTAL_VIEWING_OUTCOMES } from './rentalViewingModel'

export const RENTAL_VIEWING_ACTIVITY_VERSION = 'arch9_rental_viewing_activity_v2'
const text = (value) => String(value ?? '').trim()

function scheduledViewing(activity = {}, listing = {}) {
  return { id: text(activity.id), listingId: listing.id, listingTitle: listing.listingTitle || listing.title, ...(activity.metadata || activity.metadata_json || {}) }
}

export async function listRentalViewings(agentId, options = {}) {
  const listings = await listRentalListingsForAgent(agentId, options)
  const grouped = await Promise.all(listings.map(async (listing) => {
    const activities = options.requireActivity
      ? await getPrivateListingActivity(listing.id, { requireAvailable: true })
      : await getPrivateListingActivity(listing.id).catch(() => [])
    const scheduled = activities.filter((activity) => text(activity.activity_type || activity.activityType) === 'rental_viewing_scheduled').map((activity) => scheduledViewing(activity, listing))
    const outcomes = activities.filter((activity) => text(activity.activity_type || activity.activityType) === 'rental_viewing_outcome').map((activity) => activity.metadata || activity.metadata_json || {})
    return scheduled.map((viewing) => ({ ...viewing, outcome: outcomes.find((outcome) => text(outcome.viewingId) === viewing.id)?.outcome || '', outcomeNote: outcomes.find((outcome) => text(outcome.viewingId) === viewing.id)?.note || '' }))
  }))
  return grouped.flat().sort((left, right) => String(left.startsAt).localeCompare(String(right.startsAt)))
}

export async function createRentalViewing(form = {}, context = {}) {
  if (!text(form.listingId) || !text(form.tenantLeadId) || !text(form.startsAt)) throw new Error('Listing, tenant lead, and viewing time are required.')
  const startsAt = new Date(form.startsAt).toISOString()
  const existingActivities = await getPrivateListingActivity(text(form.listingId))
  const existing = findScheduledRentalViewingActivity(existingActivities, form.tenantLeadId, startsAt)
  if (existing) return { id: text(existing.id), listingId: text(form.listingId), ...(existing.metadata || existing.metadata_json || {}) }
  const activity = await createPrivateListingActivity({ privateListingId: text(form.listingId), activityType: 'rental_viewing_scheduled', activityTitle: 'Rental viewing scheduled', activityDescription: text(form.note) || 'Rental viewing scheduled.', performedBy: context.assignedAgentId || null, visibility: 'internal', metadata: { captureVersion: RENTAL_VIEWING_ACTIVITY_VERSION, tenantLeadId: text(form.tenantLeadId), tenantName: text(form.tenantName), startsAt, note: text(form.note), status: 'scheduled' } })
  if (!activity?.id) throw new Error('Unable to schedule the rental viewing.')
  return { id: text(activity.id), listingId: text(form.listingId), ...(activity.metadata || {}) }
}

export async function recordRentalViewingOutcome(viewing = {}, outcome = '', note = '', context = {}) {
  const normalizedOutcome = text(outcome).toLowerCase()
  if (!RENTAL_VIEWING_OUTCOMES.includes(normalizedOutcome)) throw new Error('Choose a supported viewing outcome.')
  if (!text(viewing.id) || !text(viewing.listingId)) throw new Error('A scheduled rental viewing is required.')
  const activities = await getPrivateListingActivity(text(viewing.listingId))
  const scheduled = activities.find((item) => text(item.id) === text(viewing.id) && text(item.activity_type || item.activityType) === 'rental_viewing_scheduled')
  if (!scheduled || text((scheduled.metadata || scheduled.metadata_json || {}).tenantLeadId) !== text(viewing.tenantLeadId)) throw new Error('The linked scheduled viewing could not be verified.')
  const existing = findRentalViewingOutcomeActivity(activities, viewing.id)
  if (existing) {
    const recorded = text((existing.metadata || existing.metadata_json || {}).outcome)
    if (recorded !== normalizedOutcome) throw new Error('This viewing already has a different recorded outcome.')
    return { ...viewing, outcome: recorded, outcomeNote: text((existing.metadata || existing.metadata_json || {}).note) }
  }
  const activity = await createPrivateListingActivity({ privateListingId: text(viewing.listingId), activityType: 'rental_viewing_outcome', activityTitle: 'Rental viewing outcome recorded', activityDescription: text(note) || `Viewing marked ${normalizedOutcome}.`, performedBy: context.assignedAgentId || null, visibility: 'internal', metadata: { captureVersion: RENTAL_VIEWING_ACTIVITY_VERSION, viewingId: text(viewing.id), tenantLeadId: text(viewing.tenantLeadId), outcome: normalizedOutcome, note: text(note), recordedAt: new Date().toISOString() } })
  if (!activity?.id) throw new Error('Unable to record the rental viewing outcome.')
  return { ...viewing, outcome: normalizedOutcome, outcomeNote: text(note) }
}
