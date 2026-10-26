import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  getAgentPrivateListingSummaries,
  getPrivateListing,
} from './privateListingService'
import { loadCampaignSetup } from './campaignSetupService'
import { loadAgencyAgentCardLink } from './agencyPublicIntakeLinkService'
import { listMarketingEvents } from './marketingEventRepository'
import { justListedSource } from './justListedCampaignModel'

const unavailable = new Set([
  'sold',
  'withdrawn',
  'archived',
  'deleted',
  'under_offer',
  'transaction_created',
])

async function actor(organisationId, userId) {
  if (!organisationId || !isSupabaseConfigured || !supabase)
    throw new Error('Choose a connected agency workspace.')
  const auth = await supabase.auth.getUser()
  if (auth.error || !userId || auth.data?.user?.id !== userId)
    throw new Error('Your account changed. Reopen campaigns.')
}
export function campaignListingAllowed(row, template = 'new-listing') {
  if (
    row.listingCategory === 'rental' ||
    ['deleted', 'archived', 'withdrawn'].includes(row.listingStatus)
  )
    return false
  if (template === 'just-sold') return row.listingStatus === 'sold'
  if (template === 'coming-soon')
    return [
      'seller_lead',
      'onboarding_sent',
      'onboarding_completed',
      'listing_review',
      'mandate_ready',
      'mandate_sent',
      'mandate_signed',
    ].includes(row.listingStatus)
  return !unavailable.has(row.listingStatus)
}
export async function loadJustListedChoices(
  organisationId,
  userId,
  template = 'new-listing',
) {
  await actor(organisationId, userId)
  const permission = await supabase.rpc('email_campaign_can_send', {
    p_organisation_id: organisationId,
  })
  if (permission.error)
    throw new Error('Unable to check listing access. Try again.')
  const [setup, listings] = await Promise.all([
    loadCampaignSetup(organisationId, { userId }),
    getAgentPrivateListingSummaries(userId, {
      organisationId,
      includeAllOrganisationListings: permission.data === true,
      coreFieldsOnly: true,
      fetchAll: true,
      requireAvailable: true,
      ...(template === 'just-sold' ? { includeArchivedListings: true } : {}),
    }),
  ])
  return {
    agency: setup.agency?.confirmed_preferences || null,
    ownAgent: setup.agent?.confirmed_preferences || null,
    // Never use the summary's address-derived headline as a campaign headline.
    listings: listings
      .filter(
        (row) =>
          row.organisationId === organisationId &&
          campaignListingAllowed(row, template),
      )
      .map((row) => ({
        id: row.id,
        title: row.title || 'Untitled listing',
        area: [row.suburb, row.city].filter(Boolean).join(', '),
        reference: row.listingReference || '',
      })),
  }
}
export async function loadJustListedSource(
  organisationId,
  userId,
  listingId,
  choices,
  template = 'new-listing',
) {
  await actor(organisationId, userId)
  if (!choices?.listings.some((row) => row.id === listingId))
    throw new Error('This listing is no longer available in your workspace.')
  const [listing, permission, shared, personal] = await Promise.all([
    getPrivateListing(listingId, {
      includeRequirementsAndDocuments: false,
      ...(template === 'just-sold' ? { includePreviousListings: true } : {}),
    }),
    supabase.rpc('email_campaign_can_send', {
      p_organisation_id: organisationId,
    }),
    supabase
      .from('marketing_campaign_setup')
      .select('confirmed_preferences')
      .eq('organisation_id', organisationId)
      .maybeSingle(),
    supabase
      .from('marketing_campaign_agent_setup')
      .select('confirmed_preferences')
      .eq('organisation_id', organisationId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (permission.error || shared.error || personal.error)
    throw new Error('Unable to refresh confirmed campaign details. Try again.')
  if (
    !listing ||
    listing.organisationId !== organisationId ||
    !campaignListingAllowed(listing, template)
  )
    throw new Error('This sale listing is no longer available in your agency.')
  if (permission.data !== true && listing.assignedAgentId !== userId)
    throw new Error('This listing is no longer assigned to you.')
  const agency = shared.data?.confirmed_preferences
  if (!agency)
    throw new Error(
      'Finish Campaign Setup before building a personalised campaign.',
    )
  let agent =
    listing.assignedAgentId === userId
      ? personal.data?.confirmed_preferences
      : null
  if (!agent && listing.assignedAgentId) {
    const { link } = await loadAgencyAgentCardLink({
      organisationId,
      agentUserId: listing.assignedAgentId,
    })
    if (
      link?.status === 'active' &&
      link.organisationId === organisationId &&
      link.defaultAssignedAgentId === listing.assignedAgentId
    )
      agent = link.agentDigitalCard?.agent
  }
  return {
    ...justListedSource(
      listing,
      template === 'just-sold'
        ? {
            ...agency,
            buyerDestination: agency.sellerDestination,
            buyerUrl: agency.sellerUrl,
          }
        : agency,
      agent || {},
    ),
    publicArea: [
      listing.suburb || listing.propertyDetails?.suburb,
      listing.city || listing.propertyDetails?.city,
    ]
      .filter(Boolean)
      .join(', '),
    listingStatus: listing.listingStatus,
    agentId: listing.assignedAgentId || '',
    listingId,
  }
}

export async function loadPropertyShowDays(organisationId) {
  const events = await listMarketingEvents(organisationId, 'showDays')
  const date = (value) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value))
  const time = (value) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Johannesburg',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value))
  return events
    .filter(
      (event) =>
        event.listingId &&
        event.startsAt &&
        event.endsAt &&
        ['upcoming', 'open'].includes(event.status.toLowerCase()) &&
        event.visibility === 'public',
    )
    .map((event) => ({
      id: event.id,
      listingId: event.listingId,
      title: event.title,
      date: date(event.startsAt),
      startTime: time(event.startsAt),
      endTime: time(event.endsAt),
    }))
}
