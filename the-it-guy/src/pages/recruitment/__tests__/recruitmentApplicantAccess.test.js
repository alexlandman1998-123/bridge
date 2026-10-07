import { expect, it, vi } from 'vitest'
import { createRecruitmentIntakeResponse, createLocalRecruitmentIntakeResponse } from '../../../../server/services/recruitmentIntakeApi'
import { createHomeSeekersSignupResponse } from '../../../../server/services/homeSeekersRecruitmentSignupApi'
import { recruitmentSignupRequest } from '../../../services/recruitmentSignupService'

const org='2958d402-368e-43c9-b728-0098e10505f1', token='a'.repeat(64), userId='abcdefab-cdef-4abc-8def-abcdefabcdef'
const env={RECRUITMENT_INTAKE_FINGERPRINT_SECRET:'x'.repeat(32),HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN:token}
const applicant={emailVerification:'verified',stage:'lead_received',applicationSubmitted:false,contact:{firstName:'Fixture',lastName:'Applicant',email:'applicant@example.test',phone:'+27821234567'}}
const email=applicant.contact.email, headers={host:'agency.test',origin:'https://agency.test'}
function fixture({allowed=true, opened=true, error, verified=true, mismatch=false, enquiry=true}={}) {
  const db={from:vi.fn(table=>{const q={select:()=>q,eq:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='recruitment_intake_links'?{id:'link',organisation_id:org,channel:'website',expires_at:'2099-01-01'}:enquiry?{id:'saved-enquiry'}:null})};return q}),rpc:vi.fn(async name=>({data:name==='recruitment_auth_budget'?allowed:name==='recruitment_open_applicant_session'?opened:name==='recruitment_resume_applicant'?applicant:null}))}
  const session={data:{session:{access_token:'private-access',refresh_token:'private-refresh'}},error}
  const authClient={signInWithOtp:vi.fn(async()=>({error})),verifyOtp:vi.fn(async()=>session),signInWithPassword:vi.fn(async()=>session),getUser:vi.fn(async()=>({data:{user:{id:userId,email:mismatch?'foreign@example.test':email,email_confirmed_at:verified?'2026-10-07':null}}}))}
  return {db,authClient}
}
const request=(fixture,action,extra={})=>createRecruitmentIntakeResponse({client:fixture.db,authClient:fixture.authClient,env,headers,body:{action,token,email,code:'123456',password:'Fixture123',userId:'forged',emailVerified:true,...extra}})
it('verifies a provider code and issues an opaque secure cookie after canonical ownership binding',async()=>{
  const f=fixture(), result=await request(f,'verify_email')
  expect(result.body).toEqual({applicant})
  expect(result.headers['Set-Cookie']).toMatch(/=[a-f0-9]{64}; Path=\/api\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/)
  expect(f.authClient.verifyOtp).toHaveBeenCalledWith({email,token:'123456',type:'email'})
  expect(f.authClient.getUser).toHaveBeenCalledWith('private-access')
  expect(f.db.rpc.mock.calls.find(([name])=>name==='recruitment_open_applicant_session')[1]).toMatchObject({p_user_id:userId,p_organisation_id:org})
  expect(JSON.stringify(result)).not.toMatch(/private-access|private-refresh|forged|abcdefab/)
  expect(JSON.stringify(f.db.rpc.mock.calls)).not.toContain('Fixture123')
})
it('supports existing account sign-in without creating accounts, resetting passwords or granting membership',async()=>{
  const f=fixture()
  expect((await request(f,'sign_in')).status).toBe(200)
  expect(f.authClient.signInWithPassword).toHaveBeenCalledWith({email,password:'Fixture123'})
  expect(f.db.rpc.mock.calls.map(([name])=>name)).toEqual(['recruitment_auth_budget','recruitment_open_applicant_session','recruitment_resume_applicant'])
})
it('rejects expired codes, unverified or mismatched identities, unavailable enquiries and spoofed verification',async()=>{
  for(const f of [fixture({error:{code:'otp_expired',message:'private error'}}),fixture({verified:false}),fixture({mismatch:true})]) {
    const result=await request(f,'verify_email');expect(result.status).toBe(401)
    expect(f.db.rpc.mock.calls.some(([name])=>name==='recruitment_open_applicant_session')).toBe(false)
    expect(result.headers).not.toHaveProperty('Set-Cookie')
    expect(JSON.stringify(result)).not.toContain('private error')
  }
  expect((await request(fixture({opened:false}),'sign_in')).status).toBe(409)
  expect((await request(fixture({error:{code:'email_not_confirmed'}}),'sign_in')).body.verificationRequired).toBe(true)
})
it('budgets email sends before requesting provider delivery and does not disclose account existence',async()=>{
  const f=fixture()
  expect((await request(f,'send_verification')).body).toEqual({verificationRequested:true})
  expect(f.authClient.signInWithOtp).toHaveBeenCalledWith({email,options:{shouldCreateUser:false}})
  expect(f.db.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.authClient.signInWithOtp.mock.invocationCallOrder[0])
  const blocked=fixture({allowed:false});expect((await request(blocked,'send_verification')).status).toBe(429);expect(blocked.authClient.signInWithOtp).not.toHaveBeenCalled()
  const absent=fixture({enquiry:false});expect((await request(absent,'send_verification')).body).toEqual({verificationRequested:true});expect(absent.authClient.signInWithOtp).not.toHaveBeenCalled()
  expect((await request(fixture({error:{code:'smtp_failure'}}),'send_verification')).status).toBe(503)
})
it('resumes only with the organisation-scoped cookie, clears invalid cookies and revokes on sign-out',async()=>{
  const f=fixture(), signed=await request(f,'sign_in'), cookie=signed.headers['Set-Cookie'].split(';')[0]
  const resume=extra=>createRecruitmentIntakeResponse({client:f.db,env,headers:{...headers,cookie},body:{token,action:'resume'},...extra})
  expect((await resume()).body).toEqual({applicant})
  expect((await resume({headers})).body).toEqual({applicant:null})
  const out=await resume({body:{token,action:'sign_out'}})
  expect(out.headers['Set-Cookie']).toContain('Max-Age=0')
  expect(f.db.rpc.mock.calls.at(-1)[0]).toBe('recruitment_end_applicant_session')
  f.db.rpc.mockResolvedValueOnce({data:null})
  expect((await resume()).headers['Set-Cookie']).toContain('Max-Age=0')
})
it('rejects cross-origin auth, forged tenant overrides and all preview writes before touching Auth',async()=>{
  const f=fixture()
  expect((await createRecruitmentIntakeResponse({client:f.db,authClient:f.authClient,env,headers:{...headers,origin:'https://foreign.test'},body:{token,action:'sign_in',email,password:'Fixture123'}})).status).toBe(403)
  expect(f.db.from).not.toHaveBeenCalled()
  for(const action of ['send_verification','verify_email','sign_in','sign_out']) {
    expect((await createLocalRecruitmentIntakeResponse({client:f.db,body:{action,token}})).status).toBe(503)
    expect((await createHomeSeekersSignupResponse({client:f.db,body:{action},preview:true})).status).toBe(503)
  }
  expect((await createLocalRecruitmentIntakeResponse({body:{action:'resume',token}})).body.applicant).toBeNull()
  expect((await createHomeSeekersSignupResponse({client:f.db,authClient:f.authClient,env,headers,body:{action:'sign_in',email,password:'Fixture123',organisationId:'foreign'}})).status).toBe(200)
  expect(f.db.rpc.mock.calls.find(([name])=>name==='recruitment_open_applicant_session')[1].p_organisation_id).toBe(org)
})
it('browser sends only selected auth fields with same-origin cookies',async()=>{
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({applicant})}))
  await recruitmentSignupRequest('verify_email',{email,code:'123456',password:'secret',userId:'forged',role:'admin'},{fetcher,token})
  const options=fetcher.mock.calls[0][1]
  expect(JSON.parse(options.body)).toEqual({action:'verify_email',email,code:'123456',token})
  expect(options.credentials).toBe('same-origin')
})
