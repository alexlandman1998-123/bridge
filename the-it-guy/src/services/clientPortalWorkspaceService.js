import {
  fetchClientPortalByToken,
  fetchClientPortalContextsByToken,
  fetchClientPortalCoreByToken,
  fetchClientPortalMandatePacketSummaryByToken,
} from '../lib/api'
import { getDemoClientPortalSeedData } from '../lib/onboardingDemoLinks'
import { generateClientPortalNextActions } from '../lib/clientPortalNextActionsEngine'
import {
  buildClientPortalActivityFeedModel,
} from './clientPortalActivityFeedService'
import {
  getClientPortalNotifications,
  syncNotificationsFromActivityFeed,
  syncNotificationsFromNextActions,
} from './clientPortalNotificationsService'
import {
  buildClientPortalEducationalContent,
  getEducationalContentForAction,
  getEducationalContentForDocument,
  getEducationalContentForRole,
  getEducationalContentForStage,
  resolvePortalStageKey,
} from '../content/clientPortalEducation'
import { getTransactionWorkflowReadModel } from './transactionWorkflowReadModelService'
import { getPrivateListingActivity, getSellerOnboardingByToken } from './privateListingService'
import { buildSellerJourney } from './sellerJourneyService.js'
import { buildSellerReadinessSummary } from './sellerReadinessService.js'
import { getSellerRequiredDocuments } from './sellerDocumentRequirementsService.js'
import { buildSellerMandateContinuityModel } from './sellerMandateContinuityService.js'

function normalizeWorkspace(value = 'shared') {
  const normalized = String(value || 'shared').trim().toLowerCase()
  if (normalized === 'selling' || normalized === 'seller') return 'selling'
  if (normalized === 'buying' || normalized === 'buyer') return 'buying'
  return 'shared'
}

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isSellerVisibleExternalLinkStatus(status = '') {
  const normalized = normalizeValue(status)
  return normalized === 'live' || normalized === 'published'
}

function normalizeSellerVisibleExternalLinks(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      const status = item?.status || ''
      const visible = item?.visibleToSeller ?? item?.visible_to_seller
      return Boolean(item?.url || item?.listingUrl) && (visible === true || isSellerVisibleExternalLinkStatus(status))
    })
    .map((item, index) => ({
      id: String(item.id || item.key || `${item.platform || 'listing'}-${index}`),
      platform: String(item.platform || item.platformName || 'Listing platform').trim(),
      url: String(item.url || item.listingUrl || '').trim(),
      status: String(item.status || 'Live').trim(),
      publishedAt: item.publishedAt || item.published_at || '',
    }))
}

function isSellerOnboardingToken(token = '') {
  return normalizeValue(token).startsWith('seller-')
}

function isInvalidClientPortalLinkError(error = null) {
  const message = normalizeValue(error?.message || error)
  return (
    message.includes('client portal link is invalid') ||
    message.includes('client portal link is inactive') ||
    message.includes('client portal links are not set up')
  )
}

function formatListingAddress(listing = {}, formData = {}) {
  return String(
    formData.propertyAddress ||
      listing.propertyAddress ||
      listing.addressLine1 ||
      listing.listingTitle ||
      listing.title ||
      'Property sale',
  ).trim()
}

function getSellerDisplayName(listing = {}, formData = {}) {
  const fromForm = [
    formData.sellerName || formData.firstName || formData.name,
    formData.sellerSurname || formData.lastName || formData.surname,
  ].filter(Boolean).join(' ').trim()
  const fromListing = listing?.seller?.name || listing?.sellerName || ''
  return fromForm || fromListing || 'Seller'
}

function mapSellerRequiredDocument(requirement = {}) {
  const key = String(requirement?.key || requirement?.requirement_key || requirement?.id || '').trim()
  const label = String(requirement?.label || requirement?.requirement_name || requirement?.name || key || 'Seller document').trim()
  return {
    ...requirement,
    key: key || label,
    label,
    requirement_name: label,
    description: requirement?.description || requirement?.requirement_description || '',
    requirement_description: requirement?.requirement_description || requirement?.description || '',
    status: requirement?.status || requirement?.requiredDocumentStatus || 'required',
    applies_to: 'seller',
    expectedFromRole: 'seller',
    visibility_scope: 'client',
    visibility: requirement?.visibility || requirement?.document_visibility || 'seller_visible',
    canonicalRequirementInstanceId: requirement?.canonicalRequirementInstanceId || requirement?.canonical_requirement_instance_id || '',
    canonical_requirement_instance_id: requirement?.canonical_requirement_instance_id || requirement?.canonicalRequirementInstanceId || '',
  }
}

function mapSellerUploadedDocument(document = {}) {
  return {
    ...document,
    id: document?.id || document?.storage_path || document?.file_url || document?.document_name || document?.name || '',
    name: document?.name || document?.document_name || document?.fileName || 'Seller document',
    document_name: document?.document_name || document?.name || document?.fileName || 'Seller document',
    category: document?.category || document?.document_type || 'Seller Documents',
    document_type: document?.document_type || document?.category || 'seller_document',
    file_path: document?.file_path || document?.storage_path || '',
    storage_path: document?.storage_path || document?.file_path || '',
    url: document?.url || document?.file_url || '',
    status: document?.status || 'uploaded',
    visibility: document?.visibility || document?.document_visibility || 'seller_visible',
    canonicalRequirementInstanceId: document?.canonicalRequirementInstanceId || document?.canonical_requirement_instance_id || '',
    canonical_requirement_instance_id: document?.canonical_requirement_instance_id || document?.canonicalRequirementInstanceId || '',
    created_at: document?.created_at || document?.uploaded_at || document?.uploadedAt || null,
  }
}

function mapSellerListingActivityEvent(activity = {}, index = 0) {
  const metadata = activity?.metadata && typeof activity.metadata === 'object' ? activity.metadata : {}
  const visibility = normalizeValue(activity?.visibility || metadata.visibility) === 'client_visible'
    ? 'client_visible'
    : 'internal_only'
  const createdAt =
    activity?.created_at ||
    metadata.createdAt ||
    metadata.created_at ||
    new Date().toISOString()
  const type = normalizeValue(activity?.activity_type || metadata.type || metadata.eventType || 'note_shared_with_client')
  return {
    id: activity?.id || `${type || 'seller_listing_activity'}-${index}`,
    type: type || 'note_shared_with_client',
    eventType: type || 'note_shared_with_client',
    createdAt,
    created_at: createdAt,
    timestamp: createdAt,
    createdByRole: metadata.actorRole || metadata.createdByRole || 'Agent',
    visibility,
    relatedEntityType: 'private_listing',
    relatedEntityId: activity?.private_listing_id || metadata.privateListingId || '',
    eventData: {
      ...metadata,
      title: activity?.activity_title || metadata.title || '',
      description: activity?.activity_description || metadata.description || '',
      audience: metadata.audience || 'seller',
      visibility,
      actionLabel: metadata.actionLabel || metadata.action_label || '',
      actionRoute: metadata.actionRoute || metadata.action_route || '',
      actorName: metadata.actorName || metadata.createdByName || '',
      actorRole: metadata.actorRole || metadata.createdByRole || 'Agent',
      relatedEntityType: 'private_listing',
      relatedEntityId: activity?.private_listing_id || metadata.privateListingId || '',
    },
  }
}

function mapSellerMandatePacket(packetPayload = null) {
  if (!packetPayload || typeof packetPayload !== 'object') return null
  const packet = packetPayload.packet && typeof packetPayload.packet === 'object' ? packetPayload.packet : {}
  const version = packetPayload.version && typeof packetPayload.version === 'object' ? packetPayload.version : {}
  const state = normalizeValue(packetPayload.state || packet.status || packetPayload.mandateStatus)
  return {
    ...packetPayload,
    id: packetPayload.id || packet.id || '',
    state: state || 'not_generated',
    packet,
    version,
    packetVersionId: packetPayload.packetVersionId || packetPayload.packet_version_id || version.id || '',
    finalSignedFilePath: packetPayload.finalSignedFilePath || packetPayload.final_signed_file_path || version.final_signed_file_path || '',
    finalSignedFileName: packetPayload.finalSignedFileName || packetPayload.final_signed_file_name || version.final_signed_file_name || 'Signed Mandate',
    finalSignedFileBucket: packetPayload.finalSignedFileBucket || packetPayload.final_signed_file_bucket || version.final_signed_file_bucket || '',
    finalSignedDownloadUrl:
      packetPayload.finalSignedDownloadUrl ||
      packetPayload.finalSignedFileAccessUrl ||
      packetPayload.final_signed_file_access_url ||
      packetPayload.final_signed_file_url ||
      version.final_signed_file_access_url ||
      version.final_signed_file_url ||
      '',
    generatedPreviewFilePath: packetPayload.generatedPreviewFilePath || packetPayload.rendered_file_path || version.rendered_file_path || '',
    generatedPreviewFileName: packetPayload.generatedPreviewFileName || packetPayload.rendered_file_name || version.rendered_file_name || 'Mandate',
    signedAt: packetPayload.signedAt || packetPayload.signed_at || version.finalised_at || packet.completed_at || '',
    updatedAt: packetPayload.updatedAt || packetPayload.updated_at || packet.updated_at || '',
  }
}

function mapSellerPortalAppointment(row = {}) {
  const startsAt = row?.date_time || row?.dateTime || (
    row?.appointment_date && row?.start_time ? `${row.appointment_date}T${row.start_time}` : null
  )
  return {
    ...row,
    id: row?.appointment_id || row?.appointmentId || row?.id || '',
    appointmentId: row?.appointment_id || row?.appointmentId || row?.id || '',
    title: row?.title || row?.appointment_title || 'Seller appointment',
    appointmentType: row?.appointment_type || row?.appointmentType || 'seller_consultation',
    appointment_type: row?.appointment_type || row?.appointmentType || 'seller_consultation',
    date: row?.appointment_date || row?.date || '',
    appointment_date: row?.appointment_date || row?.date || '',
    startTime: row?.start_time || row?.startTime || '',
    start_time: row?.start_time || row?.startTime || '',
    endTime: row?.end_time || row?.endTime || '',
    end_time: row?.end_time || row?.endTime || '',
    dateTime: startsAt,
    date_time: startsAt,
    location: row?.location || row?.meeting_url || '',
    meetingUrl: row?.meeting_url || row?.meetingUrl || '',
    status: row?.status || 'requested',
    visibility_scope: row?.visibility_scope || row?.visibility || 'client_visible',
    visibility: row?.visibility || row?.visibility_scope || 'client_visible',
    notes: row?.notes || row?.appointment_instructions || '',
  }
}

function normalizeSellerDocumentStatus(status = '') {
  const normalized = normalizeValue(status).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (['approved', 'verified', 'accepted'].includes(normalized)) return 'Approved'
  if (['uploaded', 'received', 'submitted', 'pending', 'pending_review'].includes(normalized)) return 'Uploaded'
  if (['required', 'missing', 'not_uploaded', 'outstanding', 'rejected'].includes(normalized)) return 'Outstanding'
  return normalized ? String(status).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Required'
}

