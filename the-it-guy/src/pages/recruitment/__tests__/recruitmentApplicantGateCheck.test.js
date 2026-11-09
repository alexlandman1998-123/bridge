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
it.each([null, undefined, 'false', 0, {}, []])('rejects a malformed successful access verdict: %j', async data => {
 const db = { rpc: async () => ({ data, error: null }) }
 expect(await checkRecruitmentApplicantGate(db,'user-1')).toEqual({ required: false, error: true, retryable: false })
})
it.each([
 {status:503,error:{code:'PGRST003'}},
 {status:502,error:{message:'gateway unavailable'}},
 {status:408,error:{}},
 {status:0,error:{code:'',message:'Failed to fetch'}},
 {status:500,error:{code:'57014'}},
])('classifies transient failures for bounded recovery: %j',async result=> {
 const db={rpc:async()=>result}
 expect(await checkRecruitmentApplicantGate(db,'user-1')).toEqual({required:false,error:true,retryable:true})
})
it.each([
 {status:401,error:{}}, {status:403,error:{}},
 {status:503,error:{code:'42501'}}, {status:503,error:{code:'PGRST202'}},
 {status:503,error:{code:'PGRST301'}}, {status:400,error:{code:'42P01'}},
])('keeps permission and configuration failures closed without automatic retries: %j',async result=> {
 const db={rpc:async()=>result}
 expect(await checkRecruitmentApplicantGate(db,'user-1')).toEqual({required:false,error:true,retryable:false})
})
it('forwards the cancellation signal to the real access RPC',async()=> {
 const signal=new AbortController().signal
 const abortSignal=vi.fn(async()=>({data:false,error:null}))
 const db={rpc:vi.fn(()=>({abortSignal}))}
 expect(await checkRecruitmentApplicantGate(db,'user-1',{signal})).toEqual({required:false,error:false})
 expect(abortSignal).toHaveBeenCalledWith(signal)
})
