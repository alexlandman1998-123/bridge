import { expect, it } from 'vitest'
import { CAMPAIGN_SETUP_VERSION, CAMPAIGN_OBJECTIVES, buildCampaignSetupSources, changedSetupSources, cleanSetupPreferences, validateCampaignSetup, prefillCampaignSetup, cleanCampaignSetup, metaCampaignObjective } from '../campaignSetupModel'

it('exports both agency setup preferences and campaign objectives for their existing consumers', () => {
  expect(CAMPAIGN_SETUP_VERSION).toBe(1)
  expect(cleanSetupPreferences({ agencyName: 'Agency' }).agencyName).toBe('Agency')
  const campaign_setup = cleanCampaignSetup({ metaObjective: 'OUTCOME_LEADS' })
  expect(metaCampaignObjective({ campaign_setup })).toBe('OUTCOME_LEADS')
  expect(CAMPAIGN_OBJECTIVES.OUTCOME_LEADS.label).toBe('Leads')
})

const context = {
  organisation: { id: 'agency', name: 'Oak & Stone', companyEmail: 'hello@example.com', companyPhone: '0211234567' },
  onboarding: { agencyInformation: { agencyName: 'Oak & Stone', businessLines: ['sales', 'rentals'] }, branding: { brandColours: { primary: '#123456' } } },
  organisationSettings: { partnerProfileContent: { agency: { aboutCompany: 'A saved agency introduction.' } } },
}
export const completeAgency = () => cleanSetupPreferences({ agencyName: 'Oak & Stone', services: ['Sales'], serviceAreas: ['Constantia'], language: 'en-ZA', tone: 'Warm and approachable', buyerDestination: 'agent', sellerDestination: 'agent', agencyConfirmed: true, styleConfirmed: true, routingConfirmed: true })

