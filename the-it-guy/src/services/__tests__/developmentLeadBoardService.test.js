import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
import { saveDevelopmentLeadBoardStage } from '../developmentLeadBoardService.js'

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
    const { client, query } = clientMock()
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
