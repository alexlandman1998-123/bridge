import {
  getPrivateListingActivity,
} from '../privateListingService'
import { listRentalListingsForAgent } from './rentalListingDraftService'
import {
  mapRentalLeaseWorkflowActivity,
  RENTAL_LEASE_CAPTURE_VERSION,
} from './rentalLeaseWorkflowModel'

function normalizeText(value) {
  return String(value || '').trim()
}

function isRentalLeaseWorkflowActivity(activity = {}) {
  const metadata = activity.metadata || activity.metadata_json || {}
  return normalizeText(activity.activity_type || activity.activityType) === 'rental_lease_workflow_created' ||
    normalizeText(metadata.captureVersion) === RENTAL_LEASE_CAPTURE_VERSION
}

export async function listRentalLeaseWorkflowsForAgent(agentId, options = {}) {
  const rentalListings = await listRentalListingsForAgent(agentId, options)
  options.signal?.throwIfAborted()
  const leaseGroups = await Promise.all(
    rentalListings.map(async (listing) => {
      const activities = await (options.readActivity ? options.readActivity(listing.id) : getPrivateListingActivity(listing.id, options.signal ? { signal: options.signal } : undefined)).catch(() => {
        options.signal?.throwIfAborted()
        return []
      })
      return activities
        .filter(isRentalLeaseWorkflowActivity)
        .map((activity) => mapRentalLeaseWorkflowActivity(activity, listing))
    }),
  )
  return leaseGroups.flat().sort((left, right) => {
    const leftTime = Date.parse(left.capturedAt || '') || 0
    const rightTime = Date.parse(right.capturedAt || '') || 0
    return rightTime - leftTime
  })
}

// Earlier activity records remain readable for the management history. New
// preparation must create the canonical application-backed tenancy and lease.
export async function createRentalLeaseWorkflow() {
  throw new Error('Prepare the tenancy from the tenant’s approved application at Placement ready.')
}
