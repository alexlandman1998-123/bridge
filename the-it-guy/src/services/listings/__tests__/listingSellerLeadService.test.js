import { beforeEach, expect, it, vi } from 'vitest'
import { ensureListingSellerLead } from '../listingSellerLeadService'
import { buildAgencyLeadListModel } from '../../../pages/agency/agencyLeadListModel'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadRecord: vi.fn(), updateAgencyCrmLeadRecord: vi.fn() }))
vi.mock('../../privateListingService', () => ({ updatePrivateListing: vi.fn() }))
const org = '00000000-0000-4000-8000-000000000001'
const listingId = '00000000-0000-4000-8000-000000000002'
const capture = {
  listing: { id: listingId, organisationId: org, title: 'Montana home', addressLine1: '12 Test Street', askingPrice: 1295000 },
  seller: { firstName: 'Jane', lastName: 'Seller', email: 'jane@example.com', phone: '0721234567' },
  assignment: { id: '00000000-0000-4000-8000-000000000003', name: 'Kevin', email: 'agent@example.com', branchId: 'branch-1' },
  source: 'Referral', notes: 'Called about listing', actor: { id: 'agent-1' },
}
let db, dependencies, denied
beforeEach(() => {
  denied = false
  db = { private_listings: [{ id: listingId, organisation_id: org, seller_lead_id: null, originating_crm_lead_id: null, listing_category: 'private_sale', seller_type: 'individual' }], leads: [], contacts: [] }
  const client = { from(table) {
    const filters = []; let limit = Infinity
    const execute = () => denied ? { error: new Error('Access denied') } : { data: structuredClone(db[table].filter((row) => filters.every(([key, value]) => row[key] === value)).slice(0, limit)) }
    const query = { select() { return query }, eq(key, value) { filters.push([key, value]); return query }, limit(value) { limit = value; return query },
      async single() { const result = execute(); return result.error ? result : { data: result.data[0] || null } },
      async maybeSingle() { return query.single() }, then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject) } }
    return query
  } }
  dependencies = { client,
    createLead: vi.fn(async (organisationId, payload) => {
      db.contacts = db.contacts.filter((row) => row.contact_id !== payload.contact.contactId)
      db.contacts.push({ ...payload.contact, organisation_id: organisationId, contact_id: payload.contact.contactId })
      const lead = { ...payload.lead, organisationId, contactId: payload.contact.contactId }
      db.leads.push({ lead_id: lead.leadId, organisation_id: organisationId, contact_id: lead.contactId, lead_category: 'seller', listing_id: lead.listingId, stage: lead.stage })
      return lead
    }),
    updateListing: vi.fn(async (id, patch) => { Object.assign(db.private_listings.find((row) => row.id === id), { seller_lead_id: patch.sellerLeadId, originating_crm_lead_id: patch.originatingCrmLeadId }) }),
    updateLead: vi.fn(async (organisationId, id, patch) => { Object.assign(db.leads.find((row) => row.lead_id === id && row.organisation_id === organisationId), { listing_id: patch.listingId }) }),
  }
})

it('creates a scoped seller contact and lead, links both directions and makes it visible in Seller Leads', async () => {
  const lead = await ensureListingSellerLead(capture, dependencies)
  expect(lead.leadId).toMatch(/^[0-9a-f-]{14}5[0-9a-f-]{21}$/)
  const payload = dependencies.createLead.mock.calls[0][1]
  expect(payload.assignedAgent).toMatchObject({ id: capture.assignment.id, name: 'Kevin', email: 'agent@example.com' })
  expect(payload.contact).toMatchObject({ firstName: 'Jane', lastName: 'Seller', email: 'jane@example.com', phone: '0721234567' })
  expect(payload.lead).toMatchObject({ listingId, leadCategory: 'Seller', leadSource: 'Referral', sellerPropertyAddress: '12 Test Street', estimatedValue: 1295000 })
  expect(db.private_listings[0]).toMatchObject({ seller_lead_id: lead.leadId, originating_crm_lead_id: lead.leadId })
  const model = buildAgencyLeadListModel({ category: 'seller', leads: [lead], contacts: [{ ...payload.contact, contactId: lead.contactId }] })
  expect(model.rows[0].name).toBe('Jane Seller')
  expect(model.columns.flatMap((column) => column.cards)).toHaveLength(1)
})

