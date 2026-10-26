import { expect, it } from 'vitest'
import { assertCampaignContacts, cleanContactProvenance, confirmCampaignContacts, contactProvenanceReview, createContactProvenance, GENERAL_CONTACT_FIELDS, withContactOverride } from '../campaignContactProvenance'

const source = { agentName: 'Alex', agentEmail: 'alex@example.test', agentPhone: '+27820000000', destination: 'alex@example.test' }
const reviewed = (value = source) => confirmCampaignContacts({ source: value, contactProvenance: createContactProvenance(value) })

it('records empty source fields exactly and never infers provenance while reading an older draft', () => {
  expect(createContactProvenance({ agentName: ' Alex ' }).source).toEqual({ agentName: 'Alex', agentEmail: '', agentPhone: '', destination: '' })
  expect(cleanContactProvenance(undefined, source)).toBeUndefined()
  expect(contactProvenanceReview({ source }, source).reason).toBe('legacy')
  expect(() => assertCampaignContacts({ source }, source)).toThrow(/Older drafts/)
})

it('blocks removal, addition and changes of every public contact after confirmation', () => {
  const builder = reviewed()
  expect(() => assertCampaignContacts(builder, source)).not.toThrow()
  for (const key of Object.keys(source)) {
    expect(() => assertCampaignContacts(builder, { ...source, [key]: '' })).toThrow(/changed or were removed/)
    expect(() => assertCampaignContacts(builder, { ...source, [key]: 'Changed' })).toThrow(/changed or were removed/)
    const missing = { ...source, [key]: '' }
    expect(() => assertCampaignContacts(reviewed(missing), source)).toThrow(/changed or were removed/)
  }
  expect(builder.source).toEqual(source)
})

it('supports an explicit campaign-only override after review and still detects later public-source changes', () => {
  const raw = { ...source, destination: '' }
  const next = withContactOverride(reviewed(raw), 'destination', 'campaign@example.test')
  expect(next.contactProvenance.confirmed).toBe(false)
  expect(() => assertCampaignContacts(next, raw)).toThrow(/Confirm/)
  const confirmed = confirmCampaignContacts(next)
  expect(() => assertCampaignContacts(confirmed, raw)).not.toThrow()
  expect(confirmed.contactProvenance.source.destination).toBe('')
  expect(confirmed.contactProvenance.overrides.destination).toBe('campaign@example.test')
  expect(() => assertCampaignContacts(confirmed, source)).toThrow(/changed/)
  expect(withContactOverride(confirmed, 'destination', '', undefined, false).source.destination).toBe('')
})

it('rejects forged effective values, unknown/private keys, unsupported versions and oversized snapshots', () => {
  const provenance = reviewed().contactProvenance
  for (const patch of [null, { ...provenance, version: 2 }, { ...provenance, confirmed: 'true' }, { ...provenance, source: { ...provenance.source, privateClientId: 'secret' } }, { ...provenance, overrides: { sellerEmail: 'private@example.test' } }, { ...provenance, source: { ...provenance.source, agentName: 'x'.repeat(6001) } }, { ...provenance, unexpected: true }]) expect(() => cleanContactProvenance(patch, source)).toThrow()
  expect(() => cleanContactProvenance(provenance, { ...source, destination: 'unrecorded@example.test' })).toThrow(/does not match/)
})

it('keeps the general contract limited to the public name and response destination', () => {
  const builder = confirmCampaignContacts({ source, contactProvenance: createContactProvenance(source, GENERAL_CONTACT_FIELDS) }, GENERAL_CONTACT_FIELDS)
  expect(Object.keys(builder.contactProvenance.source)).toEqual(GENERAL_CONTACT_FIELDS)
  expect(() => assertCampaignContacts(builder, source, GENERAL_CONTACT_FIELDS)).not.toThrow()
  expect(() => withContactOverride(builder, 'agentEmail', 'new@example.test', GENERAL_CONTACT_FIELDS)).toThrow()
})
it('preserves input spaces while typing a campaign-only full name and normalises it on confirmation', () => {
  const start = withContactOverride(reviewed(), 'agentName', 'Alex ')
  expect(start.source.agentName).toBe('Alex ')
  const next = withContactOverride(start, 'agentName', 'Alex Jacobs ')
  expect(next.source.agentName).toBe('Alex Jacobs ')
  const confirmed = confirmCampaignContacts(next)
  expect(confirmed.source.agentName).toBe('Alex Jacobs')
  expect(confirmed.contactProvenance.overrides.agentName).toBe('Alex Jacobs')
  expect(() => assertCampaignContacts(confirmed, source)).not.toThrow()
})
