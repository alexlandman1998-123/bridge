import {
  createPrivateListingActivity,
  getPrivateListingActivity,
} from '../privateListingService'
import { listRentalListingsForAgent } from './rentalListingDraftService'
import {
  buildRentalApplicationActivityPayload,
  mapRentalApplicationActivity,
  RENTAL_APPLICATION_CAPTURE_VERSION,
  validateRentalApplicationDraftForm,
} from './rentalApplicationDraftModel'

function normalizeText(value) {
  return String(value || '').trim()
}

function isRentalApplicationActivity(activity = {}) {
  const metadata = activity.metadata || activity.metadata_json || {}
  return normalizeText(activity.activity_type || activity.activityType) === 'rental_application_received' ||
    normalizeText(metadata.captureVersion) === RENTAL_APPLICATION_CAPTURE_VERSION
}

export async function listRentalApplicationsForAgent(agentId, options = {}) {
  const rentalListings = await listRentalListingsForAgent(agentId, options)
  const applicationGroups = await Promise.all(
    rentalListings.map(async (listing) => {
      const activities = await getPrivateListingActivity(listing.id).catch(() => [])
      return activities
        .filter(isRentalApplicationActivity)
        .map((activity) => mapRentalApplicationActivity(activity, listing))
    }),
  )
  return applicationGroups.flat().sort((left, right) => {
    const leftTime = Date.parse(left.capturedAt || '') || 0
    const rightTime = Date.parse(right.capturedAt || '') || 0
    return rightTime - leftTime
  })
}

export async function createRentalApplicationDraft(form = {}, listing = {}, context = {}) {
  const validationErrors = validateRentalApplicationDraftForm(form)
  if (validationErrors.length) {
    const error = new Error(validationErrors.join(' '))
    error.validationErrors = validationErrors
    throw error
  }
  const payload = buildRentalApplicationActivityPayload(form, listing, context)
  const activity = await createPrivateListingActivity(payload)
  if (!activity?.id) throw new Error('Unable to persist the rental application activity.')
  return {
    activity,
    application: mapRentalApplicationActivity(activity, listing),
  }
}
