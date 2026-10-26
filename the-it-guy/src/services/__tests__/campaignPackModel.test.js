import { createContactProvenance, confirmCampaignContacts, withContactOverride } from '../campaignContactProvenance'
import { expect, it } from 'vitest'
import { CAMPAIGN_PACK_DESIGNS, campaignEmailDraft, campaignHandoffId, campaignPackText, checkedCampaignPack, checkedEmailCopyPack } from '../campaignPackModel'
const source = { title: 'Sunny home', price: 'R 1 250 000', location: 'Gardens', facts: '3 bedrooms', description: 'Space for family life', agencyName: 'Oak & Stone', agentName: 'Sarah', agentEmail: 'sarah@example.test', agentPhone: '+27820000000', destination: 'sarah@example.test', language: 'en-ZA', primaryColor: '#ffffff', imageId: 'photo' }
const content = Object.fromEntries(['email', 'whatsapp', 'social'].map((key) => [key, { title: 'Custom headline', body: 'Edited campaign wording <script>alert(1)</script>' }]))
const campaign = { id: 'plan', name: 'Just Listed', status: 'draft', revision: 3, listing_builder: { version: 1, template: 'new-listing', listingId: '11111111-1111-4111-8111-111111111111', agentId: '', source, contactProvenance: { ...createContactProvenance(source), confirmed: true } }, channel_content: content }
const current = { source, agentId: '', images: [{ id: 'other', url: 'https://example.test/2.jpg' }, { id: 'photo', url: 'https://example.test/1.jpg' }], logoUrl: 'https://example.test/logo.png' }
it('defines exactly the promised square photo, five carousel and two story assets', () => {
  expect(CAMPAIGN_PACK_DESIGNS).toHaveLength(8)
  expect(CAMPAIGN_PACK_DESIGNS.filter((item) => item.height === 1080)).toHaveLength(6)
  expect(CAMPAIGN_PACK_DESIGNS.filter((item) => item.height === 1920)).toHaveLength(2)
})
it('preserves saved wording and uses the saved cover before the rest of the current gallery', () => {
  const pack = checkedCampaignPack(campaign, current)
  expect(pack.content.social.body).toBe(content.social.body)
  expect(pack.images[0].id).toBe('photo')
  expect(campaignPackText(pack)['enquiry-reply.txt']).toContain('To arrange a viewing: sarah@example.test')
  expect(campaignPackText(pack)['enquiry-reply.txt']).not.toMatch(/confirmed|booked/i)
})
it('blocks stale listing, public address, assignment and contact facts without silently rewriting copy', () => {
  for (const changed of [{ ...current, agentId: 'other' }, ...['title', 'price', 'location', 'facts', 'description', 'destination', 'agencyName'].map((key) => ({ ...current, source: { ...source, [key]: 'Changed' } }))]) expect(() => checkedCampaignPack(campaign, changed)).toThrow(/changed/)
  expect(campaign.channel_content).toBe(content)
})
it('requires an explicit reviewed override when the upstream public contact is missing', () => {
  const missing = { ...source, destination: '' }
  const saved = confirmCampaignContacts(withContactOverride({ ...campaign.listing_builder, source: missing, contactProvenance: createContactProvenance(missing) }, 'destination', 'campaign@example.test'))
  expect(checkedCampaignPack({ ...campaign, listing_builder: saved }, { ...current, source: missing }).source.destination).toBe('campaign@example.test')
  expect(() => checkedCampaignPack(campaign, { ...current, source: missing })).toThrow(/removed/)
})
it('blocks both changes and removals of previously public email or phone values', () => {
  for (const key of ['agentEmail', 'agentPhone']) {
    expect(() => checkedCampaignPack(campaign, { ...current, source: { ...source, [key]: 'Changed' } })).toThrow(/contact details changed/)
    expect(() => checkedCampaignPack(campaign, { ...current, source: { ...source, [key]: '' } })).toThrow(/removed/)
  }
  expect(campaign.listing_builder.source.destination).toBe('sarah@example.test')
  expect(campaign.channel_content).toBe(content)
})
it('keeps older saved wording available while requiring refreshed contact confirmation before preparation', () => {
  const legacy = { ...campaign.listing_builder }
  delete legacy.contactProvenance
  expect(() => checkedCampaignPack({ ...campaign, listing_builder: legacy }, current)).toThrow(/Older drafts/)
  expect(campaign.channel_content).toBe(content)
})
it('does not substitute a different photo when the saved cover was removed', () => {
  expect(checkedCampaignPack(campaign, { ...current, images: [{ id: 'other', url: 'https://example.test/new.jpg' }] }).images).toEqual([])
})
it('creates an editable email with escaped text and no sender, private photo, or matching audience', () => {
  const draft = campaignEmailDraft(checkedCampaignPack(campaign, current))
  expect(draft.html).toContain('&lt;script&gt;')
  expect(draft.html).not.toContain('<script>')
  expect(draft.html).not.toContain('https://example.test')
  expect(draft.audienceFilter.contact_ids).toEqual(['00000000-0000-0000-0000-000000000000'])
  expect(draft.senderIdentityId).toBe('')
  expect(draft.contentJson.arch9_campaign).toMatchObject({ id: 'plan', revision: 3, audience_pending: true })
})
it('has stable handoff identities across retries, separate for agency, channel and revision', async () => {
  const id = await campaignHandoffId('org', 'plan', 1, 'email')
  expect(await campaignHandoffId('org', 'plan', 1, 'email')).toBe(id)
  expect(await campaignHandoffId('org', 'plan', 2, 'email')).not.toBe(id)
  expect(await campaignHandoffId('org', 'plan', 1, 'whatsapp')).not.toBe(id)
  expect(await campaignHandoffId('other', 'plan', 1, 'email')).not.toBe(id)
})
it('prepares plain campaign email copy as editable blocks without pulling images or selecting recipients', () => {
  const plain = { id: 'plain', revision: 2, name: 'Seller valuations', planned_channels: ['email'], channel_content: { email: { title: 'Your local valuation', body: 'Personalised copy <script>bad()</script>' } }, cover_url: 'https://private.invalid/photo' }
  const draft = campaignEmailDraft(checkedEmailCopyPack(plain, 'Oak & Stone'))
  expect(draft.subject).toBe('Your local valuation')
  expect(draft.contentJson.blocks.some((block) => block.type === 'image')).toBe(false)
  expect(draft.html).not.toContain(plain.cover_url)
  expect(draft.html).toContain('&lt;script&gt;')
  expect(draft.audienceFilter.contact_ids).toEqual(['00000000-0000-0000-0000-000000000000'])
  expect(draft.contentJson.arch9_campaign).toMatchObject({ id: 'plain', revision: 2 })
  expect(draft.senderIdentityId).toBe('')
  expect(draft.subscriptionTypeId).toBe('')
})
it('requires saved email content, a planned email channel and a real agency name', () => {
  const plain = { planned_channels: ['email'], channel_content: { email: { title: 'Subject', body: 'Message' } } }
  expect(() => checkedEmailCopyPack({ ...plain, planned_channels: ['whatsapp'] }, 'Oak')).toThrow('Add Email')
  expect(() => checkedEmailCopyPack({ ...plain, channel_content: { email: { body: 'Message' } } }, 'Oak')).toThrow('email subject')
  expect(() => checkedEmailCopyPack(plain, '')).toThrow('agency name')
})
