import { buildSellerClientPortalLink } from '../lib/agentListingStorage'
import {
  getClientAccessPolicyMessage,
  resolveSellerAccessPolicy,
} from '../core/clientAccess/clientAccessPolicy'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  createPrivateListingActivity,
  ensureSellerPortalActivationRecord,
  getPrivateListing,
  issueSellerPortalInvite,
  sendSellerOnboarding,
  updatePrivateListing,
} from './privateListingService'

export const SELLER_PORTAL_ACTIVATION_SOURCES = Object.freeze({
  sellerLead: 'seller_lead',
  existingListing: 'existing_listing',
  manualListing: 'manual_listing',
  bulkImport: 'bulk_import',
  agentInvitation: 'agent_invitation',
})

export const SELLER_PORTAL_STATUSES = Object.freeze({
  notActivated: 'not_activated',
  invitationPending: 'invitation_pending',
  invitationSent: 'invitation_sent',
  activated: 'activated',
  profileIncomplete: 'profile_incomplete',
  profileComplete: 'profile_complete',
  transactionReady: 'transaction_ready',
  invitationExpired: 'invitation_expired',
  invitationCancelled: 'invitation_cancelled',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value).toLowerCase())
}

export function resolveSellerPortalLifecycle({ listing = {}, accessState = null, diagnostics = null } = {}) {
  const onboarding = listing?.sellerOnboarding || {}
  const rawStatus = normalizeKey(
    onboarding.sellerPortalStatus ||
      onboarding.seller_portal_status ||
      accessState?.portalStatus ||
      diagnostics?.portalStatus,
  )
  if (rawStatus && Object.values(SELLER_PORTAL_STATUSES).includes(rawStatus)) return rawStatus
  if (accessState?.linkActive === false || onboarding.cancelledAt || onboarding.invitationCancelledAt) {
    return SELLER_PORTAL_STATUSES.invitationCancelled
  }
  if (onboarding.inviteExpiresAt && new Date(onboarding.inviteExpiresAt).getTime() <= Date.now() && !onboarding.inviteConsumedAt) {
    return SELLER_PORTAL_STATUSES.invitationExpired
  }
  if (accessState?.passwordSet || onboarding.activatedAt || onboarding.inviteConsumedAt) {
    const profileStatus = normalizeKey(onboarding.status || listing?.sellerOnboardingStatus)
    return ['completed', 'submitted', 'approved'].includes(profileStatus)
      ? SELLER_PORTAL_STATUSES.profileComplete
      : SELLER_PORTAL_STATUSES.activated
  }
  if (onboarding.inviteCreatedAt || onboarding.invitationSentAt || onboarding.invitationLastSentAt) {
    return SELLER_PORTAL_STATUSES.invitationSent
  }
  if (onboarding.token || onboarding.sellerPortalToken) return SELLER_PORTAL_STATUSES.invitationPending
  return SELLER_PORTAL_STATUSES.notActivated
}

export function getSellerPortalStatusLabel(status = '') {
  const labels = {
    [SELLER_PORTAL_STATUSES.notActivated]: 'Not Activated',
    [SELLER_PORTAL_STATUSES.invitationPending]: 'Invitation Pending',
    [SELLER_PORTAL_STATUSES.invitationSent]: 'Invitation Sent',
    [SELLER_PORTAL_STATUSES.activated]: 'Activated',
    [SELLER_PORTAL_STATUSES.profileIncomplete]: 'Profile Incomplete',
    [SELLER_PORTAL_STATUSES.profileComplete]: 'Profile Complete',
    [SELLER_PORTAL_STATUSES.transactionReady]: 'Transaction Ready',
    [SELLER_PORTAL_STATUSES.invitationExpired]: 'Invitation Expired',
    [SELLER_PORTAL_STATUSES.invitationCancelled]: 'Invitation Cancelled',
  }
  return labels[normalizeKey(status)] || 'Not Activated'
}

export function buildSellerPortalInvitationPreview({
  activationSource = SELLER_PORTAL_ACTIVATION_SOURCES.existingListing,
  sellerName = '',
  propertyAddress = '',
  agencyName = '',
  agentName = '',
} = {}) {
  const source = normalizeKey(activationSource)
  const name = pickFirstText(sellerName, 'there')
  const property = pickFirstText(propertyAddress, 'your property')
  const agency = pickFirstText(agencyName, 'Your agency')
  const agent = pickFirstText(agentName, 'Your agent')

  if (source === SELLER_PORTAL_ACTIVATION_SOURCES.sellerLead) {
    return {
      subject: `Complete your property profile with ${agency}`,
      body: [
        `Hi ${name},`,
        `${agent} from ${agency} has invited you to complete your secure property profile.`,
        'Through your Seller Portal, you can provide your property information, upload documents and complete the steps required to prepare your property for sale.',
        '[Get Started]',
      ].join('\n\n'),
    }
  }

  return {
    subject: `Activate your Seller Portal for ${property}`,
    body: [
      `Hi ${name},`,
      `${agency} has invited you to activate your secure Seller Portal for ${property}.`,
      'Your property is already listed. The portal gives you one place to follow the sale, receive updates, upload documents and track the transaction through to registration.',
      '[Activate Seller Portal]',
    ].join('\n\n'),
  }
}