function sellerStepStateToPortalState(step = {}) {
  if (step.current) return 'current'
  if (step.completed) return 'completed'
  return 'upcoming'
}

function sellerPortalStageMessage(journey = {}) {
  const key = journey?.stage?.key || 'contacted'
  const messages = {
    contacted: 'Your agent has your seller details and will coordinate the next step with you.',
    seller_onboarding_sent: 'Your seller onboarding link has been sent and is ready for you to complete.',
    seller_onboarding_submitted: 'Your seller onboarding has been submitted and is under review by your agent.',
    mandate_sent: 'Your mandate has been prepared and is ready for review or signing.',
    mandate_signed: 'Your signed mandate is on file and your listing can move forward.',
    listing_created: 'Your listing has been created and is being prepared for the market.',
    listing_live: 'Your listing is live and your agent can share buyer interest and offers here.',
    documents_submitted: 'Your key seller documents are on file and your active listing is fully documented.',
  }
  return messages[key] || 'Your agent is coordinating the next seller milestone.'
}

function sellerPortalStatusCards({ journey = null, documentCenter = null, requiredDocuments = [], documents = [], offers = [] } = {}) {
  const requirementRows = Array.isArray(documentCenter?.requiredDocuments) ? documentCenter.requiredDocuments : requiredDocuments
  const uploadedRows = Array.isArray(documentCenter?.uploadedDocuments) ? documentCenter.uploadedDocuments : documents
  const outstandingRequired = (Array.isArray(requirementRows) ? requirementRows : []).filter((item) => {
    const status = normalizeSellerDocumentStatus(item?.status || item?.documentStatus || item?.document_status)
    return status === 'Required' || status === 'Outstanding' || item?.complete === false
  }).length
  const uploadedCount = (Array.isArray(uploadedRows) ? uploadedRows : []).length
  const activeOffers = (Array.isArray(offers) ? offers : []).filter((offer) => !['rejected', 'withdrawn', 'expired'].includes(normalizeValue(offer?.status || offer?.workflowStatus || offer?.workflow_status)))
  return [
    {
      key: 'mandate',
      label: 'Mandate',
      value: journey?.kpis?.find((item) => item.key === 'mandate')?.value || 'Not started',
    },
    {
      key: 'listing',
      label: 'Listing Status',
      value: journey?.kpis?.find((item) => item.key === 'listing')?.value || 'Not created',
    },
    {
      key: 'documents',
      label: 'Documents',
      value: outstandingRequired ? `${outstandingRequired} Outstanding` : uploadedCount ? `${uploadedCount} Uploaded` : 'Required',
    },
    {
      key: 'offers',
      label: 'Offers',
      value: activeOffers.length ? `${activeOffers.length} Received` : 'No offers yet',
    },
  ]
}

function sellerFriendlyBlocker(blocker = {}) {
  const messages = {
    missing_seller_contact: 'Confirm seller contact details',
    missing_property_address: 'Confirm property address',
    valuation_not_completed: 'Complete valuation appointment',
    mandate_not_generated: 'Mandate is being prepared',
    mandate_signature_outstanding: 'Review mandate',
    mandate_not_signed: 'Review mandate',
    required_documents_missing: 'Upload required documents',
    listing_photos_incomplete: 'Listing photos still in progress',
    listing_description_incomplete: 'Listing description still in progress',
    listing_pricing_incomplete: 'Listing pricing still in progress',
    listing_compliance_incomplete: 'Upload required documents',
    listing_visibility_incomplete: 'Listing draft in progress',
  }
  return {
    key: blocker.id || blocker.label || 'seller_blocker',
    label: messages[blocker.id] || blocker.sellerMessage || blocker.label || 'Your agent is working on the next step',
    state: blocker.severity === 'blocked' ? 'blocked' : 'action_required',
  }
}

export function buildSellerPortalJourneyView({ journey = null, documentCenter = null, requiredDocuments = [], documents = [], offers = [] } = {}) {
  if (!journey?.isSeller) return null
  const readiness = buildSellerReadinessSummary({
    lead: {
      leadCategory: 'seller',
      sellerPropertyAddress: journey.kpis?.find((item) => item.key === 'property')?.value || '',
      listingId: journey.listing?.id || journey.listing?.listingId || '',
    },
    contact: { email: 'seller-portal' },
    listing: journey.listing || {},
    documents,
    journey,
  })
  const stages = (journey.steps || []).map((step) => ({
    key: step.key,
    label: step.label,
    state: sellerStepStateToPortalState(step),
    status: step.status || '',
  }))
  const completedCount = stages.filter((step) => step.state === 'completed').length
  const currentIndex = Math.max(0, stages.findIndex((step) => step.state === 'current'))
  const progressPercent = stages.length ? Math.round(((completedCount + 1) / stages.length) * 100) : 0
  const currentStage = stages[currentIndex] || stages[0] || { key: 'contacted', label: 'Contacted', state: 'current' }
  const statusCards = [
    {
      key: 'readiness',
      label: 'Readiness',
      value: readiness.readinessLabel || 'In progress',
    },
    ...sellerPortalStatusCards({ journey, documentCenter, requiredDocuments, documents, offers }),
  ]
  return {
    currentStage,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    stages,
    statusCards,
    readiness: {
      status: readiness.readiness,
      label: readiness.readinessLabel,
      nextAction: readiness.nextAction?.label || '',
      blockers: (readiness.blockers || []).map(sellerFriendlyBlocker),
    },
    documents: (Array.isArray(journey.documents) ? journey.documents : []).map((document) => ({
      ...document,
      status: normalizeSellerDocumentStatus(document.status),
    })),
    stageMeta: {
      progressPercent: Math.max(0, Math.min(100, progressPercent)),
      currentStage: {
        ...currentStage,
        message: sellerPortalStageMessage(journey),
        nextStepTitle: readiness.nextAction?.label || journey.nextRecommendedAction?.label || 'Review your sale progress',
        nextStepDescription: sellerPortalStageMessage(journey),
        primaryRoute: currentStage.key === 'listing_live' ? 'offers' : currentStage.key.includes('mandate') ? 'documents' : 'overview',
        primaryAction: currentStage.key === 'listing_live' ? 'Review offers' : currentStage.key.includes('mandate') ? 'Open documents' : 'View overview',
      },
      stages,
    },
  }
}

function resolveSellerPortalWorkflowStage(listing = {}, onboarding = {}, status = '') {
  const stageSignals = [
    listing?.transactionId,
    listing?.transaction_id,
    listing?.convertedTransactionId,
    listing?.converted_transaction_id,
  ].filter(Boolean)
  const registeredSignals = [
    listing?.registeredAt,
    listing?.registered_at,
    listing?.completedAt,
    listing?.completed_at,
  ].filter(Boolean)
  const listingStatus = normalizeValue(listing?.listingStatus || listing?.listing_status || listing?.status)
  const mandateStatus = normalizeValue(listing?.mandateStatus || listing?.mandate_status)
  const visibility = normalizeValue(listing?.listingVisibility || listing?.listing_visibility)

  if (stageSignals.length && (registeredSignals.length || ['registered', 'completed', 'complete', 'closed'].includes(listingStatus))) {
    return 'registered'
  }
  if (stageSignals.length || ['offer_accepted', 'under_offer', 'transaction_created', 'converted_to_transaction'].includes(listingStatus)) {
    return 'offer_accepted'
  }
  if (['active_market', 'active', 'listed', 'published', 'live', 'marketing'].includes(listingStatus) || visibility === 'active_market') {
    return 'listed'
  }
  if (['fully_signed', 'signed', 'active', 'completed'].includes(mandateStatus) || listing?.mandatePacketId || listing?.mandate_packet_id) {
    return 'mandate_signed'
  }
  if (['completed', 'submitted', 'under_review'].includes(normalizeValue(onboarding?.status || status))) {
    return 'mandate_signed'
  }
  return 'mandate_signed'
}

