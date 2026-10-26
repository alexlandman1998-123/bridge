import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({
  setup: vi.fn(),
  card: vi.fn(),
  handover: vi.fn(),
}))
vi.mock('../handoverCampaignService', () => ({
  loadHandoverContext: runtime.handover,
}))
vi.mock('../campaignSetupService', () => ({
  loadCampaignSetup: runtime.setup,
}))
vi.mock('../agencyPublicIntakeLinkService', () => ({
  loadAgencyAgentCardLink: runtime.card,
}))
import { loadGeneralCampaignContext } from '../generalCampaignService'
beforeEach(() => {
  vi.clearAllMocks()
  runtime.setup.mockResolvedValue({
    agency: {
      confirmed_preferences: {
        reviewUrl: 'https://example.test/review',
        agencyName: 'Oak',
        language: 'en-ZA',
        sellerDestination: 'link',
        sellerUrl: 'https://example.test/sell',
        buyerDestination: 'agency',
        agencyEmail: 'office@example.test',
        serviceAreas: ['Gardens'],
        offers: ['Property valuation'],
      },
    },
    agent: {
      confirmed_preferences: {
        name: 'Sarah',
        email: 'sarah@example.test',
        bio: 'Saved biography',
        serviceAreas: ['Sea Point'],
        photoUrl: 'https://example.test/sarah.jpg',
      },
    },
  })
})
it('reuses confirmed agent, service areas and category-specific enquiry routing', async () => {
  const seller = await loadGeneralCampaignContext('agency', 'me', 'sellers')
  expect(runtime.setup).toHaveBeenCalledWith('agency', { userId: 'me' })
  expect(seller.source.destination).toBe('https://example.test/sell')
  expect(seller.defaults.offer).toBe('Property valuation')
  expect(seller.areas).toEqual(['Sea Point', 'Gardens'])
  expect(
    (await loadGeneralCampaignContext('agency', 'me', 'buyers')).source
      .destination,
  ).toBe('office@example.test')
  expect(
    (await loadGeneralCampaignContext('agency', 'me', 'meet-your-agent'))
      .defaults.bio,
  ).toBe('Saved biography')
  expect(
    (await loadGeneralCampaignContext('agency', 'me', 'buyers')).source
      .photoUrl,
  ).toBe('')
})
it('requires confirmed setup and never silently uses unconfirmed profile or private client facts', async () => {
  runtime.setup.mockResolvedValue({
    agency: { preferences: { agencyName: 'Not confirmed' } },
    agent: { preferences: { name: 'Not confirmed' } },
  })
  await expect(
    loadGeneralCampaignContext('agency', 'me', 'buyers'),
  ).rejects.toThrow(/Finish Campaign Setup/)
})
it('does not substitute the signed-in administrator for a different saved agent', async () => {
  runtime.card.mockResolvedValue({
    link: {
      status: 'active',
      organisationId: 'agency',
      defaultAssignedAgentId: 'other',
      agentDigitalCard: {
        agent: {
          name: 'Other agent',
          email: 'other@example.test',
          jobTitle: 'Consultant',
        },
      },
    },
  })
  const current = await loadGeneralCampaignContext(
    'agency',
    'admin',
    'meet-your-agent',
    'other',
  )
  expect(current.agentId).toBe('other')
  expect(current.source.agentName).toBe('Other agent')
  expect(current.source.destination).toBe('other@example.test')
  expect(runtime.card).toHaveBeenCalledWith({
    organisationId: 'agency',
    agentUserId: 'other',
  })
  runtime.card.mockResolvedValue({ link: { status: 'inactive' } })
  await expect(
    loadGeneralCampaignContext('agency', 'admin', 'meet-your-agent', 'other'),
  ).rejects.toThrow(/no longer available/)
})
it('propagates account or permission failures instead of using browser storage', async () => {
  runtime.setup.mockRejectedValue(new Error('Your account changed'))
  await expect(
    loadGeneralCampaignContext('agency', 'me', 'buyers'),
  ).rejects.toThrow(/account changed/)
  expect(runtime.card).not.toHaveBeenCalled()
})

it('reuses the confirmed review link only for review campaigns', async () => {
  const review = await loadGeneralCampaignContext(
    'agency',
    'me',
    'review-request',
  )
  expect(review.source.reviewUrl).toBe('https://example.test/review')
  expect(review.defaults.reviewUrl).toBe(review.source.reviewUrl)
  expect(
    (await loadGeneralCampaignContext('agency', 'me', 'buyers')).source
      .reviewUrl,
  ).toBeUndefined()
})
it('refreshes handover selection without projecting private transaction data into source', async () => {
  runtime.handover.mockResolvedValue({
    transactions: [{ id: 'tx', area: 'Gardens' }],
    transaction: { id: 'tx', area: 'Gardens' },
    images: [],
  })
  const current = await loadGeneralCampaignContext(
    'agency',
    'me',
    'key-handover',
    'me',
    { transactionId: 'tx' },
  )
  expect(runtime.handover).toHaveBeenCalledWith('agency', 'me', {
    transactionId: 'tx',
  })
  expect(current.transaction.id).toBe('tx')
  expect(current.source.transactionId).toBeUndefined()
})
