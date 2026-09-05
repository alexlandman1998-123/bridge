import { createPrivateListingActivity, getPrivateListingActivity } from '../privateListingService'
import { listRentalListingsForAgent } from './rentalListingDraftService'
import { RENTAL_VIEWING_OUTCOMES } from './rentalViewingModel'

export const RENTAL_VIEWING_ACTIVITY_VERSION = 'arch9_rental_viewing_activity_v2'
const text = (value) => String(value ?? '').trim()

function scheduledViewing(activity = {}, listing = {}) {
  return { id: text(activity.id), listingId: listing.id, listingTitle: listing.listingTitle || listing.title, ...(activity.metadata || activity.metadata_json || {}) }
}

export async function listRentalViewings(agentId, options = {}) {
  const listings = await listRentalListingsForAgent(agentId, options)
  const grouped = await Promise.all(listings.map(async (listing) => {
    const activities = await getPrivateListingActivity(listing.id).catch(() => [])
    const scheduled = activities.filter((activity) => text(activity.activity_type || activity.activityType) === 'rental_viewing_scheduled').map((activity) => scheduledViewing(activity, listing))
    const outcomes = activities.filter((activity) => text(activity.activity_type || activity.activityType) === 'rental_viewing_outcome').map((activity) => activity.metadata || activity.metadata_json || {})
    return scheduled.map((viewing) => ({ ...viewing, outcome: outcomes.find((outcome) => text(outcome.viewingId) === viewing.id)?.outcome || '', outcomeNote: outcomes.find((outcome) => text(outcome.viewingId) === viewing.id)?.note || '' }))
  }))
  return grouped.flat().sort((left, right) => String(left.startsAt).localeCompare(String(right.startsAt)))
}

export async function createRentalViewing(form = {}, context = {}) {
  if (!text(form.listingId) || !text(form.tenantLeadId) || !text(form.startsAt)) throw new Error('Listing, tenant lead, and viewing time are required.')
  const activity = await createPrivateListingActivity({ privateListingId: text(form.listingId), activityType: 'rental_viewing_scheduled', activityTitle: 'Rental viewing scheduled', activityDescription: text(form.note) || 'Rental viewing scheduled.', performedBy: context.assignedAgentId || null, visibility: 'internal', metadata: { captureVersion: RENTAL_VIEWING_ACTIVITY_VERSION, tenantLeadId: text(form.tenantLeadId), tenantName: text(form.tenantName), startsAt: new Date(form.startsAt).toISOString(), note: text(form.note), status: 'scheduled' } })
  if (!activity?.id) throw new Error('Unable to schedule the rental viewing.')
  return { id: text(activity.id), listingId: text(form.listingId), ...(activity.metadata || {}) }
}

export async function recordRentalViewingOutcome(viewing = {}, outcome = '', note = '', context = {}) {
  const normalizedOutcome = text(outcome).toLowerCase()
  if (!RENTAL_VIEWING_OUTCOMES.includes(normalizedOutcome)) throw new Error('Choose a supported viewing outcome.')
  if (!text(viewing.id) || !text(viewing.listingId)) throw new Error('A scheduled rental viewing is required.')
  const activity = await createPrivateListingActivity({ privateListingId: text(viewing.listingId), activityType: 'rental_viewing_outcome', activityTitle: 'Rental viewing outcome recorded', activityDescription: text(note) || `Viewing marked ${normalizedOutcome}.`, performedBy: context.assignedAgentId || null, visibility: 'internal', metadata: { captureVersion: RENTAL_VIEWING_ACTIVITY_VERSION, viewingId: text(viewing.id), tenantLeadId: text(viewing.tenantLeadId), outcome: normalizedOutcome, note: text(note), recordedAt: new Date().toISOString() } })
  if (!activity?.id) throw new Error('Unable to record the rental viewing outcome.')
  return { ...viewing, outcome: normalizedOutcome, outcomeNote: text(note) }
}
