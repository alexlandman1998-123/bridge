import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  rpc: vi.fn(),
  from: vi.fn(),
  choices: vi.fn(),
  listing: vi.fn(),
  setup: vi.fn(),
  card: vi.fn(),
  events: vi.fn(),
  reads: [],
  data: {},
}))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: runtime,
}))
vi.mock('../privateListingService', () => ({
  getAgentPrivateListingSummaries: runtime.choices,
  getPrivateListing: runtime.listing,
}))
vi.mock('../campaignSetupService', () => ({
  loadCampaignSetup: runtime.setup,
}))
vi.mock('../agencyPublicIntakeLinkService', () => ({
  loadAgencyAgentCardLink: runtime.card,
}))
vi.mock('../marketingEventRepository', () => ({ listMarketingEvents: runtime.events }))
import {
  loadJustListedChoices,
  loadJustListedSource,
  loadPropertyShowDays,
} from '../justListedCampaignService'
const agency = {
  agencyName: 'Oak',
  language: 'en-ZA',
  buyerDestination: 'agent',
}
const choices = { listings: [{ id: 'listing' }], agency }
beforeEach(() => {
  vi.clearAllMocks()
  runtime.reads = []
  runtime.data = {
    marketing_campaign_setup: { data: { confirmed_preferences: agency } },
    marketing_campaign_agent_setup: {
      data: { confirmed_preferences: { name: 'Me', email: 'me@example.test' } },
    },
  }
  runtime.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  runtime.rpc.mockResolvedValue({ data: false })
  runtime.setup.mockResolvedValue({
    agency: { confirmed_preferences: agency },
    agent: null,
  })
  runtime.choices.mockResolvedValue([
    {
      id: 'listing',
      organisationId: 'agency',
      listingCategory: 'private_sale',
      title: 'Sunny home',
      addressLine1: '99 Secret Road',
      sellerEmail: 'private',
    },
    { id: 'foreign', organisationId: 'other' },
    { id: 'rent', organisationId: 'agency', listingCategory: 'rental' },
  ])
  runtime.listing.mockResolvedValue({
    id: 'listing',
    organisationId: 'agency',
    assignedAgentId: 'me',
    title: 'Sunny home',
    askingPrice: 1000000,
    suburb: 'Gardens',
  })
  runtime.card.mockResolvedValue({ link: null })
  runtime.events.mockResolvedValue([])
  runtime.from.mockImplementation((table) => {
    const q = {
      select: () => q,
      eq: (key, value) => {
        runtime.reads.push([table, key, value])
        return q
      },
      maybeSingle: async () => runtime.data[table] || { data: null },
    }
    return q
  })
})
it('prefills only valid public planning/upcoming show days using their saved South African times', async () => {
  const event = { id: 'event', listingId: 'listing', title: 'Public show day', visibility: 'public', startsAt: '2099-11-20T08:00:00Z', endsAt: '2099-11-20T10:00:00Z' }
  runtime.events.mockResolvedValue([
    { ...event, id: 'planning', status: 'Planning' },
    { ...event, id: 'upcoming', status: 'Upcoming' },
    ...['Draft', 'Completed', 'Cancelled', 'Open'].map((status) => ({ ...event, status })),
    { ...event, status: 'Upcoming', visibility: 'private' },
    { ...event, status: 'Upcoming', startsAt: 'invalid' },
    { ...event, status: 'Upcoming', endsAt: event.startsAt },
  ])
  const result = await loadPropertyShowDays('agency')
  expect(runtime.events).toHaveBeenCalledWith('agency', 'showDays')
  expect(result.map((row) => row.id)).toEqual(['planning', 'upcoming'])
  expect(result[0]).toMatchObject({ date: '2099-11-20', startTime: '10:00', endTime: '12:00' })
})
it('uses server-checked permissions for the picker and projects safe summary fields', async () => {
  const result = await loadJustListedChoices('agency', 'me')
  expect(runtime.choices).toHaveBeenCalledWith(
    'me',
    expect.objectContaining({
      organisationId: 'agency',
      includeAllOrganisationListings: false,
    }),
  )
  expect(result.listings).toHaveLength(1)
  expect(JSON.stringify(result.listings)).not.toMatch(/Secret Road|sellerEmail/)
})
it('rejects a changed account or unpermitted listing before fetching private data', async () => {
  await expect(loadJustListedChoices('agency', 'other')).rejects.toThrow(
    /account changed/,
  )
  await expect(
    loadJustListedSource('agency', 'me', 'foreign', choices),
  ).rejects.toThrow(/no longer available/)
  expect(runtime.listing).not.toHaveBeenCalled()
})
it('refreshes confirmed agency and own public details with explicit tenant and actor filters', async () => {
  const result = await loadJustListedSource('agency', 'me', 'listing', choices)
  expect(result.source.destination).toBe('me@example.test')
  expect(runtime.reads).toContainEqual([
    'marketing_campaign_setup',
    'organisation_id',
    'agency',
  ])
  expect(runtime.reads).toContainEqual([
    'marketing_campaign_agent_setup',
    'user_id',
    'me',
  ])
  expect(runtime.listing).toHaveBeenCalledWith('listing', {
    includeRequirementsAndDocuments: false,
  })
})
it('never substitutes the current agent for a different assigned agent', async () => {
  runtime.rpc.mockResolvedValue({ data: true })
  runtime.listing.mockResolvedValue({
    id: 'listing',
    organisationId: 'agency',
    assignedAgentId: 'colleague',
    assignedAgentName: 'Colleague',
    title: 'Sunny home',
  })
  runtime.card.mockResolvedValue({
    link: {
      status: 'active',
      organisationId: 'agency',
      defaultAssignedAgentId: 'colleague',
      agentDigitalCard: {
        agent: { name: 'Colleague', email: 'colleague@example.test' },
      },
    },
  })
  const result = await loadJustListedSource('agency', 'me', 'listing', choices)
  expect(result.source.agentName).toBe('Colleague')
  expect(result.source.destination).toBe('colleague@example.test')
  expect(result.source.destination).not.toContain('me@')
})
it('rejects cross-agency details and revoked listing assignment', async () => {
  runtime.listing.mockResolvedValueOnce({ organisationId: 'other' })
  await expect(
    loadJustListedSource('agency', 'me', 'listing', choices),
  ).rejects.toThrow(/no longer available/)
  runtime.listing.mockResolvedValueOnce({
    organisationId: 'agency',
    assignedAgentId: 'colleague',
  })
  await expect(
    loadJustListedSource('agency', 'me', 'listing', choices),
  ).rejects.toThrow(/no longer assigned/)
})
it('does not use an inactive or wrong-agency agent card', async () => {
  runtime.rpc.mockResolvedValue({ data: true })
  runtime.listing.mockResolvedValue({
    organisationId: 'agency',
    assignedAgentId: 'colleague',
    assignedAgentName: 'Colleague',
  })
  runtime.card.mockResolvedValue({
    link: {
      status: 'inactive',
      organisationId: 'other',
      agentDigitalCard: { agent: { email: 'private@example.test' } },
    },
  })
  expect(
    (await loadJustListedSource('agency', 'me', 'listing', choices)).source
      .destination,
  ).toBe('')
})
it('uses family-specific lifecycle filters for sold and pre-launch campaigns', async () => {
 runtime.choices.mockResolvedValue([{id:'sold',organisationId:'agency',listingStatus:'sold',title:'Sold'},{id:'upcoming',organisationId:'agency',listingStatus:'mandate_signed',title:'Not launched'},{id:'live',organisationId:'agency',listingStatus:'active',title:'Live'}])
 expect((await loadJustListedChoices('agency','me','just-sold')).listings.map(row=>row.id)).toEqual(['sold'])
 expect((await loadJustListedChoices('agency','me','coming-soon')).listings.map(row=>row.id)).toEqual(['upcoming'])
 expect(runtime.choices).toHaveBeenCalledWith('me',expect.objectContaining({includeArchivedListings:true}))
})
it('reuses seller enquiry routing for sold campaigns and rejects a no-longer-sold property', async () => {
 runtime.data.marketing_campaign_setup.data.confirmed_preferences={...agency,sellerDestination:'agency',agencyPhone:'0215551234'}
 runtime.listing.mockResolvedValue({id:'listing',organisationId:'agency',assignedAgentId:'me',title:'Sold home',listingStatus:'sold',suburb:'Gardens'})
 expect((await loadJustListedSource('agency','me','listing',choices,'just-sold')).source.destination).toBe('0215551234')
 runtime.listing.mockResolvedValue({id:'listing',organisationId:'agency',assignedAgentId:'me',listingStatus:'active'})
 await expect(loadJustListedSource('agency','me','listing',choices,'just-sold')).rejects.toThrow(/no longer available/)
})