it('reuses a persisted lead after listing linkage fails without resetting its stage', async () => {
  dependencies.updateListing.mockRejectedValueOnce(new Error('Connection lost'))
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('Connection lost')
  db.leads[0].stage = 'Mandate Signed'
  await ensureListingSellerLead(capture, dependencies)
  await ensureListingSellerLead(capture, dependencies)
  expect(dependencies.createLead).toHaveBeenCalledTimes(1)
  expect(db.leads).toHaveLength(1)
  expect(db.contacts).toHaveLength(1)
  expect(db.leads[0].stage).toBe('Mandate Signed')
})

it('reuses the same contact identity when contact persistence succeeds but lead creation fails', async () => {
  dependencies.createLead.mockImplementationOnce(async (organisationId, payload) => {
    db.contacts.push({ contact_id: payload.contact.contactId, organisation_id: organisationId })
    throw new Error('Lead save failed')
  })
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('Lead save failed')
  const firstPayload = dependencies.createLead.mock.calls[0][1]
  await ensureListingSellerLead(capture, dependencies)
  const secondPayload = dependencies.createLead.mock.calls[1][1]
  expect(firstPayload.contact.contactId).toBe(secondPayload.contact.contactId)
  expect(firstPayload.lead.leadId).toBe(secondPayload.lead.leadId)
  expect(db.contacts).toHaveLength(1)
})

it('repairs a missing listing-side origin link by retaining the existing seller lead', async () => {
  const lead = await ensureListingSellerLead(capture, dependencies)
  db.private_listings[0].originating_crm_lead_id = null
  await ensureListingSellerLead(capture, dependencies)
  expect(db.private_listings[0].originating_crm_lead_id).toBe(lead.leadId)
  expect(dependencies.createLead).toHaveBeenCalledTimes(1)
})

it('fails closed for another organisation and denied reads', async () => {
  await expect(ensureListingSellerLead({ ...capture, listing: { ...capture.listing, organisationId: listingId } }, dependencies)).rejects.toThrow('could not be verified')
  denied = true
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('Access denied')
  expect(dependencies.createLead).not.toHaveBeenCalled()
  expect(dependencies.updateListing).not.toHaveBeenCalled()
})

it('never replaces conflicting seller links or attaches a buyer lead as the seller', async () => {
  db.private_listings[0].seller_lead_id = org
  db.private_listings[0].originating_crm_lead_id = listingId
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('conflicting')
  db.private_listings[0].originating_crm_lead_id = org
  db.leads.push({ lead_id: org, organisation_id: org, contact_id: org, lead_category: 'buyer' })
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('not the seller')
  expect(dependencies.createLead).not.toHaveBeenCalled()
})

it('does not report success when the saved seller links cannot be read back', async () => {
  dependencies.updateListing.mockResolvedValue(undefined)
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('link could not be verified')
})

it('requires an existing seller contact and refuses to guess between duplicate linked leads', async () => {
  await ensureListingSellerLead(capture, dependencies)
  db.contacts = []
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('no verified contact')
  db.private_listings[0].seller_lead_id = null
  db.private_listings[0].originating_crm_lead_id = null
  db.leads.push({ ...db.leads[0], lead_id: org })
  await expect(ensureListingSellerLead(capture, dependencies)).rejects.toThrow('More than one seller lead')
  expect(dependencies.createLead).toHaveBeenCalledTimes(1)
})

it('does not create sales seller leads for empty drafts, rentals or developers', async () => {
  expect(await ensureListingSellerLead({ ...capture, seller: {} }, dependencies)).toBeNull()
  db.private_listings[0].listing_category = 'rental'
  expect(await ensureListingSellerLead(capture, dependencies)).toBeNull()
  db.private_listings[0].listing_category = 'development_unit'
  db.private_listings[0].seller_type = 'developer'
  expect(await ensureListingSellerLead(capture, dependencies)).toBeNull()
  expect(dependencies.createLead).not.toHaveBeenCalled()
})
