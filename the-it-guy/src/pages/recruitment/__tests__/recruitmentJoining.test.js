import { afterEach, expect, it, vi } from 'vitest'
import { emptyRecruitmentLead } from '../recruitmentModel'
import { emptyJoiningPlan, joiningPlanError, joiningPlanFor } from '../recruitmentJoiningModel'

const api = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ supabase: api }))
import { getRecruitmentJoiningConnections, getRecruitmentJoiningOptions, listJoiningRecruitmentLeads, RecruitmentMatchError, saveRecruitmentLead } from '../../../services/recruitmentService'
afterEach(() => vi.resetAllMocks())

it('loads scoped progress through the bounded server projection and paginates past the API limit',async()=>{
  const first=Array.from({length:200},(_,id)=>({id:String(id),status:'under_review'}))
  api.rpc.mockResolvedValueOnce({data:first}).mockResolvedValueOnce({data:[{id:'last'}]})
  expect(await listJoiningRecruitmentLeads('agency','branch')).toHaveLength(201)
  expect(api.rpc.mock.calls).toEqual([0,200].map(offset=>['recruitment_joining_progress',{p_organisation_id:'agency',p_branch_id:'branch',p_offset:offset,p_commercial:false,p_limited:false}]))
  expect(api.from).not.toHaveBeenCalled()
  api.rpc.mockResolvedValue({error:{code:'PGRST202'}})
  await expect(listJoiningRecruitmentLeads('agency')).rejects.toThrow('setup is pending')
})

it('retains tentative joining choices and the original entry point without inferring staff access', () => {
  const plan = { ...emptyJoiningPlan('branch'), branchId: '11111111-1111-4111-8111-111111111111', role: 'senior_agent', businessWorkspaces: ['sales','rentals'], commissionStructureId: '22222222-2222-4222-8222-222222222222', startDate: '2026-10-15' }
  expect(joiningPlanError(plan)).toBe('')
  expect(joiningPlanFor({ id: 'lead', joining_json: plan })).toEqual(plan)
  expect(joiningPlanFor({ id: 'legacy' }).origin.entryPoint).toBe('legacy')
  for (const change of [{role:'principal'}, {businessWorkspaces:['sales','sales']}, {businessWorkspaces:['forged']}, {branchId:'bad'}, {startDate:'2026-02-31'}, {origin:{entryPoint:'forged'}}]) expect(joiningPlanError({...plan,...change})).not.toBe('')
})

it.each(['review_required','existing_member'])('returns reviewable matches without silently merging or creating access (%s)', async (outcome) => {
  const matches = { leads: [{ id: 'existing', name: 'Candidate' }], members: [], invites: [] }
  api.rpc.mockResolvedValue({ data: { outcome, matches }, error: null })
  const draft = { ...emptyRecruitmentLead(), name: 'Test Agent', email: 'agent@example.test' }
  const error = await saveRecruitmentLead('agency', draft).catch((error) => error)
  expect(error).toBeInstanceOf(RecruitmentMatchError)
  expect(error.matches).toEqual(matches)
  expect(api.rpc).toHaveBeenCalledTimes(1)
  expect(api.from).not.toHaveBeenCalled()
})

it('passes an explicit match review and selected existing invitation to the atomic creation RPC', async () => {
  const draft = { ...emptyRecruitmentLead(), name: 'Test Agent', email: 'agent@example.test', joining_invite_id: 'existing-invite' }
  draft.joining_json.reviewedMatches = true
  api.rpc.mockResolvedValue({ data: { outcome: 'created', lead: { ...draft, id: 'saved' } }, error: null })
  expect((await saveRecruitmentLead('agency', draft)).id).toBe('saved')
  expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_organisation_id: 'agency', p_lead: { joining_invite_id: 'existing-invite', joining_json: { reviewedMatches: true }, intake_key: draft.intake_key } })
})

it('keeps joining choices in versioned saves and reports locked choices and missing migrations', async () => {
  const chain = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }
  for (const key of ['update','eq','select']) chain[key].mockReturnValue(chain)
  api.from.mockReturnValue(chain)
  const draft = { ...emptyRecruitmentLead(), id: 'lead', name: 'Test Agent', email: 'agent@example.test', version: 4 }
  chain.maybeSingle.mockResolvedValue({ data: draft, error: null })
  await saveRecruitmentLead('agency', draft)
  expect(chain.update.mock.calls[0][0].joining_json).toEqual(draft.joining_json)
  expect(chain.eq.mock.calls).toEqual([['organisation_id','agency'],['id','lead'],['version',4]])
  chain.maybeSingle.mockResolvedValue({ error: { code: 'P0001', message: 'Joining choices are locked after agent access is prepared' } })
  await expect(saveRecruitmentLead('agency', draft)).rejects.toThrow('locked')
  api.rpc.mockResolvedValue({ error: { code: 'PGRST202' } })
  await expect(getRecruitmentJoiningOptions('agency')).rejects.toThrow('setup is pending')
})

it('scopes invitation history and choice lookups to the requested organisation and lead', async () => {
  api.rpc.mockResolvedValue({ data: { applications: [], workspace: [] }, error: null })
  await getRecruitmentJoiningConnections('agency', 'lead')
  await getRecruitmentJoiningOptions('agency')
  expect(api.rpc.mock.calls).toEqual([
    ['recruitment_joining_connections',{p_organisation_id:'agency',p_lead_id:'lead'}],
    ['recruitment_joining_options',{p_organisation_id:'agency'}],
  ])
})