it('reuses saved information while leaving actual marketing choices unconfirmed', () => {
  const result = buildCampaignSetupSources({ organisationId: 'agency', organisationContext: context, profile: { fullName: 'Sarah Jacobs', email: 'sarah@example.com', phoneNumber: '0821234567', language: 'en-ZA' }, sources: { organisation: { active_areas: ['Constantia'], specialties: ['Residential'] } } })
  expect(result.agency).toMatchObject({ agencyName: 'Oak & Stone', services: ['Sales', 'Rentals'], serviceAreas: ['Constantia'], strengths: ['Residential'], about: 'A saved agency introduction.', language: 'en-ZA', tone: '', offers: [], agencyConfirmed: false })
  expect(result.agent).toMatchObject({ name: 'Sarah Jacobs', email: 'sarah@example.com', whatsapp: '', detailsConfirmed: false })
})
it('uses digital card expertise without treating draft cards or disabled enquiry links as active', () => {
  const result = buildCampaignSetupSources({ organisationId: 'agency', sources: { card: { status: 'active', agentDigitalCard: { agent: { name: 'Sarah', whatsapp: '+27821234567' }, profile: { serviceAreas: ['Constantia'], languages: ['English'] } } }, intake: { status: 'disabled', enabledIntents: ['buy'] } } })
  expect(result.agent.whatsapp).toBe('+27821234567')
  expect(result.agency.serviceAreas).toEqual(['Constantia'])
  expect(result.agency.buyerDestination).toBe('agent')
  const draft = buildCampaignSetupSources({ organisationId: 'agency', sources: { card: { status: 'draft', agentDigitalCard: { agent: { name: 'Do not use' } } } } })
  expect(draft.agent.name).toBe('')
})
it('retains available account details when an optional profile column is empty', () => {
  const result = buildCampaignSetupSources({ organisationId: 'agency', profile: { fullName: 'Sarah', email: 'sarah@example.com' }, sources: { profile: { email: null } } })
  expect(result.agent.email).toBe('sarah@example.com')
})
it('suggests saved digital-card areas when the agency area list is empty', () => {
  const result = buildCampaignSetupSources({ organisationId: 'agency', sources: { organisation: { active_areas: [] }, card: { status: 'active', agentDigitalCard: { profile: { serviceAreas: ['Constantia'] } } } } })
  expect(result.agency.serviceAreas).toEqual(['Constantia'])
  expect(result.labels.serviceAreas).toBe('Suggested from your agent digital card')
})
it('never uses another agency’s context or creates strengths from unverified claims', () => {
  const result = buildCampaignSetupSources({ organisationId: 'other', organisationContext: context, workspace: { name: 'Current agency' } })
  expect(result.agency.agencyName).toBe('Current agency')
  expect(result.agency.agencyEmail).toBe('')
  expect(result.agency.strengths).toEqual([])
})
it('asks for invalid legacy details rather than carrying unsafe links into a new setup', () => {
  const result = buildCampaignSetupSources({ organisationId: 'agency', organisationContext: { ...context, branding: { logoUrl: 'javascript:alert(1)' }, onboarding: { agencyInformation: { website: 'not a link' }, branding: { brandColours: { primary: 'bad' } } } }, sources: { profile: { language: 'af', bio: 'a'.repeat(4000) } } })
  expect(result.agency).toMatchObject({ logoUrl: '', website: '', primaryColor: '', language: 'af-ZA' })
  expect(result.agent.bio).toHaveLength(2000)
  expect(validateCampaignSetup(result.agency)).toEqual([])
})
it('allows unfinished drafts and requires confirmed facts, language, tone and routing before completion', () => {
  expect(validateCampaignSetup({})).toEqual([])
  expect(validateCampaignSetup({}, { complete: true }).length).toBeGreaterThan(0)
  expect(validateCampaignSetup(completeAgency(), { complete: true })).toEqual([])
  expect(validateCampaignSetup({ ...completeAgency(), buyerDestination: 'link', buyerUrl: '' }, { complete: true })).toContain('Add the buyer enquiry link.')
  expect(validateCampaignSetup({ ...completeAgency(), buyerDestination: 'agency' }, { complete: true })).toContain('Add an agency email or phone number for agency enquiries.')
})
it('checks link, colour, choice and consent values without accepting send state', () => {
  expect(validateCampaignSetup({ website: 'https://user:password@example.com' }).length).toBeGreaterThan(0)
  expect(validateCampaignSetup({ primaryColor: 'invalid' }).length).toBeGreaterThan(0)
  expect(validateCampaignSetup({ offers: ['Invented free offer'] }).length).toBeGreaterThan(0)
  expect(cleanSetupPreferences({ recipients: ['private@example.com'], status: 'complete', agencyConfirmed: 'true' })).not.toHaveProperty('recipients')
  expect(validateCampaignSetup({ name: 'Sarah', email: 'sarah@example.com', detailsConfirmed: true }, { kind: 'agent', complete: true })).toEqual([])
  expect(validateCampaignSetup({ name: 'Sarah', detailsConfirmed: true }, { kind: 'agent', complete: true }).length).toBeGreaterThan(0)
})
it('detects profile changes without treating refreshed signed image tokens as changed branding', () => {
  const old = { source_snapshot: { agencyName: 'Oak', logoUrl: 'https://example.com/storage/v1/object/sign/brand/logo.png?token=old' } }
  expect(changedSetupSources(old, { agencyName: 'Oak', logoUrl: 'https://example.com/storage/v1/object/sign/brand/logo.png?token=new', agencyConfirmed: true })).toEqual([])
  expect(changedSetupSources(old, { agencyName: 'New name' })).toEqual(['agencyName'])
})
it('refreshes tokens for inherited media while retaining deliberate campaign overrides', () => {
  const previous = 'https://example.com/storage/v1/object/sign/brand/logo.png?token=old'
  const current = 'https://example.com/storage/v1/object/sign/brand/logo.png?token=new'
  const record = { preferences: { logoUrl: previous, agencyName: 'Campaign name' }, source_snapshot: { logoUrl: previous } }
  expect(prefillCampaignSetup(record, { logoUrl: current, agencyName: 'Updated profile name' })).toMatchObject({ logoUrl: current, agencyName: 'Campaign name' })
  expect(prefillCampaignSetup({ ...record, preferences: { logoUrl: 'https://other.example/logo.png' } }, { logoUrl: current }).logoUrl).toBe('https://other.example/logo.png')
})
