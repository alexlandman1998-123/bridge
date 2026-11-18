import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
import { saveDevelopmentBuyerMilestone, saveDevelopmentLeadBoardStage } from '../developmentLeadBoardService.js'

const lead = { developerLeadId: '11111111-1111-4111-8111-111111111111', developerOrgId: '22222222-2222-4222-8222-222222222222', sourceAgencyOrgId: '33333333-3333-4333-8333-333333333333', leadStatus: 'new' }
const receipt = { developer_lead_id: lead.developerLeadId, lead_status: 'qualified', updated_at: '2026-10-09T10:00:00Z' }
function clientMock(result = { data: receipt, error: null }, activityError = null) {
  const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result), insert: vi.fn().mockResolvedValue({ error: activityError }) }
  for (const key of ['update', 'eq', 'select']) query[key].mockReturnValue(query)
  return { client: { from: vi.fn().mockReturnValue(query) }, query }
}
afterEach(() => vi.restoreAllMocks())
describe('development board stage persistence', () => {
  it('updates only status under the owning developer and expected current stage', async () => {
    const { client, query } = clientMock()
    const saved = await saveDevelopmentLeadBoardStage({ lead, targetKey: 'qualified', client })
    expect(query.update).toHaveBeenCalledWith({ lead_status: 'qualified' })
    expect(query.eq.mock.calls).toEqual([['developer_org_id', lead.developerOrgId], ['developer_lead_id', lead.developerLeadId], ['lead_status', 'new']])
    expect(saved).toEqual({ developerLeadId: lead.developerLeadId, leadStatus: 'qualified', updatedAt: receipt.updated_at })
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ developer_org_id: lead.developerOrgId, developer_lead_id: lead.developerLeadId, visibility_scope: 'shared', activity_type: 'status_changed' }))
  })
  it.each([{ data: null, error: null }, { data: null, error: new Error('Permission denied') }])('rejects concurrent edits or denied writes without recording a successful move', async result => {
    const { client, query } = clientMock(result)
    await expect(saveDevelopmentLeadBoardStage({ lead, targetKey: 'qualified', client })).rejects.toThrow()
    expect(query.insert).not.toHaveBeenCalled()
  })
  it('requires a confirmed reservation in the database when recording Reserved', async () => {
    const { client, query } = clientMock({ data: { ...receipt, lead_status: 'reserved' }, error: null })
    await saveDevelopmentLeadBoardStage({ lead: { ...lead, reservationState: 'reserved' }, targetKey: 'development_selection', client })
    expect(query.eq).toHaveBeenCalledWith('reservation_state', 'reserved')
  })
  it('does not write workflow actions or unlinked source leads', async () => {
    const { client } = clientMock()
    await expect(saveDevelopmentLeadBoardStage({ lead, targetKey: 'offer', client })).rejects.toThrow('lead workspace')
    await expect(saveDevelopmentLeadBoardStage({ lead: { ...lead, developerLeadId: '' }, targetKey: 'qualified', client })).rejects.toThrow('linked development lead')
    expect(client.from).not.toHaveBeenCalled()
  })
  it('retains a successful status receipt if optional activity recording fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = clientMock(undefined, { code: '42501' })
    await expect(saveDevelopmentLeadBoardStage({ lead, targetKey: 'qualified', client })).resolves.toMatchObject({ leadStatus: 'qualified' })
  })
})


it.each(['reserved', 'onboarding_sent', 'onboarding_submitted', 'otp', 'converted'])('does not rewind %s progress through a popup stage edit', async leadStatus => {
  const { client } = clientMock()
  await expect(saveDevelopmentLeadBoardStage({ lead: { ...lead, leadStatus }, targetKey: 'qualified', client })).rejects.toThrow()
  expect(client.from).not.toHaveBeenCalled()
})


