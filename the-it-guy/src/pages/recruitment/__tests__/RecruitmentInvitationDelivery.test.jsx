// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RecruitmentInvitationDelivery from '../RecruitmentInvitationDelivery'
import { getRecruitmentInvitationStatus, sendRecruitmentInvitation } from '../../../services/recruitmentService'
vi.mock('../../../services/recruitmentService',()=>({getRecruitmentInvitationStatus:vi.fn(),sendRecruitmentInvitation:vi.fn()}))
const prepared={referenceStatus:'prepared',expiresAt:'2026-12-01',recipient:'sam@example.test',attempt:null}
const props={organisationId:'org',leadId:'lead',kind:'workspace',referenceId:'invite'}
beforeEach(()=>vi.mocked(getRecruitmentInvitationStatus).mockResolvedValue(prepared))
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('distinguishes link preparation from provider acceptance and sends no email automatically',async()=>{
 render(<RecruitmentInvitationDelivery {...props} />)
 await screen.findByText('No sending result recorded.')
 expect(sendRecruitmentInvitation).not.toHaveBeenCalled()
 const accepted={...prepared,attempt:{id:'attempt',status:'provider_accepted',updated_at:'2026-10-08'}}
 vi.mocked(sendRecruitmentInvitation).mockResolvedValue({ok:true,status:'provider_accepted'})
 vi.mocked(getRecruitmentInvitationStatus).mockResolvedValue(accepted)
 fireEvent.click(screen.getByRole('button',{name:'Send invitation email'}))
 await screen.findByText(/The email provider accepted this invitation/)
 expect(sendRecruitmentInvitation).toHaveBeenCalledWith('org','lead','workspace','invite',expect.objectContaining({requestId:expect.any(String),allowDuplicate:false}))
 expect(screen.getByRole('button',{name:'Send another email'})).toBeTruthy()
})
it('recovers the original request after reload and requires review beyond its retry window',async()=>{
 vi.mocked(getRecruitmentInvitationStatus).mockResolvedValue({...prepared,attempt:{id:'original-request',status:'unknown',updated_at:'2026-10-08'}})
 vi.mocked(sendRecruitmentInvitation).mockResolvedValue({ok:false,status:'unknown',error:'Uncertain'})
 const view=render(<RecruitmentInvitationDelivery {...props} />)
 fireEvent.click(await screen.findByRole('button',{name:'Retry invitation email'}))
 await waitFor(()=>expect(sendRecruitmentInvitation).toHaveBeenCalledWith('org','lead','workspace','invite',expect.objectContaining({requestId:'original-request'})))
 await screen.findByText('Uncertain')
 view.unmount()
 vi.mocked(getRecruitmentInvitationStatus).mockResolvedValue({...prepared,attempt:{id:'old-request',status:'unknown',updated_at:'2026-10-07',retryWindowEnded:true,reviewRequired:true}})
 render(<RecruitmentInvitationDelivery {...props} />)
 const button=await screen.findByRole('button',{name:'Send another email'})
 expect(button.disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.click(button)
 await waitFor(()=>expect(sendRecruitmentInvitation).toHaveBeenLastCalledWith('org','lead','workspace','invite',expect.objectContaining({allowDuplicate:true})))
 expect(vi.mocked(sendRecruitmentInvitation).mock.lastCall[4].requestId).not.toBe('old-request')
})
it.each(['expired','revoked','accepted','submitted'])('blocks sending a %s invitation without manufacturing progress',async(referenceStatus)=>{
 vi.mocked(getRecruitmentInvitationStatus).mockResolvedValue({...prepared,referenceStatus})
 render(<RecruitmentInvitationDelivery {...props} />)
 await waitFor(()=>expect(screen.queryByText('Checking status…')).toBeNull())
 expect(screen.queryByRole('button',{name:'Send invitation email'})).toBeNull()
 expect(sendRecruitmentInvitation).not.toHaveBeenCalled()
})
it('requires the private application link and keeps application messaging distinct from access',async()=>{
 vi.mocked(sendRecruitmentInvitation).mockResolvedValue({suppressed:true,error:'No email was sent.'})
 render(<RecruitmentInvitationDelivery {...props} kind="application" />)
 const send=await screen.findByRole('button',{name:'Send invitation email'})
 expect(send.disabled).toBe(true)
 fireEvent.change(screen.getByLabelText(/Private application link/),{target:{value:'https://app.test/join-us/token'}})
 fireEvent.click(send)
 await screen.findByText('No email was sent.')
 expect(sendRecruitmentInvitation).toHaveBeenCalledWith('org','lead','application','invite',expect.objectContaining({applicationLink:'https://app.test/join-us/token'}))
 expect(screen.getByText(/It grants no agency access/)).toBeTruthy()
})
it('keeps migration and permission failures visible and blocks unverified sends',async()=>{
 vi.mocked(getRecruitmentInvitationStatus).mockRejectedValue(new Error('Setup pending'))
 render(<RecruitmentInvitationDelivery {...props} />)
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Setup pending')
 expect(screen.queryByRole('button',{name:'Send invitation email'})).toBeNull()
})
it('ignores a late send result after switching organisations',async()=>{
 let resolve
 vi.mocked(sendRecruitmentInvitation).mockImplementation(()=>new Promise(done=>{resolve=done}))
 const view=render(<RecruitmentInvitationDelivery {...props} />)
 fireEvent.click(await screen.findByRole('button',{name:'Send invitation email'}))
 await waitFor(()=>expect(resolve).toBeTruthy())
 view.rerender(<RecruitmentInvitationDelivery {...props} organisationId="other" />)
 resolve({ok:true,status:'provider_accepted'})
 await waitFor(()=>expect(getRecruitmentInvitationStatus).toHaveBeenCalledWith('other','lead','workspace','invite'))
 expect(screen.queryByText(/The email provider accepted this invitation/)).toBeNull()
})
