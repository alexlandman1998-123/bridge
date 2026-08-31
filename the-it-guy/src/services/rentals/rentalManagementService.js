import { createPrivateListingActivity, getPrivateListingActivity } from '../privateListingService'
import { listRentalLeaseWorkflowsForAgent } from './rentalLeaseWorkflowService'
import { buildRentalManagementEventPayload, mapRentalManagementEvent, RENTAL_MANAGEMENT_EVENT_VERSION } from './rentalManagementModel'

const text = (value) => String(value ?? '').trim()

function isRentalManagementEvent(activity = {}) {
  const metadata = activity.metadata || activity.metadata_json || {}
  return text(activity.activity_type || activity.activityType) === 'rental_management_event' || text(metadata.captureVersion) === RENTAL_MANAGEMENT_EVENT_VERSION
}

export async function listRentalManagementWorkspace(agentId, options = {}) {
  const leases = await listRentalLeaseWorkflowsForAgent(agentId, options)
  const eventGroups = await Promise.all(leases.map(async (lease) => {
    const activities = await getPrivateListingActivity(lease.listingId).catch(() => [])
    return activities.filter(isRentalManagementEvent).map(mapRentalManagementEvent).filter((event) => event.leaseReference === lease.reference)
  }))
  return { leases, events: eventGroups.flat().sort((left, right) => (Date.parse(right.createdAt || '') || 0) - (Date.parse(left.createdAt || '') || 0)) }
}

export async function createRentalManagementEvent(lease = {}, form = {}, context = {}) {
  if (!text(lease.id) || !text(lease.listingId)) throw new Error('Select a saved lease workflow first.')
  if (!text(form.note)) throw new Error('A management note is required.')
  const activity = await createPrivateListingActivity(buildRentalManagementEventPayload(lease, form, context))
  if (!activity?.id) throw new Error('Unable to save the rental management update.')
  return mapRentalManagementEvent(activity)
}