async function fetchSellerClientPortalDataByToken(token, options = {}) {
  const context = await getSellerOnboardingByToken(token, {
    includeRequirementsAndDocuments: true,
    requirePortalAccess: true,
    sellerPortalAccessToken: options?.sellerPortalAccessToken,
  })
  const listing = context?.listing || null
  if (!listing) {
    throw new Error('Client portal link is invalid or inactive.')
  }

  const onboarding = context?.onboarding || null
  const sellerOnboarding = listing?.sellerOnboarding || {}
  const formData =
    sellerOnboarding?.formData && typeof sellerOnboarding.formData === 'object'
      ? sellerOnboarding.formData
      : onboarding?.form_data && typeof onboarding.form_data === 'object'
        ? onboarding.form_data
        : {}
  const sellerName = getSellerDisplayName(listing, formData)
  const propertyAddress = formatListingAddress(listing, formData)
  const status = listing?.sellerOnboardingStatus || sellerOnboarding?.status || onboarding?.status || 'pending'
  const listingId = listing?.id || onboarding?.private_listing_id || null
  const sellerLeadId = listing?.sellerLeadId || listing?.seller_lead_id || null
  const mandatePacket = mapSellerMandatePacket(context?.mandatePacket || listing?.mandatePacket || null)
  const mandatePacketId = mandatePacket?.id || listing?.mandatePacketId || listing?.mandate_packet_id || null
  const requiredDocuments = getSellerRequiredDocuments(listing, formData)
    .map((item) => mapSellerRequiredDocument(item))
  const documents = (Array.isArray(listing?.documents) ? listing.documents : [])
    .map((item) => mapSellerUploadedDocument(item))
  const appointments = (Array.isArray(context?.appointments) ? context.appointments : [])
    .map((item) => mapSellerPortalAppointment(item))
  const rawOffers = [
    ...(Array.isArray(context?.offers) ? context.offers : []),
    ...(Array.isArray(listing?.offers) ? listing.offers : []),
  ]
  const sellerActivityRows = listingId
    ? await getPrivateListingActivity(listingId).catch((error) => {
        console.warn('[clientPortalWorkspaceService] seller listing activity feed skipped.', error)
        return []
      })
    : []
  const sellerActivityEvents = (Array.isArray(sellerActivityRows) ? sellerActivityRows : [])
    .filter((item) => normalizeValue(item?.visibility || item?.metadata?.visibility) === 'client_visible')
    .map((item, index) => mapSellerListingActivityEvent(item, index))
  const sellerLead = {
    id: sellerLeadId || `seller-${listingId || token}`,
    leadId: sellerLeadId || `seller-${listingId || token}`,
    leadCategory: 'seller',
    sellerPropertyAddress: propertyAddress,
    estimatedValue: listing?.estimatedValue || listing?.estimated_value || listing?.askingPrice || listing?.asking_price || formData?.estimatedValue,
    listingId,
    mandatePacketId,
    sellerOnboardingToken: token,
    sellerOnboardingStatus: status,
    createdAt: onboarding?.created_at || listing?.createdAt || listing?.created_at,
    updatedAt: onboarding?.submitted_at || listing?.updatedAt || listing?.updated_at,
  }
  const sellerMandateContinuity = buildSellerMandateContinuityModel({
    lead: sellerLead,
    listing,
    documents,
    mandatePacket,
    activityEvents: sellerActivityEvents,
    portalContext: context?.portalContext || context?.clientPortalContext || listing?.clientPortalContext || {},
    sellerWorkspaceToken: token,
  })
  const sellerJourney = buildSellerJourney({
    lead: sellerLead,
    contact: {
      name: sellerName,
      phone: formData.sellerPhone || listing?.seller?.phone || '',
      email: formData.sellerEmail || listing?.seller?.email || '',
    },
    appointments,
    listing: {
      ...listing,
      id: listingId,
      sellerLeadId: sellerLead.leadId,
      mandatePacketId,
    },
    mandatePacketStatus: mandatePacket ? {
      packet: mandatePacket.packet || mandatePacket,
      state: mandatePacket.state,
      versions: mandatePacket.version ? [mandatePacket.version] : [],
    } : null,
    mandatePacket: mandatePacket?.packet || mandatePacket,
    documents,
  })
  const sellerPortalJourney = buildSellerPortalJourneyView({
    journey: sellerJourney,
    requiredDocuments,
    documents,
    offers: rawOffers,
  })
  const sellerPortalStage = sellerJourney?.stage?.key || resolveSellerPortalWorkflowStage(listing, onboarding, status)
  const sellerVisibleExternalLinks = normalizeSellerVisibleExternalLinks([
    ...(Array.isArray(listing?.externalLinks) ? listing.externalLinks : []),
    ...(Array.isArray(listing?.listingExternalLinks) ? listing.listingExternalLinks : []),
    ...(Array.isArray(listing?.propertyDetails?.externalLinks) ? listing.propertyDetails.externalLinks : []),
    ...(Array.isArray(listing?.marketing?.externalLinks) ? listing.marketing.externalLinks : []),
    ...(Array.isArray(formData.externalListingLinks) ? formData.externalListingLinks : []),
  ])
  const sellerPortalBranding = {
    ...(listing?.branding || {}),
    organisationName: listing?.organisationName || listing?.agencyName || listing?.branding?.organisationName || '',
    agencyName: listing?.agencyName || listing?.organisationName || listing?.branding?.agencyName || '',
    logoUrl: listing?.agencyLogoUrl || listing?.organisationLogoUrl || listing?.branding?.logoUrl || '',
    logoDarkUrl: listing?.agencyLogoDarkUrl || listing?.agency_logo_dark_url || listing?.organisationLogoDarkUrl || listing?.organisation_logo_dark_url || listing?.branding?.logoDarkUrl || listing?.branding?.logoDark || '',
    logoLightUrl: listing?.agencyLogoLightUrl || listing?.agency_logo_light_url || listing?.organisationLogoLightUrl || listing?.organisation_logo_light_url || listing?.branding?.logoLightUrl || listing?.branding?.logoLight || '',
  }

  return {
    link: {
      id: onboarding?.id || listingId || token,
      token,
      transaction_id: null,
      buyer_id: null,
      is_active: true,
    },
    listing: {
      ...listing,
      externalLinks: sellerVisibleExternalLinks,
      listingExternalLinks: sellerVisibleExternalLinks,
    },
    branding: sellerPortalBranding,
    settings: {
      client_portal_enabled: true,
      snag_reporting_enabled: false,
      alteration_requests_enabled: false,
      service_reviews_enabled: false,
    },
    unit: {
      id: listingId || token,
      unit_number: propertyAddress,
      phase: listing?.suburb || listing?.city || '',
      status: sellerPortalStage,
      development: {
        id: listing?.organisationId || null,
        name: sellerPortalBranding.agencyName || sellerPortalBranding.organisationName || 'Arch9',
        developer_company: sellerPortalBranding.organisationName || sellerPortalBranding.agencyName || '',
      },
    },
    transaction: {
      id: listing?.transactionId || listing?.transaction_id || null,
      stage: sellerPortalStage,
      current_main_stage: sellerPortalStage,
      next_action: listing?.lifecycleNextAction || '',
      updated_at: listing?.updatedAt || onboarding?.submitted_at || listing?.createdAt || new Date().toISOString(),
      created_at: listing?.createdAt || onboarding?.created_at || null,
    },
    buyer: {
      id: null,
      name: sellerName,
      phone: formData.sellerPhone || listing?.seller?.phone || '',
      email: formData.sellerEmail || listing?.seller?.email || '',
    },
    appointments,
    offers: rawOffers,
    sellerJourney,
    sellerPortalJourney,
    sellerMandateContinuity,
    stage: sellerPortalStage,
    mainStage: sellerPortalStage,
    lastUpdated: listing?.updatedAt || onboarding?.submitted_at || listing?.createdAt || new Date().toISOString(),
    documents,
    additionalDocumentRequests: [],
    discussion: [],
    events: sellerActivityEvents,
    issues: [],
    alterations: [],
    reviews: [],
    trustInvestmentForm: null,
    handover: null,
    occupationalRent: null,
    homeownerDocuments: [],
    homeownerDashboardEnabled: false,
    onboarding: {
      status,
      submitted_at: onboarding?.submitted_at || sellerOnboarding?.submittedAt || null,
    },
    onboardingFormData: {
      status,
      formData,
    },
    onboardingDerivedConfiguration: {},
    purchaserType: 'seller',
    purchaserTypeLabel: 'Seller',
    subprocesses: [],
    requiredDocuments,
    requiredDocumentChecklist: requiredDocuments,
    requiredDocumentSummary: {
      totalRequired: requiredDocuments.length,
      uploadedCount: documents.length,
    },
    buyerRequirementProfile: null,
    clientVisibleBuyerRequirements: [],
    missingBuyerRequirements: [],
    requiredTransactionActions: [],
    buyerReadiness: {
      fica: null,
      finance: null,
      transfer: null,
    },
    activeSellingContext: {
      id: listingId || token,
      contextType: 'selling',
      status: sellerPortalStage,
      sellerOnboardingStatus: status,
      listingStatus: sellerPortalStage,
      mandateStatus: mandatePacket?.state || listing?.mandateStatus || listing?.mandate_status || '',
      sellerLeadId,
      listingId,
      agencyName: sellerPortalBranding.agencyName || sellerPortalBranding.organisationName || '',
      agencyLogoUrl: sellerPortalBranding.logoDarkUrl || sellerPortalBranding.logoUrl || sellerPortalBranding.logoLightUrl || '',
      agencyLogoLightUrl: sellerPortalBranding.logoLightUrl || '',
      branding: sellerPortalBranding,
      externalListingLinks: sellerVisibleExternalLinks,
      listingExternalLinks: sellerVisibleExternalLinks,
      mandatePacketId,
      mandatePacket,
      mandateContinuity: sellerMandateContinuity,
      mandateContinuityStatus: sellerMandateContinuity.status,
      sellerWorkspaceToken: token,
      sellerJourney,
      sellerPortalJourney,
      offers: rawOffers,
    },
    otpPacket: null,
    attorneyRolePlayers: null,
    fundingSources: [],
    featureAvailability: {
      snag: false,
      alteration: false,
      review: false,
      homeownerDashboard: false,
    },
  }
}

function normalizeLaneKey(value = '') {
  const normalized = normalizeValue(value)
  if (normalized === 'attorney' || normalized === 'transfer_attorney') return 'transfer'
  if (normalized === 'bond_attorney') return 'bond'
  return normalized
}

function dedupeByKey(items = [], keyGetter = (item) => item?.id) {
  const map = new Map()
  for (const item of items || []) {
    if (!item) continue
    const key = String(keyGetter(item) || '').trim()
    if (!key || map.has(key)) continue
    map.set(key, item)
  }
  return [...map.values()]
}

function getStageProgressPercent(mainStage = '', stage = '') {
  if (normalizeValue(stage).includes('registered')) return 100
  const map = {
    avail: 8,
    dep: 20,
    otp: 35,
    fin: 52,
    atty: 68,
    xfer: 82,
    reg: 95,
  }
  return map[normalizeValue(mainStage)] || 12
}

function getClientLaneLabel(laneKey = '') {
  const normalized = normalizeLaneKey(laneKey)
  if (normalized === 'finance') return 'Finance'
  if (normalized === 'transfer') return 'Transfer'
  if (normalized === 'bond') return 'Bond Registration'
  return 'Progress'
}

function mapLaneStepToClientText(laneKey = '', step = null, fallback = '') {
  const normalizedLane = normalizeLaneKey(laneKey)
  const stepKey = normalizeValue(step?.key)
  const byLane = {
    finance: {
      bond_application_submitted: 'Your bond application has been submitted.',
      bond_approved: 'Your bond has been approved.',
      grant_issued: 'Your grant has been issued.',
      grant_signed: 'Your grant has been signed.',
    },
    transfer: {
      buyer_fica_requested: 'Buyer verification documents have been requested.',
      buyer_fica_received: 'Buyer verification documents have been received.',
      seller_fica_requested: 'Seller verification documents have been requested.',
      seller_fica_received: 'Seller verification documents have been received.',
      transfer_duty_receipt_received: 'Transfer duty confirmation has been received.',
      rates_figures_requested: 'Rates clearance is in progress.',
      rates_payment_confirmed: 'Rates payment has been confirmed.',
      transfer_documents_prepared: 'The attorneys are preparing your transfer documents.',
      buyer_signing_scheduled: 'Buyer signing has been scheduled.',
      buyer_signed_transfer_documents: 'Buyer transfer documents have been signed.',
      seller_signing_scheduled: 'Seller signing has been scheduled.',
      seller_signed_transfer_documents: 'Seller transfer documents have been signed.',
      rates_clearance_requested: 'Rates clearance is in progress.',
      rates_clearance_uploaded: 'Rates clearance has been received.',
      rates_clearance_received: 'Rates clearance has been received.',
      levy_clearance_uploaded: 'Levy clearance has been received.',
      levy_clearance_received: 'Levy clearance has been received.',
      compliance_certificates_received: 'Compliance certificates have been received.',
      guarantees_requested: 'Guarantees have been requested.',
      guarantees_received: 'Guarantees have been received.',
      transfer_guarantees_accepted: 'Guarantees have been accepted.',
      lodgement_pack_prepared: 'The lodgement pack is being prepared.',
      lodgement_ready: 'The transfer is ready for lodgement.',
      lodgement_submitted: 'Your transfer has been lodged.',
      lodged_at_deeds_office: 'Your transfer has been lodged.',
      in_prep: 'Your transfer is in preparation for registration.',
      registration_confirmed: 'Registration has been completed.',
      registered: 'Registration has been completed.',
      registration_letter_issued: 'The registration confirmation letter has been issued.',
      matter_closed: 'The transfer matter has been closed.',
    },
    bond: {
      bond_approval_letter_received: 'Your bond approval has been received by the attorneys.',
      bond_documents_prepared: 'Your bond registration documents are being prepared.',
      buyer_bond_signing_scheduled: 'Bond signing has been scheduled.',
      buyer_signed_bond_documents: 'Bond signing has been completed.',
      bank_approval_to_lodge_received: 'The bank has approved bond lodgement.',
      guarantees_issued: 'Bond guarantees have been issued.',
      guarantee_wording_accepted: 'Bond guarantee wording has been accepted.',
      bond_lodgement_ready: 'Your bond registration is ready for lodgement.',
      bond_lodgement_submitted: 'Your bond registration has been lodged.',
      bond_lodged: 'Your bond registration has been lodged.',
      bond_registration_confirmed: 'Your bond registration has been completed.',
      bond_registered: 'Your bond registration has been completed.',
      bond_close_out_complete: 'The bond registration matter has been closed.',
    },
    cancellation: {
      cancellation_instruction_received: 'Bond cancellation has been instructed.',
      cancellation_figures_requested: 'Cancellation figures have been requested.',
      cancellation_figures_received: 'Cancellation figures have been received.',
      cancellation_guarantees_requested: 'Cancellation guarantees have been requested.',
      cancellation_guarantees_received: 'Cancellation guarantees have been received.',
      cancellation_guarantees_accepted: 'Cancellation guarantees have been accepted.',
      cancellation_lodgement_ready: 'Bond cancellation is ready for lodgement.',
      cancellation_lodged: 'Bond cancellation has been lodged.',
      cancellation_registered: 'Bond cancellation has registered.',
      cancellation_close_out_complete: 'The bond cancellation matter has been closed.',
    },
  }
  if (byLane[normalizedLane]?.[stepKey]) return byLane[normalizedLane][stepKey]
  return fallback || String(step?.label || '').trim() || 'This part of your transaction is in progress.'
}