const buyer = { leadId: '44444444-4444-4444-8444-444444444444', developmentId: '55555555-5555-4555-8555-555555555555', developmentLeadContext: { developerLeadId: lead.developerLeadId } }
const linked = { developer_lead_id: lead.developerLeadId, developer_org_id: lead.developerOrgId, source_agency_org_id: null, source_lead_id: buyer.leadId, primary_development_id: buyer.developmentId, lead_owner: 'developer', lead_status: 'new', reservation_state: 'none' }
function milestoneClient(row = linked, saved = receipt) {
  const fixture = clientMock()
  fixture.query.or = vi.fn().mockReturnValue(fixture.query)
  fixture.query.maybeSingle.mockReset().mockResolvedValueOnce({ data: row, error: null }).mockResolvedValueOnce({ data: saved, error: null })
  return fixture
}
it.each(['contacted', 'qualified'])('persists a completed %s milestone to the same scoped development link', async milestone => {
  const { client, query } = milestoneClient(linked, { ...receipt, lead_status: milestone })
  await expect(saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: buyer, milestone, client })).resolves.toMatchObject({ leadStatus: milestone })
  expect(query.eq).toHaveBeenCalledWith('source_lead_id', buyer.leadId)
  expect(query.eq).toHaveBeenCalledWith('primary_development_id', buyer.developmentId)
  expect(query.or).toHaveBeenCalledWith(`developer_org_id.eq.${lead.developerOrgId},source_agency_org_id.eq.${lead.developerOrgId}`)
  expect(query.update).toHaveBeenCalledWith({ lead_status: milestone })
  expect(query.eq).toHaveBeenCalledWith('lead_status', 'new')
})
it.each(['contacted', 'qualified', 'viewing', 'reserved', 'onboarding_sent', 'onboarding_submitted', 'otp', 'converted'])('a retry never rewinds %s progress', async status => {
  const { client, query } = milestoneClient({ ...linked, lead_status: status })
  await expect(saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: buyer, milestone: 'contacted', client })).resolves.toMatchObject({ leadStatus: status, unchanged: true })
  expect(query.update).not.toHaveBeenCalled()
})
it('does not change a confirmed reservation even if the sales label is stale', async () => {
  const { client, query } = milestoneClient({ ...linked, reservation_state: 'reserved' })
  await saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: buyer, milestone: 'qualified', client })
  expect(query.update).not.toHaveBeenCalled()
})
it.each([
  { ...linked, developer_org_id: '99999999-9999-4999-8999-999999999999' },
  { ...linked, source_lead_id: '99999999-9999-4999-8999-999999999999' },
  { ...linked, primary_development_id: '99999999-9999-4999-8999-999999999999' },
  { ...linked, developer_lead_id: '99999999-9999-4999-8999-999999999999' },
  { ...linked, lead_status: 'lost' },
  null,
])('rejects foreign, changed, closed or missing linked milestones', async row => {
  const { client, query } = milestoneClient(row)
  await expect(saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: buyer, milestone: 'contacted', client })).rejects.toThrow()
  expect(query.update).not.toHaveBeenCalled()
})
it('preserves the introducing agency boundary when saving its own buyer milestone', async () => {
  const row = { ...linked, lead_owner: 'agency', source_agency_org_id: lead.sourceAgencyOrgId }
  const { client, query } = milestoneClient(row)
  await expect(saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: buyer, milestone: 'qualified', client })).rejects.toThrow()
  expect(query.update).not.toHaveBeenCalled()
  const own = milestoneClient(row)
  await expect(saveDevelopmentBuyerMilestone({ organisationId: lead.sourceAgencyOrgId, lead: buyer, milestone: 'qualified', client: own.client })).resolves.toMatchObject({ leadStatus: 'qualified' })
})
it('leaves ordinary buyers alone and rejects non-milestone requests', async () => {
  const { client, query } = milestoneClient()
  expect(await saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: { leadId: buyer.leadId }, milestone: 'contacted', client })).toBeNull()
  await expect(saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: buyer, milestone: 'reserved', client })).rejects.toThrow()
  expect(query.update).not.toHaveBeenCalled()
})
it('does not report success after a concurrent development stage change', async () => {
  const { client, query } = milestoneClient(linked, null)
  await expect(saveDevelopmentBuyerMilestone({ organisationId: lead.developerOrgId, lead: buyer, milestone: 'qualified', client })).rejects.toThrow('Refresh')
  expect(query.insert).not.toHaveBeenCalled()
})