export function assertSellerPortalActivationContact({ sellerEmail = '' } = {}) {
  if (!isValidEmail(sellerEmail)) {
    throw new Error('Add a valid seller email before sending the Seller Portal invitation.')
  }
}

export async function activateSellerPortalForListing({
  listingId = '',
  activationSource = SELLER_PORTAL_ACTIVATION_SOURCES.existingListing,
  sellerContactEmail = '',
  sellerContactPhone = '',
  sellerFirstName = '',
  sellerSurname = '',
  performedBy = '',
  agentName = '',
  agentEmail = '',
  agentPhone = '',
  organisationId = '',
  agencyName = '',
  propertyAddress = '',
  ttlHours = 72,
} = {}) {
  const source = normalizeKey(activationSource) || SELLER_PORTAL_ACTIVATION_SOURCES.existingListing
  const listing = await getPrivateListing(listingId, { includeRequirementsAndDocuments: true })
  if (!listing?.id) throw new Error('Private listing not found.')

  if (source !== SELLER_PORTAL_ACTIVATION_SOURCES.sellerLead) {
    const preflightSellerEmail = normalizeText(
      sellerContactEmail ||
        listing?.seller?.email ||
        listing?.sellerEmail ||
        listing?.seller_email,
    ).toLowerCase()
    assertSellerPortalActivationContact({ sellerEmail: preflightSellerEmail })
    const sellerAccessPolicy = resolveSellerAccessPolicy({
      ...listing,
      listingId: listing.id,
      sellerEmail: preflightSellerEmail,
      documents: listing.documents || [],
      documentLibraryRows: listing.documents || [],
      mandateStatus: listing.mandateStatus || listing.mandate_status,
      mandate: listing.mandate,
      mandatePacket: listing.mandatePacket || listing.mandate_packet,
    })
    const activationDecision = sellerAccessPolicy.actions.activatePortal
    if (!activationDecision.enabled) {
      const error = new Error(getClientAccessPolicyMessage(activationDecision.reason, 'Upload the signed mandate before activating the Seller Portal.'))
      error.code = activationDecision.reason
      error.policyVersion = sellerAccessPolicy.version
      error.policyDecision = activationDecision
      throw error
    }
  }

  const onboarding = source === SELLER_PORTAL_ACTIVATION_SOURCES.sellerLead
    ? await sendSellerOnboarding(listing.id, {
        sellerContactEmail,
        sellerContactPhone,
        performedBy,
      })
    : await ensureSellerPortalActivationRecord(listing.id, {
        activationSource: source,
        sellerContactEmail,
        sellerContactPhone,
        sellerFirstName,
        sellerSurname,
        performedBy,
      })

  const sellerEmail = normalizeText(
    sellerContactEmail ||
      onboarding?.sellerEmail ||
      onboarding?.onboarding?.form_data?.sellerEmail ||
      onboarding?.onboarding?.form_data?.email ||
      listing?.seller?.email,
  ).toLowerCase()
  assertSellerPortalActivationContact({ sellerEmail })

  const portalToken = normalizeText(onboarding?.stablePortalToken || onboarding?.onboarding?.seller_portal_token || onboarding?.token)
  if (!portalToken) throw new Error('Seller portal token could not be prepared for this listing.')

  const invitation = await issueSellerPortalInvite(portalToken, { ttlHours })
  const portalLink = buildSellerClientPortalLink(invitation?.inviteToken)
  if (!portalLink) throw new Error('Seller Portal invitation link could not be created.')

  const sellerName = pickFirstText(
    [sellerFirstName, sellerSurname].filter(Boolean).join(' '),
    onboarding?.sellerName,
    onboarding?.onboarding?.form_data?.sellerName,
    listing?.seller?.name,
    'Seller',
  )
  const propertyLabel = pickFirstText(propertyAddress, listing?.formattedAddress, listing?.propertyAddress, listing?.listingTitle, listing?.title, 'your property')
  const preview = buildSellerPortalInvitationPreview({
    activationSource: source,
    sellerName,
    propertyAddress: propertyLabel,
    agencyName,
    agentName,
  })
  const emailResponse = await invokeEdgeFunction('send-email', {
    body: {
      type: source === SELLER_PORTAL_ACTIVATION_SOURCES.sellerLead ? 'seller_onboarding' : 'seller_portal_link',
      emailKind: source === SELLER_PORTAL_ACTIVATION_SOURCES.sellerLead ? 'seller_lead' : 'existing_listing',
      activationSource: source,
      to: sellerEmail,
      organisationId: organisationId || listing.organisationId || listing.organisation_id || '',
      listingId: listing.id,
      recipientRole: 'seller',
      recipientName: sellerName,
      sellerName,
      propertyTitle: propertyLabel,
      propertyType: listing?.propertyType || listing?.property_type || '',
      onboardingLink: portalLink,
      portalLink,
      agentName,
      agentEmail,
      agentPhone,
      agencyName,
      subject: preview.subject,
    },
  })
  if (emailResponse?.error || emailResponse?.data?.error) {
    throw emailResponse.error || new Error(emailResponse.data.error)
  }

  await updatePrivateListing(listing.id, {
    sellerOnboardingStatus: listing.sellerOnboardingStatus === 'completed' ? 'completed' : 'sent',
  }, { includeRequirementsAndDocuments: false }).catch(() => null)

  await createPrivateListingActivity({
    privateListingId: listing.id,
    activityType: 'seller_portal_invitation_sent',
    activityTitle: 'Seller Portal invitation sent',
    activityDescription: `Seller Portal activation invitation sent to ${sellerEmail}.`,
    performedBy,
    visibility: 'internal',
    metadata: {
      activationSource: source,
      inviteExpiresAt: invitation?.inviteExpiresAt || null,
      stablePortalTokenPresent: Boolean(invitation?.stablePortalToken),
      deliveryId: emailResponse?.data?.deliveryId || null,
      canonicalInviteId: emailResponse?.data?.canonicalInviteId || null,
    },
  }).catch(() => null)

  return {
    ok: true,
    listingId: listing.id,
    activationSource: source,
    status: SELLER_PORTAL_STATUSES.invitationSent,
    sellerEmail,
    sellerName,
    portalLink,
    invitation,
    email: emailResponse?.data || null,
  }
}

