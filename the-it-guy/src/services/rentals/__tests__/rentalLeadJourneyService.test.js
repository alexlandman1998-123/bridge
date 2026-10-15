import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({update:vi.fn(),applications:vi.fn(),checks:vi.fn(),viewings:vi.fn()}))
vi.mock('../../../lib/agencyCrmRepository',()=>({updateAgencyCrmLeadRecord:mocks.update,createAgencyCrmLeadActivity:vi.fn().mockResolvedValue({}),createAgencyCrmLeadRecord:vi.fn(),fetchAgencyCrmLeadWorkspace:vi.fn(),listAgencyCrmLeadContacts:vi.fn()}))
vi.mock('../rentalApplicationRepository',()=>({listPersistedRentalApplicationsForLead:mocks.applications,listRentalApplicationScreeningChecks:mocks.checks}))
vi.mock('../rentalViewingService',()=>({listRentalViewings:mocks.viewings}))
vi.mock('../rentalListingDraftService',()=>({getRentalListingForAgent:vi.fn()}))
vi.mock('../rentalLandlordMandateRepository',()=>({listRentalPropertyMandates:vi.fn()}))
vi.mock('../../../lib/settingsApi',()=>({listOrganisationUsersForWorkspace:vi.fn()}))
import { advanceRentalLead } from '../rentalLeadService.js'
import { createRentalCrmLeadMetadata } from '../rentalCrmLeadModel.js'
const lead=stage=>({id:'lead',name:'Fixture Tenant',role:'tenant',stage,updatedAt:'2026-10-14T08:00:00Z',relationships:{},raw:{leadId:'lead',organisationId:'org',rawEnquiryPayload:createRentalCrmLeadMetadata({organisationId:'org',role:'tenant',stage})}})
const context={organisationId:'org',actor:{id:'agent'}}
beforeEach(()=>{
  vi.clearAllMocks()
  mocks.applications.mockResolvedValue([]);mocks.checks.mockResolvedValue([])
  mocks.update.mockImplementation(async(org,id,patch)=>({leadId:id,organisationId:org,...patch}))
})
it('records the milestone and guards the exact saved version when moving one step',async()=>{
  await advanceRentalLead(lead('new'),{...context,toStage:'contacted'})
  expect(mocks.update).toHaveBeenCalledWith('org','lead',expect.objectContaining({rawEnquiryPayload:expect.objectContaining({classification:'rental',role:'tenant',stage:'contacted',workflow:expect.objectContaining({lastEvent:expect.objectContaining({stage:'contacted',records:{}})})})}),{expectedUpdatedAt:'2026-10-14T08:00:00Z'})
})
it('does not write when the linked application has not been approved',async()=>{
  mocks.applications.mockResolvedValue([{id:'app',leadId:'lead',organisationId:'org',status:'submitted'}])
  await expect(advanceRentalLead(lead('fica_complete'),{...context,toStage:'placement_ready'})).rejects.toThrow('Approve the linked application')
  expect(mocks.update).not.toHaveBeenCalled()
})
it('binds placement to the saved approved application and keeps the rental classification',async()=>{
  mocks.applications.mockResolvedValue([{id:'app',leadId:'lead',organisationId:'org',status:'approved',vacancyId:'vacancy',unitId:'unit'}])
  const result=await advanceRentalLead(lead('fica_complete'),{...context,toStage:'placement_ready'})
  expect(result.relationships).toMatchObject({applicationId:'app',vacancyId:'vacancy',unitId:'unit'})
  expect(result.raw.rawEnquiryPayload.classification).toBe('rental')
})
it('rejects unknown saved stages and missing versions before writing',async()=>{
  await expect(advanceRentalLead({...lead('new'),savedStage:'unknown'},{...context,toStage:'contacted'})).rejects.toThrow('review the saved journey')
  await expect(advanceRentalLead({...lead('new'),updatedAt:''},{...context,toStage:'contacted'})).rejects.toThrow('Refresh')
  expect(mocks.update).not.toHaveBeenCalled()
})
it('records landlord contact completion without inventing a scheduled appraisal time',async()=>{
  const landlord={...lead('contacted'),role:'landlord',raw:{leadId:'lead',organisationId:'org',rawEnquiryPayload:createRentalCrmLeadMetadata({organisationId:'org',role:'landlord',stage:'contacted'})}}
  await advanceRentalLead(landlord,{...context,toStage:'appraisal_scheduled',evidence:{actionKey:'mark_contacted',note:'Contact confirmed by agent.'}})
  const saved=mocks.update.mock.calls[0][2].rawEnquiryPayload.workflow.lastEvent
  expect(saved).toMatchObject({stage:'appraisal_scheduled',actionKey:'mark_contacted',recordedBy:'agent'})
  expect(saved.scheduledFor).toBeUndefined()
})
