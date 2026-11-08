import { expect, it, vi } from 'vitest'
vi.mock('../../lib/agencyCrmRepository.js', () => ({ createAgencyCrmLeadRecord: vi.fn() }))
vi.mock('../developerLeadService.js', () => ({ createDeveloperFedLead: vi.fn(), createAgencyIntroducedDeveloperLead: vi.fn() }))
vi.mock('../../pages/agency/agencyLeadListReadRepository.js', () => ({ invalidateAgencyLeadListCache: vi.fn() }))
import { createDevelopmentBuyerLead } from '../developmentBuyerLeadCaptureService.js'
import { resolveDevelopmentLeadWorkspaceUrl } from '../../core/developments/developmentLeadBoard.js'

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const input = { organisationId: id(1), developerOrgId: id(1), developmentId: id(2), developmentName: 'Harbour Heights',
  identity: { leadId: id(3), contactId: id(4), developerLeadId: id(5) },
  form: { firstName: 'Jane', lastName: 'Buyer', email: 'jane@example.test', source: 'Other', notes: 'Two bedrooms' },
  actor: { id: id(6), name: 'Agent', email: 'agent@example.test' } }
function dependencies() {
  return { createCrm: vi.fn(async () => ({ leadId: input.identity.leadId, contactId: input.identity.contactId })),
    createDirect: vi.fn(async args => ({ ...args, developerLeadId: input.identity.developerLeadId })),
    createIntroduced: vi.fn(async args => ({ ...args, developerLeadId: input.identity.developerLeadId })), invalidate: vi.fn() }
}

it('creates one canonical buyer and links that exact person into development intake without a transaction or email', async () => {
  const deps = dependencies()
  const result = await createDevelopmentBuyerLead(input, deps)
  expect(deps.createCrm).toHaveBeenCalledWith(id(1), expect.objectContaining({
    leadId: id(3), leadCategory: 'buyer', rawEnquiryPayload: { development_id: id(2), source: 'development_leads_capture' },
    contact: expect.objectContaining({ contactId: id(4), firstName: 'Jane', email: 'jane@example.test' }),
  }), { actor: input.actor, notifyAgent: false })
  expect(deps.createDirect).toHaveBeenCalledWith(expect.objectContaining({ sourceLeadId: result.crmLead.leadId, developerLeadId: id(5), primaryDevelopmentId: id(2) }))
  expect(deps.createIntroduced).not.toHaveBeenCalled()
  expect(deps.invalidate).toHaveBeenCalledWith(id(1))
})

it('resumes a failed development link with the saved CRM identity instead of creating a second buyer', async () => {
  const deps = dependencies()
  let savedCrmLead
  deps.createDirect.mockRejectedValueOnce(Error('Link unavailable'))
  await expect(createDevelopmentBuyerLead({ ...input, onCrmLeadSaved: lead => { savedCrmLead = lead } }, deps)).rejects.toThrow('Buyer lead saved')
  await createDevelopmentBuyerLead({ ...input, savedCrmLead }, deps)
  expect(deps.createCrm).toHaveBeenCalledOnce()
  expect(deps.createDirect.mock.calls.map(([args]) => args.developerLeadId)).toEqual([id(5), id(5)])
})

it('uses the protected agency introduction path when the developer belongs to another workspace', async () => {
  const deps = dependencies()
  deps.createIntroduced.mockResolvedValueOnce({ developerLeadId: id(5), sourceAgencyOrgId: id(1), leadOwner: 'agency' })
  const result = await createDevelopmentBuyerLead({ ...input, developerOrgId: id(8) }, deps)
  expect(result.developerLead.sourceLeadId).toBe(id(3))
  expect(deps.createDirect).not.toHaveBeenCalled()
  expect(deps.createIntroduced).toHaveBeenCalledWith(expect.objectContaining({ developerOrgId: id(8), sourceAgencyOrgId: id(1), sourceLeadId: id(3) }))
})

it('rejects an unresolved workspace or identity mismatch before linking another person', async () => {
  const deps = dependencies()
  await expect(createDevelopmentBuyerLead({ ...input, organisationId: '' }, deps)).rejects.toThrow('resolved workspace')
  expect(deps.createCrm).not.toHaveBeenCalled()
  deps.createCrm.mockResolvedValueOnce({ leadId: id(999) })
  await expect(createDevelopmentBuyerLead(input, deps)).rejects.toThrow('identity could not be verified')
  expect(deps.createDirect).not.toHaveBeenCalled()
})

it('opens the precise shared buyer in its owning workspace and keeps other-agency leads protected', () => {
  const lead = { developerLeadId: id(5), sourceLeadId: id(3), developerOrgId: id(1), leadOwner: 'developer' }
  expect(resolveDevelopmentLeadWorkspaceUrl(lead, id(1))).toBe(`/pipeline/leads/${id(3)}?tab=overview`)
  expect(resolveDevelopmentLeadWorkspaceUrl(lead, id(1), 'onboarding_otp')).toContain('tab=buyer_profile')
  expect(resolveDevelopmentLeadWorkspaceUrl(lead, id(9))).toBe(`/developer/leads/${id(5)}?workspaceTab=overview`)
  expect(resolveDevelopmentLeadWorkspaceUrl({ ...lead, leadOwner: 'agency', sourceAgencyOrgId: id(7) }, id(7))).toContain(`/pipeline/leads/${id(3)}`)
  expect(resolveDevelopmentLeadWorkspaceUrl({ ...lead, sourceLeadId: '' }, id(1))).toContain(`/developer/leads/${id(5)}`)
})


it('keeps the membership branch and userId-shaped assignee on both sides of development capture', async () => {
  const deps = dependencies()
  const assignedAgent = { userId: id(9), branchId: id(10), email: 'agent@example.test' }
  await createDevelopmentBuyerLead({ ...input, assignedAgent }, deps)
  expect(deps.createCrm.mock.calls[0][1]).toMatchObject({ assignedUserId: id(9), branchId: id(10) })
  expect(deps.createDirect.mock.calls[0][0]).toMatchObject({ assignedAgentId: id(9), sourceAgentUserId: id(9) })
})