export function buildBulkSellerPortalInvitationReview(listings = []) {
  const rows = Array.isArray(listings) ? listings : []
  const summary = {
    totalListings: rows.length,
    validEmailCount: 0,
    missingEmailCount: 0,
    alreadyActivatedCount: 0,
    duplicateSellerWarnings: [],
    included: [],
    excluded: [],
  }
  const seenEmailByListing = new Map()

  for (const listing of rows) {
    const sellerEmail = normalizeText(
      listing?.seller?.email ||
        listing?.sellerEmail ||
        listing?.seller_email ||
        listing?.sellerOnboarding?.formData?.sellerEmail ||
        listing?.sellerOnboarding?.formData?.email,
    ).toLowerCase()
    const status = resolveSellerPortalLifecycle({ listing })
    const base = {
      listingId: normalizeText(listing?.id || listing?.listingId || listing?.listing_id),
      listingTitle: normalizeText(listing?.listingTitle || listing?.title || listing?.propertyAddress || listing?.formattedAddress),
      sellerName: normalizeText(listing?.seller?.name || listing?.sellerName || listing?.seller_name),
      sellerEmail,
      status,
    }

    if (status === SELLER_PORTAL_STATUSES.activated || status === SELLER_PORTAL_STATUSES.profileComplete) {
      summary.alreadyActivatedCount += 1
      summary.excluded.push({ ...base, reason: 'already_activated' })
      continue
    }

    if (!isValidEmail(sellerEmail)) {
      summary.missingEmailCount += 1
      summary.excluded.push({ ...base, reason: 'missing_or_invalid_email' })
      continue
    }

    summary.validEmailCount += 1
    const previousListingId = seenEmailByListing.get(sellerEmail)
    if (previousListingId && previousListingId !== base.listingId) {
      summary.duplicateSellerWarnings.push({
        sellerEmail,
        listingIds: [previousListingId, base.listingId],
      })
    } else {
      seenEmailByListing.set(sellerEmail, base.listingId)
    }
    summary.included.push(base)
  }

  return summary
}

export async function sendBulkSellerPortalInvitations({
  listings = [],
  actor = {},
  organisationId = '',
  agencyName = '',
  limit = 50,
} = {}) {
  const review = buildBulkSellerPortalInvitationReview(listings)
  const includedIds = new Set(review.included.slice(0, Math.max(1, Number(limit || 50))).map((row) => row.listingId))
  const results = []
  for (const listing of listings) {
    const listingId = normalizeText(listing?.id || listing?.listingId || listing?.listing_id)
    if (!includedIds.has(listingId)) continue
    try {
      const result = await activateSellerPortalForListing({
        listingId,
        activationSource: SELLER_PORTAL_ACTIVATION_SOURCES.bulkImport,
        sellerContactEmail: normalizeText(listing?.seller?.email || listing?.sellerEmail || listing?.seller_email),
        sellerContactPhone: normalizeText(listing?.seller?.phone || listing?.sellerPhone || listing?.seller_phone),
        performedBy: normalizeText(actor?.id || actor?.userId),
        agentName: normalizeText(actor?.fullName || actor?.name || actor?.email),
        agentEmail: normalizeText(actor?.email),
        organisationId,
        agencyName,
        propertyAddress: normalizeText(listing?.propertyAddress || listing?.formattedAddress || listing?.listingTitle || listing?.title),
      })
      results.push({ listingId, ok: true, result })
    } catch (error) {
      results.push({ listingId, ok: false, error: error?.message || 'Invitation failed.' })
    }
  }
  return {
    review,
    sent: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  }
}
