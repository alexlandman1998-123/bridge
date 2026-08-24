import {
  buildRentalProperty24Readiness,
} from './rentalListingProperty24ReadinessModel.js'

export const RENTAL_PROPERTY24_PUBLISH_REQUEST_VERSION = 'arch9_rental_property24_publish_request_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

function safeKeyPart(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
}

export function buildRentalProperty24PublishRequest(listing = {}, context = {}) {
  const readiness = buildRentalProperty24Readiness(listing)
  const listingId = normalizeText(listing.id || listing.listingId || listing.listing_id || readiness.payloadPreview?.agentSourceReference)
  const requestedAt = normalizeTimestamp(context.requestedAt)
  const requestedBy = normalizeText(context.requestedBy || context.performedBy || context.agentId || context.assignedAgentId)
  const idempotencyKey = [
    'property24-rental-publish',
    safeKeyPart(listingId),
    safeKeyPart(readiness.payloadPreview?.agentSourceReference),
    safeKeyPart(readiness.payloadPreview?.rentalInfo?.monthlyRent),
    safeKeyPart(readiness.payloadPreview?.rentalInfo?.availableFrom),
  ].join(':')

  if (!readiness.readyToPublish) {
    return {
      version: RENTAL_PROPERTY24_PUBLISH_REQUEST_VERSION,
      status: 'blocked',
      canPrepare: false,
      liveWriteEnabled: false,
      requiresBackendPublisher: true,
      listingId,
      requestedAt,
      requestedBy,
      idempotencyKey,
      blockers: readiness.blockers,
      readiness,
      requestPayload: null,
      activity: {
        activityType: 'property24_rental_publish_blocked',
        activityTitle: 'Property24 rental publish blocked',
        activityDescription: 'Rental listing is missing required Property24 rental publishing fields.',
      },
    }
  }

  return {
    version: RENTAL_PROPERTY24_PUBLISH_REQUEST_VERSION,
    status: 'ready_for_backend_publish',
    canPrepare: true,
    liveWriteEnabled: false,
    requiresBackendPublisher: true,
    listingId,
    requestedAt,
    requestedBy,
    idempotencyKey,
    blockers: [],
    readiness,
    requestPayload: readiness.payloadPreview,
    activity: {
      activityType: 'property24_rental_publish_request_prepared',
      activityTitle: 'Property24 rental publish request prepared',
      activityDescription: 'Rental listing passed readiness checks and is ready for controlled Property24 rental publish wiring.',
    },
  }
}
