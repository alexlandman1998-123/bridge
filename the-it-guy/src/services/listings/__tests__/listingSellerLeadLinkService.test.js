import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
vi.mock('../../../lib/agencyCrmUpdateBus', () => ({ emitAgencyCrmUpdated: vi.fn() }))
import { emitAgencyCrmUpdated } from '../../../lib/agencyCrmUpdateBus'
import { getListingSellerLeadId, linkListingSellerLead, searchListingSellerLeads } from '../listingSellerLeadLinkService'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const listing = { id: id(1), organisationId: id(2) }
let calls, responses, client
beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  responses = {
    contacts: { data: [{ contact_id: id(3), first_name: 'Jane', last_name: 'Seller', email: 'jane@example.test' }] },
    leads: { data: [{ lead_id: id(4), contact_id: id(3), seller_property_address: '12 Main Road' }, { lead_id: id(5), contact_id: id(3) }] },
    private_listings: { data: [{ seller_lead_id: id(5) }] },
  }
  client = { from: vi.fn(table => {
    const call = { table, filters: [] }; calls.push(call)
    const query = { then: (resolve, reject) => Promise.resolve(responses[table]).then(resolve, reject) }
    for (const method of ['select', 'eq', 'or', 'in', 'neq', 'order', 'limit']) query[method] = (...args) => { call.filters.push([method, ...args]); return query }
    return query
  }), rpc: vi.fn().mockResolvedValue({ data: { listingId: listing.id, organisationId: listing.organisationId, sellerLeadId: id(4), originatingCrmLeadId: id(4) } }) }
})
it('searches persisted seller leads within the organisation and excludes inverse links to other listings', async () => {
  const results = await searchListingSellerLeads({ listing, search: 'Jane Seller' }, { client })
  expect(results).toEqual([expect.objectContaining({ leadId: id(4), name: 'Jane Seller', propertyAddress: '12 Main Road' })])
  for (const call of calls) expect(call.filters).toContainEqual(['eq', 'organisation_id', listing.organisationId])
  expect(calls.find(call => call.table === 'leads').filters).toContainEqual(['eq', 'lead_category', 'seller'])
  expect(calls[0].filters.filter(filter => filter[0] === 'or')).toHaveLength(2)
})
it('does not issue searches for short inputs and sanitises filter syntax', async () => {
  expect(await searchListingSellerLeads({ listing, search: '%' }, { client })).toEqual([])
  expect(client.from).not.toHaveBeenCalled()
  await searchListingSellerLeads({ listing, search: 'Jane),%_' }, { client })
  expect(calls[0].filters.find(filter => filter[0] === 'or')[1]).toBe('first_name.ilike.%Jane%,last_name.ilike.%Jane%,email.ilike.%Jane%,phone.ilike.%Jane%')
})
it('fails closed on denied reads instead of reporting an empty match list', async () => {
  responses.leads = { error: new Error('Access denied') }
  await expect(searchListingSellerLeads({ listing, search: 'Jane' }, { client })).rejects.toThrow('Access denied')
})
it('uses one atomic RPC and emits a CRM refresh only after verifying its receipt', async () => {
  const result = await linkListingSellerLead({ listing, leadId: id(4) }, { client })
  expect(result.sellerLeadId).toBe(id(4))
  expect(client.rpc).toHaveBeenCalledWith('bridge_link_listing_seller_lead', { p_listing_id: listing.id, p_lead_id: id(4), p_organisation_id: listing.organisationId })
  expect(client.from).not.toHaveBeenCalled()
  expect(emitAgencyCrmUpdated).toHaveBeenCalledTimes(1)
})
it('rejects replacements, absent migration and unconfirmed results without claiming success', async () => {
  expect(getListingSellerLeadId({ originating_crm_lead_id: id(5) })).toBe(id(5))
  await expect(linkListingSellerLead({ listing: { ...listing, sellerLeadId: id(5) }, leadId: id(4) }, { client })).rejects.toThrow('already has')
  expect(client.rpc).not.toHaveBeenCalled()
  client.rpc.mockResolvedValueOnce({ error: { code: 'PGRST202' } })
  await expect(linkListingSellerLead({ listing, leadId: id(4) }, { client })).rejects.toThrow('not available yet')
  client.rpc.mockResolvedValueOnce({ data: { listingId: listing.id, sellerLeadId: id(5) } })
  await expect(linkListingSellerLead({ listing, leadId: id(4) }, { client })).rejects.toThrow('could not be confirmed')
  expect(emitAgencyCrmUpdated).not.toHaveBeenCalled()
})