function mapWaitingOnKeyToSummary(waitingOnKey = '') {
  const normalized = normalizeValue(waitingOnKey)
  if (normalized === 'waiting_on_client') {
    return {
      key: 'waiting_on_client',
      label: 'Waiting on you',
      description: 'We need something from you before this can move forward.',
    }
  }
  if (normalized === 'waiting_on_attorney' || normalized === 'waiting_on_transfer') {
    return {
      key: 'waiting_on_attorney',
      label: 'Waiting on Attorneys',
      description: 'The attorneys are working on the transfer steps.',
    }
  }
  if (normalized === 'waiting_on_bond' || normalized === 'waiting_on_bond_originator') {
    return {
      key: 'waiting_on_bond_originator',
      label: 'Waiting on Bond Team',
      description: 'The bond team is progressing the finance and registration steps.',
    }
  }
  if (normalized === 'waiting_on_bank') {
    return {
      key: 'waiting_on_bank',
      label: 'Waiting on Bank',
      description: 'The bank is reviewing your bond application.',
    }
  }
  if (normalized === 'waiting_on_deeds_office' || normalized === 'lodged') {
    return {
      key: 'waiting_on_deeds_office',
      label: 'Waiting on Deeds Office',
      description: 'The Deeds Office is processing the lodged registration.',
    }
  }
  return {
    key: 'in_progress',
    label: 'In Progress',
    description: 'Your transaction team is actively progressing this step.',
  }
}

function buildWorkflowSummary({
  workflowReadModel = null,
  lifecycle = {},
  transaction = null,
  financeType = '',
  workspaceMode = 'buying',
  nextActions = [],
} = {}) {
  const fallbackStageKey = resolvePortalStageKey({
    mainStage: lifecycle?.mainStage || transaction?.current_main_stage || '',
    stage: lifecycle?.stage || transaction?.stage || '',
    financeType,
    workspace: workspaceMode,
  })
  const stageContent = getEducationalContentForStage(fallbackStageKey)
  const stageLabel = stageContent?.title || 'In Progress'

  const lanesRaw = Array.isArray(workflowReadModel?.lanes) ? workflowReadModel.lanes : []
  const activeLanes = lanesRaw
    .map((lane) => ({
      laneKey: normalizeLaneKey(lane?.laneKey),
      laneLabel: getClientLaneLabel(lane?.laneKey),
      status: String(lane?.status || 'not_started').trim(),
      progressPercent: Number(lane?.readiness?.completionPercent || 0),
      currentStep: mapLaneStepToClientText(lane?.laneKey, lane?.readiness?.currentStep, ''),
      nextStep: mapLaneStepToClientText(
        lane?.laneKey,
        lane?.readiness?.nextStep,
        'Your transaction team is progressing this lane.',
      ),
      visibleToClient: lane?.visibleToClient !== false,
    }))
    .filter((lane) => lane.visibleToClient && ['finance', 'transfer', 'bond'].includes(lane.laneKey))
    .filter((lane) => !(lane.laneKey === 'bond' && ['cash'].includes(normalizeValue(financeType))))

  const stageProgress = getStageProgressPercent(
    lifecycle?.mainStage || transaction?.current_main_stage || '',
    lifecycle?.stage || transaction?.stage || '',
  )
  const laneProgressValues = activeLanes.map((lane) => Number(lane.progressPercent || 0)).filter((value) => Number.isFinite(value))
  const laneAverageProgress = laneProgressValues.length
    ? Math.round(laneProgressValues.reduce((total, value) => total + value, 0) / laneProgressValues.length)
    : stageProgress
  const progressPercent = Math.max(stageProgress, laneAverageProgress)

  const rawClientBlockers = (workflowReadModel?.blockers || []).filter((item) => item?.visibility === 'client_visible')
  const blockers = dedupeByKey(
    rawClientBlockers.map((item, index) => ({
      id:
        item?.id ||
        `${item?.type || 'blocker'}_${item?.relatedEntityType || 'entity'}_${item?.relatedEntityId || index}`,
      type: item?.type || 'workflow_blocker',
      title: item?.title || 'Action required',
      description: item?.description || 'Something is still needed before we can progress this step.',
      relatedEntityType: item?.relatedEntityType || '',
      relatedEntityId: item?.relatedEntityId || '',
    })),
    (item) => item.id,
  )

  const hasBlockingClientAction = (nextActions || []).some((action) => action?.blocking)
  const waitingOnKeys = []
  if (hasBlockingClientAction || blockers.length) {
    waitingOnKeys.push('waiting_on_client')
  } else {
    const coordinationStatus = normalizeValue(workflowReadModel?.coordination?.status)
    if (coordinationStatus === 'waiting_on_transfer') waitingOnKeys.push('waiting_on_attorney')
    if (coordinationStatus === 'waiting_on_bond') waitingOnKeys.push('waiting_on_bond_originator')
    if (coordinationStatus === 'lodged') waitingOnKeys.push('waiting_on_deeds_office')

    const financeLane = activeLanes.find((lane) => lane.laneKey === 'finance' && lane.status !== 'completed')
    if (financeLane && ['bond', 'hybrid', 'combination'].includes(normalizeValue(financeType))) {
      waitingOnKeys.push('waiting_on_bank')
    }
    const transferLane = activeLanes.find((lane) => lane.laneKey === 'transfer' && lane.status !== 'completed')
    if (transferLane) waitingOnKeys.push('waiting_on_attorney')
    const bondLane = activeLanes.find((lane) => lane.laneKey === 'bond' && lane.status !== 'completed')
    if (bondLane) waitingOnKeys.push('waiting_on_bond_originator')
  }

  const waitingOn = dedupeByKey(waitingOnKeys.map(mapWaitingOnKeyToSummary), (item) => item.key)

  const sharedProgressMilestones = (workflowReadModel?.sharedProgress || []).map((progress, index) => ({
    id: progress?.id || `shared-progress-${progress?.processKey || 'process'}-${progress?.stepKey || index}`,
    key: progress?.stepKey || 'transaction_updated',
    title: progress?.title || 'Transaction update',
    summary: progress?.safeExplanation || progress?.description || 'Your transaction has progressed.',
    updatedAt: progress?.lastUpdated || progress?.updatedAt || null,
  }))
  const clientVisibleMilestones = dedupeByKey(
    [...sharedProgressMilestones, ...(workflowReadModel?.clientVisibleMilestones || [])].map((milestone, index) => ({
      id: milestone?.id || `milestone_${milestone?.key || 'update'}_${index}`,
      key: milestone?.key || 'transaction_updated',
      title: milestone?.title || 'Transaction update',
      summary: milestone?.summary || 'Your transaction has a new update.',
      updatedAt: milestone?.updatedAt || null,
    })),
    (item) => item.id,
  )

  const nextStepFromLane = activeLanes.find((lane) => lane.status !== 'completed') || null
  const nextClientAction = (nextActions || []).find((action) => action?.blocking) || (nextActions || [])[0] || null
  const nextStep = nextClientAction
    ? {
        title: nextClientAction?.title || 'Next step',
        description: nextClientAction?.description || 'Please complete your next required action.',
        actionRequired: true,
      }
    : nextStepFromLane
      ? {
          title: nextStepFromLane?.laneLabel || 'Next step',
          description: nextStepFromLane?.nextStep || 'Your team is progressing this transaction.',
          actionRequired: false,
        }
      : {
          title: 'In Progress',
          description: 'Your transaction team is progressing the next steps.',
          actionRequired: false,
        }

  let overallStatus = 'in_progress'
  if (progressPercent >= 100 || normalizeValue(lifecycle?.mainStage) === 'reg' && normalizeValue(lifecycle?.stage).includes('registered')) {
    overallStatus = 'completed'
  } else if (hasBlockingClientAction || blockers.length) {
    overallStatus = 'action_required'
  }

  return {
    currentStage: String(lifecycle?.stage || transaction?.stage || '').trim() || 'In Progress',
    currentStageLabel: stageLabel,
    currentStageDescription: stageContent?.shortDescription || 'Your transaction is currently in progress.',
    overallStatus,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    activeLanes,
    clientVisibleMilestones,
    waitingOn,
    blockers,
    nextStep,
  }
}

function hasActiveSellingContext(contexts = []) {
  return (contexts || []).some((context) => {
    const type = String(context?.contextType || context?.context_type || '').trim().toLowerCase()
    const status = String(context?.status || '').trim().toLowerCase()
    return type === 'selling' && ['active', 'pending'].includes(status)
  })
}

function resolveWorkspaceMode({ requestedWorkspace = 'shared', hasBuyingContext = true, hasSellingContext = false } = {}) {
  const normalizedWorkspace = normalizeWorkspace(requestedWorkspace)
  if (normalizedWorkspace === 'selling') {
    return hasSellingContext ? 'selling' : (hasBuyingContext ? 'buying' : 'shared')
  }
  if (normalizedWorkspace === 'buying') {
    return hasBuyingContext ? 'buying' : (hasSellingContext ? 'selling' : 'shared')
  }
  if (hasBuyingContext && hasSellingContext) return 'shared'
  if (hasSellingContext) return 'selling'
  return 'buying'
}

