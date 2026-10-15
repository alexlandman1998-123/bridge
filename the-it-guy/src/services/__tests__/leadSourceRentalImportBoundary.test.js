import { expect, it, vi } from 'vitest'
const create=vi.hoisted(()=>vi.fn())
vi.mock('../leadIngestionService',()=>({createOrUpdateLeadFromEnquiry:create,normalizeLeadSource:value=>value,recordLeadIngestionFailure:vi.fn()}))
vi.mock('../privateListingService',()=>({getOrganisationPrivateListings:vi.fn().mockResolvedValue([])}))
import { mapManualImportRow, processManualImportPayload } from '../leadSourceConnectorService.js'
it.each([{Role:'Tenant'},{'Lead Category':'Landlord'},{leadIntent:'rent'},{raw_enquiry_payload:{classification:'rental'}}])('rejects explicit rental rows at the sales ingestion boundary before any write',async row=>{
  create.mockClear()
  expect(()=>mapManualImportRow({Name:'Fixture',Phone:'0825550101',...row})).toThrow('Rentals → Leads → Import')
  const result=await processManualImportPayload([{Name:'Fixture',Phone:'0825550101',...row}],{organisationId:'org'})
  expect(result).toMatchObject({processed:0,failed:1})
  expect(create).not.toHaveBeenCalled()
})
it('allows a genuine seller row whose message describes a rental investment',()=>{
  expect(mapManualImportRow({Name:'Fixture','Lead Category':'seller',Message:'Rental investment for sale'}).leadCategory).toBe('seller')
})
