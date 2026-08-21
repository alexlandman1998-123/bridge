import {
  createPrivateListingActivity,
  getPrivateListingActivity,
} from '../privateListingService'
import { listRentalListingsForAgent } from './rentalListingDraftService'
import {
  buildRentalLeaseWorkflowActivityPayload,
  mapRentalLeaseWorkflowActivity,
  RENTAL_LEASE_CAPTURE_VERSION,
  validateRentalLeaseWorkflowForm,
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
  const leaseGroups = await Promise.all(
    rentalListings.map(async (listing) => {
      const activities = await getPrivateListingActivity(listing.id).catch(() => [])
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

export async function createRentalLeaseWorkflow(form = {}, listing = {}, application = {}, context = {}) {
  const validationErrors = validateRentalLeaseWorkflowForm(form)
  if (validationErrors.length) {
    const error = new Error(validationErrors.join(' '))
    error.validationErrors = validationErrors
    throw error
  }
  const payload = buildRentalLeaseWorkflowActivityPayload(form, listing, application, context)
  const activity = await createPrivateListingActivity(payload)
  if (!activity?.id) throw new Error('Unable to persist the rental lease workflow activity.')
  return {
    activity,
    lease: mapRentalLeaseWorkflowActivity(activity, listing),
  }
}