function normalizeDocumentStatus(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable', 'cancelled'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'accepted') return 'approved'
  if (normalized === 'missing') return 'required'
  if (normalized === 'reupload_required' || normalized === 'needs_reupload' || normalized === 'needs_re_upload') return 'rejected'
  if (normalized === 'pending_review' || normalized === 'in_review' || normalized === 'awaiting_review') return 'under_review'
  if (normalized === 'not_uploaded' || normalized === 'outstanding') return 'required'
  return 'required'
}

function normalizeAdditionalRequestAudience(request = {}) {
  const requestedFrom = String(request?.requestedFrom || request?.requested_from || '').trim().toLowerCase()
  if (!requestedFrom) {
    return { buyer: true, seller: false }
  }
  return {
    buyer: requestedFrom === 'buyer' || requestedFrom === 'buyer_and_seller',
    seller: requestedFrom === 'seller' || requestedFrom === 'buyer_and_seller',
  }
}

function inferRequirementAudience(requirement = {}) {
  const expectedFromRole = normalizeValue(
    requirement?.expectedFromRole ||
      requirement?.expected_from_role ||
      requirement?.required_from_role ||
      requirement?.requestedFrom ||
      requirement?.requested_from,
  )
  if (expectedFromRole === 'seller') {
    return { buyer: false, seller: true }
  }
  if (expectedFromRole === 'buyer') {
    return { buyer: true, seller: false }
  }

  const signal = String(
    requirement?.key ||
      requirement?.label ||
      requirement?.document_label ||
      requirement?.document_key ||
      '',
  ).toLowerCase()

  if (signal.includes('mandate') || signal.includes('seller')) {
    return { buyer: false, seller: true }
  }
  if (
    signal.includes('otp') ||
    signal.includes('bond') ||
    signal.includes('proof_of_funds') ||
    signal.includes('proof of funds')
  ) {
    return { buyer: true, seller: false }
  }

  return { buyer: true, seller: true }
}

function filterRequiredDocumentsByWorkspace(requiredDocuments = [], workspaceMode = 'buying') {
  return (requiredDocuments || []).filter((requirement) => {
    const visibility = normalizeValue(requirement?.visibilityScope || requirement?.visibility_scope || 'client')
    if (visibility === 'internal' || visibility === 'internal_only') return false
    const audience = inferRequirementAudience(requirement)
    if (workspaceMode === 'selling') return audience.seller
    if (workspaceMode === 'buying') return audience.buyer
    return audience.buyer || audience.seller
  })
}

function filterAdditionalRequestsByWorkspace(requests = [], workspaceMode = 'buying') {
  return (requests || []).filter((request) => {
    const visibility = String(request?.visibility || request?.visibility_scope || '').trim().toLowerCase()
    const clientVisible = request?.clientVisible === true || visibility === 'client_visible' || visibility === 'client'
    if (!clientVisible) return false

    const audience = normalizeAdditionalRequestAudience(request)
    if (workspaceMode === 'selling') return audience.seller
    if (workspaceMode === 'buying') return audience.buyer
    return audience.buyer || audience.seller
  })
}

function normalizeDocumentMatchKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isSignedMandateRequirement(requirement = {}) {
  const source = normalizeDocumentMatchKey([
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    requirement?.name,
  ].filter(Boolean).join(' '))
  return source.includes('signed_mandate') || source.includes('mandate_signature') || (source.includes('mandate') && source.includes('signed'))
}

function isSignedMandateDocument(document = {}) {
  const source = normalizeDocumentMatchKey([
    document?.requirementKey,
    document?.requirement_key,
    document?.document_type,
    document?.documentType,
    document?.category,
    document?.document_category,
    document?.name,
    document?.document_name,
  ].filter(Boolean).join(' '))
  return source.includes('mandate_signature') || source.includes('signed_mandate') || (source.includes('mandate') && source.includes('signed'))
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const requirementId = String(requirement?.id || requirement?.requirement_id || '').trim()
  const documentRequirementId = String(document?.requirementId || document?.requirement_id || '').trim()
  if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true

  if (isSignedMandateRequirement(requirement) && isSignedMandateDocument(document)) return true

  const requirementKey = normalizeDocumentMatchKey(requirement?.key || requirement?.requirement_key)
  const documentRequirementKey = normalizeDocumentMatchKey(document?.requirementKey || document?.requirement_key)
  const documentType = normalizeDocumentMatchKey(document?.document_type || document?.documentType)
  const documentCategory = normalizeDocumentMatchKey(document?.category || document?.document_category)
  return Boolean(
    requirementKey &&
      (
        documentRequirementKey === requirementKey ||
        documentType === requirementKey ||
        documentCategory === requirementKey
      ),
  )
}

function findUploadedDocumentForRequirement(uploadedDocuments = [], requirement = {}) {
  return (uploadedDocuments || []).find((document) => documentMatchesRequirement(document, requirement)) || null
}

