import { expect, it, vi } from 'vitest'
import { checkRecruitmentApplicantGate } from '../recruitmentApplicantGateCheck'
function client(error = { code: 'PGRST202' }, memberships = [{ user_id: 'user-1' }], membershipError = null) {
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), limit: vi.fn(async () => ({ data: memberships, error: membershipError })) }
  return { rpc: vi.fn(async () => ({ data: true, error })), from: vi.fn(() => query), query }
}
const preview = { development: true, listingPreview: true }
it('retains the real applicant decision when the function exists', async () => {
 const db = client(null)
 expect(await checkRecruitmentApplicantGate(db, 'user-1', preview)).toEqual({ required: true, error: false })
 expect(db.from).not.toHaveBeenCalled()
})
it.each([{development:false,listingPreview:true},{development:true,listingPreview:false}])('never falls back outside the explicit local preview: %j', async options => {
 const db=client()
 expect((await checkRecruitmentApplicantGate(db,'user-1',options)).error).toBe(true)
 expect(db.from).not.toHaveBeenCalled()
})
it('requires a database-verified active membership for the local preview', async () => {
 const db=client()
 expect(await checkRecruitmentApplicantGate(db,'user-1',preview)).toEqual({required:false,error:false})
 expect(db.query.eq).toHaveBeenCalledWith('user_id','user-1')
 expect(db.query.eq).toHaveBeenCalledWith('status','active')
})
it.each([[],null])('blocks the preview without active membership: %j',async memberships=> {
 expect((await checkRecruitmentApplicantGate(client(undefined,memberships),'user-1',preview)).error).toBe(true)
})
it('blocks failed membership checks',async()=> {
 expect((await checkRecruitmentApplicantGate(client(undefined,[],{code:'42501'}),'user-1',preview)).error).toBe(true)
})
it('does not fall back on network or permission errors',async()=> {
 const db=client({code:'42501'})
 expect((await checkRecruitmentApplicantGate(db,'user-1',preview)).error).toBe(true)
 expect(db.from).not.toHaveBeenCalled()
})