function toDisplayText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function getDocumentLookupKeys(document = {}) {
  return [
    document?.id,
    document?.file_path,
    document?.storage_path,
    document?.url,
    document?.file_url,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function getDocumentIdentity(document = {}, fallback = 'document') {
  return toDisplayText(
    document?.id ||
      document?.file_path ||
      document?.storage_path ||
      document?.url ||
      document?.file_url ||
      document?.document_name ||
      document?.name,
    fallback,
  )
}

function buildUploadedDocumentsLookup(uploadedDocuments = []) {
  const lookup = new Map()
  ;(uploadedDocuments || []).forEach((document) => {
    getDocumentLookupKeys(document).forEach((key) => lookup.set(key, document))
  })
  return lookup
}

function findUploadedDocumentForAdditionalRequest(uploadedDocuments = [], request = {}, uploadedDocumentsById = new Map()) {
  const linkedDocumentId = toDisplayText(
    request?.requestedDocumentId ||
      request?.requested_document_id ||
      request?.uploadedDocumentId ||
      request?.uploaded_document_id,
  )
  if (linkedDocumentId && uploadedDocumentsById.has(linkedDocumentId)) {
    return uploadedDocumentsById.get(linkedDocumentId)
  }

  const requestKey = normalizeDocumentMatchKey(
    request?.documentKey ||
      request?.document_key ||
      request?.documentName ||
      request?.document_name ||
      request?.title,
  )
  if (!requestKey) return null
  return (uploadedDocuments || []).find((document) => {
    const documentKey = normalizeDocumentMatchKey(
      document?.requirementKey ||
        document?.requirement_key ||
        document?.document_type ||
        document?.documentType ||
        document?.category ||
        document?.document_category ||
        document?.name ||
        document?.document_name,
    )
    return documentKey === requestKey
  }) || null
}

function resolveStatusWithLinkedUpload(sourceStatus = '', linkedDocument = null) {
  const normalizedStatus = normalizeDocumentStatus(sourceStatus)
  if (!linkedDocument || !['required', 'requested'].includes(normalizedStatus)) {
    return normalizedStatus
  }
  return normalizeDocumentStatus(linkedDocument?.status || 'uploaded')
}

function getDocumentEducationText(...values) {
  const lookup = values.map((value) => String(value || '').trim()).find(Boolean)
  if (!lookup) return ''
  return getEducationalContentForDocument(lookup)?.shortExplanation || ''
}

function buildRequirementDocumentCenterItem(requirement = {}, uploadedDocumentsById = new Map(), uploadedDocuments = []) {
  const key = toDisplayText(requirement?.key || requirement?.requirement_key || requirement?.id || requirement?.label, 'required-document')
  const title = toDisplayText(requirement?.label || requirement?.requirement_name || requirement?.name, 'Required document')
  const embeddedLinkedDocument =
    requirement?.uploadedDocument && typeof requirement.uploadedDocument === 'object'
      ? requirement.uploadedDocument
      : requirement?.uploaded_document && typeof requirement.uploaded_document === 'object'
        ? requirement.uploaded_document
        : null
  const uploadedDocumentId = toDisplayText(requirement?.uploadedDocumentId || requirement?.uploaded_document_id)
  const linkedDocument =
    embeddedLinkedDocument ||
    (uploadedDocumentId ? uploadedDocumentsById.get(uploadedDocumentId) || null : findUploadedDocumentForRequirement(uploadedDocuments, requirement))
  const status = resolveStatusWithLinkedUpload(requirement?.requiredDocumentStatus || requirement?.status, linkedDocument)
  const uploadAllowed = !['approved', 'completed', 'not_applicable', 'cancelled'].includes(status)

  return {
    id: `required_${key}`,
    sourceId: key,
    sourceType: 'required_document',
    title,
    description: toDisplayText(requirement?.description || requirement?.requirement_description, 'This document is needed before your transaction can move forward.'),
    education: getDocumentEducationText(key, title),
    group: toDisplayText(requirement?.requirement_group || requirement?.group || requirement?.groupKey),
    status,
    rejectionReason: toDisplayText(requirement?.rejectionReason || requirement?.rejection_reason || linkedDocument?.rejectionReason || linkedDocument?.rejection_reason),
    linkedDocument,
    hasUploadedDocument: Boolean(linkedDocument?.id || linkedDocument?.file_path || linkedDocument?.url),
    uploadKey: key,
    uploadSpec: uploadAllowed
      ? {
          type: 'requirement',
          requirementKey: key,
        }
      : null,
    openLabel: '',
    metaLine: toDisplayText(requirement?.requestedBy || requirement?.requested_by_name),
    dueDate: requirement?.dueDate || requirement?.due_date || null,
    requestedBy: requirement?.requestedBy || requirement?.requested_by_name || '',
    visibility: requirement?.visibility || requirement?.visibility_scope || 'client',
    isCoreRequirement: true,
  }
}

function buildAdditionalRequestDocumentCenterItem(request = {}, uploadedDocumentsById = new Map(), uploadedDocuments = []) {
  const requestId = toDisplayText(request?.id || request?.request_id || request?.title, 'additional-request')
  const linkedDocument = findUploadedDocumentForAdditionalRequest(uploadedDocuments, request, uploadedDocumentsById)
  const status = resolveStatusWithLinkedUpload(request?.status || 'requested', linkedDocument)
  const requester = toDisplayText(request?.requestedBy || request?.requested_by_name || request?.createdByName || request?.created_by_name, 'Transaction team')
  const requesterRole = toDisplayText(request?.requestedByRole || request?.requested_by_role || request?.createdByRole || request?.created_by_role)
  const dueDate = request?.dueDate || request?.due_date || null
  const priority = toDisplayText(request?.priority || request?.additionalPriority)
  const uploadAllowed = !['approved', 'completed', 'not_applicable', 'cancelled'].includes(status)
  const title = toDisplayText(request?.documentName || request?.document_name || request?.title, 'Additional document request')

  return {
    id: `additional_${requestId}`,
    sourceId: requestId,
    sourceType: 'additional_request',
    title,
    description: toDisplayText(request?.notes || request?.description, 'An additional document has been requested for your transaction.'),
    education: getDocumentEducationText(request?.documentKey || request?.document_key, title),
    group: 'additional',
    status,
    rejectionReason: toDisplayText(request?.rejectionReason || request?.rejection_reason || linkedDocument?.rejectionReason || linkedDocument?.rejection_reason),
    linkedDocument,
    hasUploadedDocument: Boolean(linkedDocument?.id || linkedDocument?.file_path || linkedDocument?.url),
    uploadKey: `additional_request_${requestId}`,
    uploadSpec: uploadAllowed
      ? {
          type: 'additional_request',
          requestId,
        }
      : null,
    metaLine: `${requester}${requesterRole ? ` • ${requesterRole.replaceAll('_', ' ')}` : ''}${dueDate ? ` • Due ${dueDate}` : ''}${priority ? ` • ${priority}` : ''}`,
    dueDate,
    requestedBy: requester,
    visibility: request?.visibility || request?.visibility_scope || 'client_visible',
    isCoreRequirement: false,
  }
}

function buildUploadedDocumentCenterItem(document = {}) {
  const id = getDocumentIdentity(document, 'uploaded-document')
  const title = toDisplayText(document?.name || document?.document_name, 'Uploaded document')
  const category = toDisplayText(document?.category || document?.document_type)
  return {
    id: `uploaded_${id}`,
    sourceId: id,
    sourceType: 'uploaded_document',
    title,
    description: toDisplayText(document?.category || document?.document_type, 'Your uploaded document is waiting for review.'),
    education: getDocumentEducationText(document?.requirementKey || document?.requirement_key || document?.document_type, title),
    group: category,
    status: normalizeDocumentStatus(document?.status || 'uploaded'),
    rejectionReason: toDisplayText(document?.rejectionReason || document?.rejection_reason),
    linkedDocument: document,
    hasUploadedDocument: true,
    uploadKey: '',
    uploadSpec: null,
    metaLine: document?.created_at ? `Uploaded ${new Date(document.created_at).toLocaleDateString('en-ZA')}` : '',
    visibility: document?.visibility || document?.visibility_scope || 'client',
    isCoreRequirement: false,
  }
}

function dedupeDocumentCenterItems(items = []) {
  const seen = new Set()
  return (items || []).filter((item) => {
    const key = String(item?.id || '').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getMandatePacketFinalSignedFilePath(mandatePacket = null) {
  return String(
    mandatePacket?.finalSignedFilePath ||
      mandatePacket?.final_signed_file_path ||
      mandatePacket?.version?.final_signed_file_path ||
      mandatePacket?.version?.finalSignedFilePath ||
      '',
  ).trim()
}

function getMandatePacketFinalSignedUrl(mandatePacket = null) {
  return String(
    mandatePacket?.finalSignedDownloadUrl ||
      mandatePacket?.finalSignedFileAccessUrl ||
      mandatePacket?.final_signed_file_url ||
      mandatePacket?.version?.final_signed_file_access_url ||
      mandatePacket?.version?.final_signed_file_url ||
      '',
  ).trim()
}

function isMandatePacketFinalSigned(mandatePacket = null) {
  if (!mandatePacket || typeof mandatePacket !== 'object') return false
  const state = normalizeValue(mandatePacket?.state || mandatePacket?.status || mandatePacket?.packet?.status)
  const hasFinalArtifact = Boolean(
    getMandatePacketFinalSignedFilePath(mandatePacket) ||
      getMandatePacketFinalSignedUrl(mandatePacket),
  )
  return hasFinalArtifact && [
    'fully_signed',
    'signed',
    'completed',
    'complete',
    'finalised',
    'finalized',
    'archived',
  ].includes(state)
}

function getPortalSellerEmail(portalData = {}) {
  return String(
    portalData?.buyer?.email ||
      portalData?.activeSellingContext?.clientEmail ||
      portalData?.activeSellingContext?.client_email ||
      portalData?.listing?.seller?.email ||
      '',
  ).trim()
}

function getPortalMandatePacketId(portalData = {}) {
  return String(
    portalData?.activeSellingContext?.mandatePacketId ||
      portalData?.activeSellingContext?.mandate_packet_id ||
      portalData?.activeSellingContext?.mandatePacket?.id ||
      portalData?.activeSellingContext?.mandatePacket?.packet?.id ||
      portalData?.listing?.mandatePacketId ||
      portalData?.listing?.mandate_packet_id ||
      '',
  ).trim()
}

async function hydrateSellerMandatePacketForPortalData(token, portalData = {}, workspaceMode = 'buying') {
  if (workspaceMode !== 'selling') return portalData
  const existingPacket = portalData?.activeSellingContext?.mandatePacket || null
  if (isMandatePacketFinalSigned(existingPacket)) return portalData

  const mandatePacketId = getPortalMandatePacketId(portalData)
  const sellerLeadId = String(
    portalData?.activeSellingContext?.sellerLeadId ||
      portalData?.activeSellingContext?.seller_lead_id ||
      portalData?.listing?.sellerLeadId ||
      portalData?.listing?.seller_lead_id ||
      '',
  ).trim()

  if (!mandatePacketId && !sellerLeadId) return portalData

  try {
    const resolvedPacket = await fetchClientPortalMandatePacketSummaryByToken(token, {
      mandatePacketId,
      sellerLeadId,
      clientEmail: getPortalSellerEmail(portalData),
    })
    if (!resolvedPacket) return portalData
    const resolvedPacketId = mandatePacketId || resolvedPacket?.packet?.id || resolvedPacket?.id || ''
    return {
      ...portalData,
      listing: {
        ...(portalData?.listing || {}),
        mandatePacketId: portalData?.listing?.mandatePacketId || portalData?.listing?.mandate_packet_id || resolvedPacketId,
        mandate_packet_id: portalData?.listing?.mandate_packet_id || portalData?.listing?.mandatePacketId || resolvedPacketId,
        mandateStatus: resolvedPacket?.state || portalData?.listing?.mandateStatus || portalData?.listing?.mandate_status || '',
        mandate_status: resolvedPacket?.state || portalData?.listing?.mandate_status || portalData?.listing?.mandateStatus || '',
        mandatePacket: resolvedPacket,
      },
      activeSellingContext: {
        ...(portalData?.activeSellingContext || {}),
        mandatePacketId: resolvedPacketId,
        mandatePacket: resolvedPacket,
        mandateStatus: resolvedPacket?.state || portalData?.activeSellingContext?.mandateStatus || '',
      },
    }
  } catch (error) {
    console.warn('[client-portal-documents] Signed mandate packet unavailable', {
      mandatePacketId: mandatePacketId || null,
      sellerLeadId: sellerLeadId || null,
      error,
    })
    return portalData
  }
}

function buildSignedMandateDocumentFromPacket(portalData = {}, workspaceMode = 'buying') {
  if (workspaceMode !== 'selling') return null
  const mandatePacket = portalData?.activeSellingContext?.mandatePacket || portalData?.mandate?.packet || null
  const finalSignedFilePath = getMandatePacketFinalSignedFilePath(mandatePacket)
  const finalSignedUrl = getMandatePacketFinalSignedUrl(mandatePacket)
  if (!isMandatePacketFinalSigned(mandatePacket)) return null

  const packetId = String(mandatePacket?.packet?.id || mandatePacket?.id || '').trim()
  const versionId = String(mandatePacket?.version?.id || '').trim()
  const fileName = String(
    mandatePacket?.finalSignedFileName ||
      mandatePacket?.version?.final_signed_file_name ||
      'Signed Mandate',
  ).trim()
  return {
    id: `mandate-final-signed-${versionId || packetId || finalSignedFilePath || finalSignedUrl}`,
    name: fileName,
    document_name: fileName,
    category: 'mandate_signature',
    document_type: 'mandate_signature',
    file_path: finalSignedFilePath,
    file_bucket: String(mandatePacket?.finalSignedFileBucket || mandatePacket?.version?.final_signed_file_bucket || '').trim(),
    url: finalSignedUrl,
    openDirectUrl: Boolean(finalSignedUrl),
    status: 'completed',
    visibility: 'seller_visible',
    created_at:
      mandatePacket?.version?.finalised_at ||
      mandatePacket?.version?.finalized_at ||
      mandatePacket?.version?.generated_at ||
      mandatePacket?.packet?.updated_at ||
      null,
  }
}

export function buildDocumentCenter(portalData, workspaceMode = 'buying') {
  const requiredDocumentsRaw = Array.isArray(portalData?.requiredDocuments) ? portalData.requiredDocuments : []
  const signedMandateDocument = buildSignedMandateDocumentFromPacket(portalData, workspaceMode)
  const uploadedDocuments = [
    ...(signedMandateDocument ? [signedMandateDocument] : []),
    ...(Array.isArray(portalData?.documents) ? portalData.documents : []),
  ]
  const uploadedDocumentsById = buildUploadedDocumentsLookup(uploadedDocuments)
  const requiredDocuments = filterRequiredDocumentsByWorkspace(requiredDocumentsRaw, workspaceMode)
    .map((requirement) => {
      const uploadedDocument = findUploadedDocumentForRequirement(uploadedDocuments, requirement)
      if (!uploadedDocument) return requirement
      const uploadedStatus = normalizeDocumentStatus(uploadedDocument?.status || 'uploaded')
      return {
        ...requirement,
        status: ['required', 'requested'].includes(normalizeDocumentStatus(requirement?.status || requirement?.requiredDocumentStatus || ''))
          ? uploadedStatus
          : requirement?.status || uploadedStatus,
        requiredDocumentStatus: uploadedStatus,
        complete: ['uploaded', 'under_review', 'approved', 'completed'].includes(uploadedStatus),
        isUploaded: true,
        uploadedDocumentId: uploadedDocument.id || uploadedDocument.file_path || uploadedDocument.storage_path || null,
        uploaded_document_id: uploadedDocument.id || uploadedDocument.file_path || uploadedDocument.storage_path || null,
        uploadedDocument,
        uploaded_document: uploadedDocument,
      }
    })
  const additionalRequests = filterAdditionalRequestsByWorkspace(
    Array.isArray(portalData?.additionalDocumentRequests) ? portalData.additionalDocumentRequests : [],
    workspaceMode,
  )
  const requiredItems = requiredDocuments.map((requirement) =>
    buildRequirementDocumentCenterItem(requirement, uploadedDocumentsById, uploadedDocuments),
  )
  const additionalItems = additionalRequests.map((request) =>
    buildAdditionalRequestDocumentCenterItem(request, uploadedDocumentsById, uploadedDocuments),
  )
  const linkedUploadedDocumentIds = new Set(
    [...requiredDocuments, ...additionalItems]
      .map((item) => String(item?.uploadedDocumentId || item?.uploaded_document_id || '').trim())
      .filter(Boolean),
  )
  additionalItems.forEach((item) => {
    getDocumentLookupKeys(item?.linkedDocument || {}).forEach((key) => linkedUploadedDocumentIds.add(key))
  })

  const statusFromDocument = (document = {}) =>
    normalizeDocumentStatus(document?.requiredDocumentStatus || document?.status || '')

  const approvedDocuments = requiredDocuments.filter((item) => {
    const status = statusFromDocument(item)
    return status === 'approved' || status === 'completed'
  })

  const rejectedDocuments = requiredDocuments.filter((item) => statusFromDocument(item) === 'rejected')
  const signedDocuments = uploadedDocuments.filter((document) => {
    const documentId = String(document?.id || document?.file_path || document?.storage_path || '').trim()
    if (documentId && linkedUploadedDocumentIds.has(documentId)) return false
    if (requiredDocuments.some((requirement) => documentMatchesRequirement(document, requirement))) return false
    const source = `${document?.document_type || ''} ${document?.name || ''} ${document?.category || ''}`.toLowerCase()
    return /signed|signature|otp|mandate/.test(source)
  })
  const linkedUploadedDocumentKeys = new Set(
    [...requiredItems, ...additionalItems]
      .flatMap((item) => getDocumentLookupKeys(item?.linkedDocument || {})),
  )
  const standaloneUploadedItems = uploadedDocuments
    .filter((document) => !getDocumentLookupKeys(document).some((key) => linkedUploadedDocumentKeys.has(key)))
    .map((document) => buildUploadedDocumentCenterItem(document))
  const items = dedupeDocumentCenterItems([...requiredItems, ...additionalItems, ...standaloneUploadedItems])
  const activeItems = items.filter((item) => !['cancelled', 'not_applicable'].includes(normalizeDocumentStatus(item?.status)))
  const summary = activeItems.reduce(
    (accumulator, item) => {
      const status = normalizeDocumentStatus(item?.status)
      accumulator.total += 1
      if (status === 'rejected') accumulator.rejected += 1
      else if (status === 'required' || status === 'requested') accumulator.outstanding += 1
      else if (status === 'uploaded') accumulator.uploaded += 1
      else if (status === 'under_review') accumulator.underReview += 1
      else if (status === 'approved' || status === 'completed') accumulator.approved += 1
      if (['required', 'requested', 'rejected'].includes(status)) accumulator.blocking += 1
      return accumulator
    },
    { total: 0, outstanding: 0, uploaded: 0, underReview: 0, approved: 0, rejected: 0, blocking: 0 },
  )

  return {
    requiredDocuments,
    additionalRequests,
    uploadedDocuments,
    approvedDocuments,
    rejectedDocuments,
    signedDocuments,
    items,
    summary,
    canonicalRequirements: Array.isArray(portalData?.canonicalRequirements) ? portalData.canonicalRequirements : [],
  }
}

async function fetchCanonicalDocumentRequirementsForPortal(portalData = {}) {
  // Public client portals must use requirements already returned by their
  // token-scoped payload. Direct table access is intentionally blocked by RLS.
  const embeddedRequirements = Array.isArray(portalData?.canonicalRequirements)
    ? portalData.canonicalRequirements
    : []
  return embeddedRequirements
}

function buildLifecycle(portalData = {}) {
  const stage = portalData?.stage || portalData?.transaction?.stage || ''
  const mainStage = portalData?.mainStage || portalData?.transaction?.current_main_stage || ''
  return {
    stage,
    mainStage,
    updatedAt: portalData?.lastUpdated || portalData?.transaction?.updated_at || portalData?.transaction?.created_at || null,
  }
}

function buildTimeline(portalData = {}) {
  const discussion = Array.isArray(portalData?.discussion) ? portalData.discussion : []
  const events = Array.isArray(portalData?.events) ? portalData.events : []
  return {
    discussion,
    events,
    latestUpdateAt:
      discussion[0]?.createdAt ||
      discussion[0]?.created_at ||
      portalData?.lastUpdated ||
      portalData?.transaction?.updated_at ||
      null,
  }
}

function annotateNextActionsWithEducation(nextActions = []) {
  return (nextActions || []).map((action) => {
    const content = getEducationalContentForAction(action?.type || '')
    return {
      ...action,
      educationalSummary: content?.shortExplanation || '',
    }
  })
}

function buildRoleEducation(rolePlayers = {}) {
  const roles = [
    rolePlayers?.team?.assignedAgent ? 'agent' : '',
    rolePlayers?.team?.assignedAttorney ? 'attorney' : '',
    rolePlayers?.team?.assignedBondOriginator ? 'bond_originator' : '',
    rolePlayers?.team?.assignedAgent || rolePlayers?.team?.assignedAttorney ? 'developer' : '',
  ].filter(Boolean)
  return roles.map((role) => getEducationalContentForRole(role))
}

function buildLegacyPortalPayload({ portalData, contexts, hasBuyingContext, hasSellingContext, workspaceMode }) {
  const roles = hasSellingContext ? (hasBuyingContext === false ? ['seller'] : ['buyer', 'seller']) : ['buyer']
  const portalContexts = (() => {
    const rows = Array.isArray(contexts) ? contexts : []
    if (!hasSellingContext || !portalData?.activeSellingContext) return rows
    const sellingContext = {
      ...portalData.activeSellingContext,
      contextType: 'selling',
    }
    const withoutSyntheticSelling = rows.filter((context) => {
      const type = String(context?.contextType || context?.context_type || '').trim().toLowerCase()
      return type !== 'selling'
    })
    return [...withoutSyntheticSelling, sellingContext]
  })()
  const additionalDocumentRequests = filterAdditionalRequestsByWorkspace(
    Array.isArray(portalData?.additionalDocumentRequests) ? portalData.additionalDocumentRequests : [],
    workspaceMode,
  )

  return {
    ...portalData,
    additionalDocumentRequests,
    __portalType: hasBuyingContext === false && hasSellingContext ? 'seller' : 'buyer',
    __workspaceRoles: roles,
    __portalContexts: portalContexts,
    __hasBuyingContext: hasBuyingContext !== false,
    __hasSellingContext: Boolean(hasSellingContext),
  }
}

export async function resolveClientPortalContext(token) {
  const contextsResult = await fetchClientPortalContextsByToken(token).catch((error) => {
    if (isSellerOnboardingToken(token) && isInvalidClientPortalLinkError(error)) {
      return {
        contexts: [
          {
            id: token,
            contextType: 'selling',
            status: 'active',
            sellerWorkspaceToken: token,
          },
        ],
        hasBuyingContext: false,
        hasSellingContext: true,
      }
    }
    console.warn('[client-portal-context] Failed to resolve contexts', { token, error })
    return { contexts: [], hasBuyingContext: true, hasSellingContext: false }
  })
  const contexts = Array.isArray(contextsResult?.contexts) ? contextsResult.contexts : []
  const hasSellingContext = Boolean(contextsResult?.hasSellingContext || hasActiveSellingContext(contexts))
  const hasBuyingContext = contextsResult?.hasBuyingContext !== false

  return {
    contexts,
    hasBuyingContext,
    hasSellingContext,
    workspaceRoles: hasSellingContext ? (hasBuyingContext ? ['buyer', 'seller'] : ['seller']) : ['buyer'],
  }
}

async function fetchPortalDataForWorkspace(token, mode = 'full', options = {}) {
  if (isSellerOnboardingToken(token)) {
    return fetchSellerClientPortalDataByToken(token, {
      sellerPortalAccessToken: options?.sellerPortalAccessToken,
    })
  }

  return mode === 'core'
    ? await fetchClientPortalCoreByToken(token)
    : await fetchClientPortalByToken(token)
}

function buildDemoClientPortalWorkspaceData(token, workspace = 'shared') {
  const seed = getDemoClientPortalSeedData(token)
  if (!seed?.portalData) return null

  const contexts = Array.isArray(seed.contexts) ? seed.contexts : []
  const context = {
    contexts,
    hasBuyingContext: seed.hasBuyingContext !== false,
    hasSellingContext: Boolean(seed.hasSellingContext),
    workspaceRoles: Array.isArray(seed.workspaceRoles) && seed.workspaceRoles.length
      ? seed.workspaceRoles
      : (seed.hasSellingContext ? ['seller'] : ['buyer']),
  }
  const workspaceMode = resolveWorkspaceMode({
    requestedWorkspace: workspace,
    hasBuyingContext: context.hasBuyingContext,
    hasSellingContext: context.hasSellingContext,
  })
  let portalData = seed.portalData
  const documentCenter = {
    ...buildDocumentCenter(portalData, workspaceMode),
    canonicalRequirements: [],
  }
  const sellerPortalJourney = workspaceMode === 'selling'
    ? buildSellerPortalJourneyView({
      journey: portalData?.sellerJourney || portalData?.activeSellingContext?.sellerJourney || null,
      documentCenter,
      requiredDocuments: portalData?.requiredDocuments || portalData?.requiredDocumentChecklist || [],
      documents: portalData?.documents || [],
      offers: [
        ...(Array.isArray(portalData?.offers) ? portalData.offers : []),
        ...(Array.isArray(portalData?.activeSellingContext?.offers) ? portalData.activeSellingContext.offers : []),
      ],
    })
    : null
  if (sellerPortalJourney) {
    portalData = {
      ...portalData,
      sellerPortalJourney,
      activeSellingContext: {
        ...(portalData?.activeSellingContext || {}),
        sellerPortalJourney,
      },
    }
  }

  const appointments = Array.isArray(portalData?.appointments) ? portalData.appointments : []
  const lifecycle = buildLifecycle(portalData)
  const timeline = buildTimeline(portalData)
  const clientRole = workspaceMode === 'selling' ? 'seller' : 'buyer'
  const nextActions = annotateNextActionsWithEducation(Array.isArray(seed.nextActions) ? seed.nextActions : [])
  const workflowSummary = seed.workflowSummary || buildWorkflowSummary({
    workflowReadModel: null,
    lifecycle,
    transaction: portalData?.transaction || null,
    financeType: portalData?.transaction?.finance_type || '',
    workspaceMode,
    nextActions,
  })
  const activityFeed = Array.isArray(seed.activityFeed) ? seed.activityFeed : []
  const groupedActivityFeed = seed.groupedActivityFeed || {}
  const activityFeedSummary = seed.activityFeedSummary || {
    actionRequired: nextActions.filter((action) => action?.blocking).length,
    overdue: 0,
    dueSoon: 0,
  }
  const notifications = seed.notifications || { unreadCount: 0, items: [] }
  const rolePlayers = {
    attorney: portalData?.attorneyRolePlayers || null,
    team: portalData?.transaction ? {
      assignedAgent: portalData.transaction.assigned_agent || null,
      assignedAttorney: portalData.transaction.attorney || null,
      assignedBondOriginator: portalData.transaction.bond_originator || null,
    } : null,
  }
  const educationalContent = buildClientPortalEducationalContent({
    stage: lifecycle?.stage || portalData?.transaction?.stage || '',
    mainStage: lifecycle?.mainStage || portalData?.transaction?.current_main_stage || '',
    financeType: portalData?.transaction?.finance_type || '',
    workspace: workspaceMode,
    nextActions,
    requiredDocuments: documentCenter?.requiredDocuments || [],
  })
  const stageEducation = getEducationalContentForStage(educationalContent?.currentStage?.stageKey || '')
  const documentEducation = (documentCenter?.requiredDocuments || []).slice(0, 6).map((item) =>
    getEducationalContentForDocument(item?.key || item?.label || ''),
  )
  const legacyPortalData = buildLegacyPortalPayload({
    portalData,
    contexts,
    hasBuyingContext: context.hasBuyingContext,
    hasSellingContext: context.hasSellingContext,
    workspaceMode,
  })

  return {
    portalContext: {
      token,
      workspace: workspaceMode,
      requestedWorkspace: normalizeWorkspace(workspace),
      contexts,
      hasBuyingContext: context.hasBuyingContext,
      hasSellingContext: context.hasSellingContext,
      workspaceRoles: context.workspaceRoles,
    },
    client: portalData?.buyer || null,
    transaction: portalData?.transaction || null,
    listing: portalData?.listing || null,
    property: portalData?.unit || null,
    appointments,
    rolePlayers,
    lifecycle,
    timeline,
    nextActions,
    documentCenter,
    onboarding: portalData?.onboarding || null,
    mandate: {
      packet: portalData?.activeSellingContext?.mandatePacket || null,
    },
    finance: {
      type: portalData?.transaction?.finance_type || null,
      readiness: portalData?.buyerReadiness?.finance || null,
    },
    workflowSummary,
    mvpControlBoard: null,
    mvpTransactionHealth: null,
    activityFeed,
    groupedActivityFeed,
    activityFeedSummary,
    notifications,
    sellerJourney: portalData?.sellerJourney || portalData?.activeSellingContext?.sellerJourney || null,
    sellerPortalJourney,
    educationalContent: {
      ...educationalContent,
      currentStage: {
        ...educationalContent?.currentStage,
        ...stageEducation,
      },
      rolePlayerGuidance: buildRoleEducation(rolePlayers),
      documentGuidance: documentEducation,
    },
    visibility: {
      workspace: workspaceMode,
      buyerVisible: workspaceMode !== 'selling',
      sellerVisible: workspaceMode !== 'buying',
      clientOnly: true,
    },
    permissions: {
      canUploadDocuments: false,
      canComment: false,
      canViewActivityFeed: true,
      demoOnly: true,
      clientRole,
    },
    legacyPortalData,
  }
}

export async function getClientPortalWorkspaceData(token, workspace = 'shared', options = {}) {
  const demoWorkspaceData = buildDemoClientPortalWorkspaceData(token, workspace)
  if (demoWorkspaceData) return demoWorkspaceData

  const { mode = 'full' } = options
  const context = await resolveClientPortalContext(token)
  const workspaceMode = resolveWorkspaceMode({
    requestedWorkspace: workspace,
    hasBuyingContext: context.hasBuyingContext,
    hasSellingContext: context.hasSellingContext,
  })

  let portalData = await fetchPortalDataForWorkspace(token, mode, {
    sellerPortalAccessToken: options?.sellerPortalAccessToken,
  })
  const resolvedSellingContext = (Array.isArray(context.contexts) ? context.contexts : []).find((item) => {
    const type = String(item?.contextType || item?.context_type || '').trim().toLowerCase()
    const status = String(item?.status || '').trim().toLowerCase()
    return type === 'selling' && ['active', 'pending'].includes(status)
  }) || null
  if (resolvedSellingContext) {
    portalData = {
      ...portalData,
      activeSellingContext: {
        ...resolvedSellingContext,
        ...(portalData?.activeSellingContext || {}),
        mandatePacket:
          portalData?.activeSellingContext?.mandatePacket ||
          resolvedSellingContext?.mandatePacket ||
          null,
      },
    }
  }

  portalData = await hydrateSellerMandatePacketForPortalData(token, portalData, workspaceMode)

  const canonicalRequirements = await fetchCanonicalDocumentRequirementsForPortal(portalData, workspaceMode)
  const documentCenter = {
    ...buildDocumentCenter(portalData, workspaceMode),
    canonicalRequirements,
  }
  const sellerPortalJourney = workspaceMode === 'selling'
    ? buildSellerPortalJourneyView({
      journey: portalData?.sellerJourney || portalData?.activeSellingContext?.sellerJourney || null,
      documentCenter,
      requiredDocuments: portalData?.requiredDocuments || portalData?.requiredDocumentChecklist || [],
      documents: portalData?.documents || [],
      offers: [
        ...(Array.isArray(portalData?.offers) ? portalData.offers : []),
        ...(Array.isArray(portalData?.activeSellingContext?.offers) ? portalData.activeSellingContext.offers : []),
      ],
    })
    : null
  if (sellerPortalJourney) {
    portalData = {
      ...portalData,
      sellerPortalJourney,
      activeSellingContext: {
        ...(portalData?.activeSellingContext || {}),
        sellerPortalJourney,
      },
    }
  }
  const appointments = Array.isArray(portalData?.appointments) ? portalData.appointments : []
  const lifecycle = buildLifecycle(portalData)
  const timeline = buildTimeline(portalData)
  const clientRole = workspaceMode === 'selling' ? 'seller' : 'buyer'
  let workflowReadModel = null
  try {
    if (portalData?.transaction?.id) {
      workflowReadModel = await getTransactionWorkflowReadModel(portalData.transaction.id, {
        viewerRole: clientRole,
        canViewPrivate: false,
      }).catch((error) => {
        console.warn('[client-portal-workflow] Read-model unavailable', {
          transactionId: portalData?.transaction?.id || null,
          error,
        })
        return null
      })
    }
  } catch (workflowError) {
    console.warn('[client-portal-workflow] Failed to resolve read-model', {
      transactionId: portalData?.transaction?.id || null,
      error: workflowError,
    })
  }

  const provisionalWorkflowSummary = buildWorkflowSummary({
    workflowReadModel,
    lifecycle,
    transaction: portalData?.transaction || null,
    financeType: portalData?.transaction?.finance_type || '',
    workspaceMode,
    nextActions: [],
  })

  const activityFeedModel = buildClientPortalActivityFeedModel({
    transactionId: portalData?.transaction?.id || null,
    portalData,
    workspaceMode,
    workflowSummary: provisionalWorkflowSummary,
    workflowReadModel,
  }, clientRole)
  const activityFeed = activityFeedModel.items
  const groupedActivityFeed = activityFeedModel.grouped
  const rawNextActions = generateClientPortalNextActions({
    portalContext: {
      token,
      workspace: workspaceMode,
    },
    workspaceMode,
    portalData,
    appointments,
    documentCenter,
    onboarding: portalData?.onboarding || null,
    mandate: {
      packet: portalData?.activeSellingContext?.mandatePacket || null,
    },
    transaction: portalData?.transaction || null,
    finance: {
      type: portalData?.transaction?.finance_type || null,
      readiness: portalData?.buyerReadiness?.finance || null,
    },
    lifecycle,
    timeline,
    activityFeed,
    groupedActivityFeed,
    workflowSummary: provisionalWorkflowSummary,
    workflowReadModel,
  })
  const nextActions = annotateNextActionsWithEducation(rawNextActions)
  const workflowSummary = buildWorkflowSummary({
    workflowReadModel,
    lifecycle,
    transaction: portalData?.transaction || null,
    financeType: portalData?.transaction?.finance_type || '',
    workspaceMode,
    nextActions,
  })
  let notifications = { unreadCount: 0, items: [] }
  const notificationContext = {
    token,
    clientRole,
    workspaceMode,
    transaction: portalData?.transaction || null,
    transactionId: portalData?.transaction?.id || null,
    nextActions,
    activityFeed,
    workflowSummary,
    portalContext: {
      token,
      workspace: workspaceMode,
    },
  }
  try {
    if (mode !== 'core') {
      await Promise.all([
        syncNotificationsFromNextActions(notificationContext),
        syncNotificationsFromActivityFeed(notificationContext),
      ])
    }
    notifications = await getClientPortalNotifications(token, clientRole)
  } catch (notificationError) {
    console.warn('[client-portal-notifications] Failed to sync notifications', {
      token,
      workspaceMode,
      error: notificationError,
    })
  }
  const rolePlayers = {
    attorney: portalData?.attorneyRolePlayers || null,
    team: portalData?.transaction ? {
      assignedAgent: portalData.transaction.assigned_agent || null,
      assignedAttorney: portalData.transaction.attorney || null,
      assignedBondOriginator: portalData.transaction.bond_originator || null,
    } : null,
  }

  const educationalContent = buildClientPortalEducationalContent({
    stage: lifecycle?.stage || portalData?.transaction?.stage || '',
    mainStage: lifecycle?.mainStage || portalData?.transaction?.current_main_stage || '',
    financeType: portalData?.transaction?.finance_type || '',
    workspace: workspaceMode,
    nextActions,
    requiredDocuments: documentCenter?.requiredDocuments || [],
  })
  const stageEducation = getEducationalContentForStage(educationalContent?.currentStage?.stageKey || '')
  const documentEducation = (documentCenter?.requiredDocuments || []).slice(0, 6).map((item) =>
    getEducationalContentForDocument(item?.key || item?.label || ''),
  )

  const legacyPortalData = buildLegacyPortalPayload({
    portalData,
    contexts: context.contexts,
    hasBuyingContext: context.hasBuyingContext,
    hasSellingContext: context.hasSellingContext,
    workspaceMode,
  })

  return {
    portalContext: {
      token,
      workspace: workspaceMode,
      requestedWorkspace: normalizeWorkspace(workspace),
      contexts: context.contexts,
      hasBuyingContext: context.hasBuyingContext,
      hasSellingContext: context.hasSellingContext,
      workspaceRoles: context.workspaceRoles,
    },
    client: portalData?.buyer || null,
    transaction: portalData?.transaction || null,
    listing: portalData?.listing || null,
    property: portalData?.unit || null,
    appointments,
    rolePlayers,
    lifecycle,
    timeline,
    nextActions,
    documentCenter,
    onboarding: portalData?.onboarding || null,
    mandate: {
      packet: portalData?.activeSellingContext?.mandatePacket || null,
    },
    finance: {
      type: portalData?.transaction?.finance_type || null,
      readiness: portalData?.buyerReadiness?.finance || null,
    },
    workflowSummary,
    mvpControlBoard: workflowReadModel?.mvpControlBoard || null,
    mvpTransactionHealth: workflowReadModel?.mvpTransactionHealth || null,
    activityFeed,
    groupedActivityFeed,
    activityFeedSummary: activityFeedModel.summary,
    notifications,
    sellerJourney: portalData?.sellerJourney || portalData?.activeSellingContext?.sellerJourney || null,
    sellerPortalJourney,
    educationalContent: {
      ...educationalContent,
      currentStage: {
        ...educationalContent?.currentStage,
        ...stageEducation,
      },
      rolePlayerGuidance: buildRoleEducation(rolePlayers),
      documentGuidance: documentEducation,
    },
    visibility: {
      workspace: workspaceMode,
      buyerVisible: workspaceMode !== 'selling',
      sellerVisible: workspaceMode !== 'buying',
      clientOnly: true,
    },
    permissions: {
      canUploadDocuments: true,
      canComment: Boolean(portalData?.transaction?.id),
      canViewActivityFeed: true,
    },
    legacyPortalData,
  }
}
