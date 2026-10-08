import { afterEach, expect, it, vi } from 'vitest'
const api=vi.hoisted(()=>({status:vi.fn(),send:vi.fn(),legacySend:vi.fn()}))
vi.mock('../../../services/recruitmentService',()=>({getRecruitmentInvitationStatus:api.status,sendRecruitmentInvitation:api.send}))
vi.mock('../../../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:{},invokeEdgeFunction:api.legacySend}))
vi.mock('../../../lib/settingsApi',()=>({assignOrganisationUserCommissionProfile:vi.fn(),fetchOrganisationSettings:vi.fn()}))
vi.mock('../../../lib/whatsapp',()=>({formatSouthAfricanWhatsAppNumber:vi.fn(),sendWhatsAppNotification:vi.fn()}))
import { resendWorkspaceUserInvite } from '../../../services/workspaceUserInviteService'
afterEach(()=>vi.resetAllMocks())
const raw={id:'invite',token:'token',status:'pending',invite_type:'workspace_invite',target_workspace_id:'org',target_workspace_role:'agent',email:'agent@agency.co.za',metadata:{source:'recruitment_activation',recruitment_lead_id:'lead'}}
it('routes branch/directory resends of recruitment access through its canonical delivery record',async()=>{
 api.status.mockResolvedValue({referenceStatus:'prepared',attempt:{id:'original',status:'unknown'}})
 api.send.mockResolvedValue({ok:true,status:'provider_accepted'})
 const result=await resendWorkspaceUserInvite({raw})
 expect(api.status).toHaveBeenCalledWith('org','lead','workspace','invite')
 expect(api.send).toHaveBeenCalledWith('org','lead','workspace','invite',{requestId:'original'})
 expect(api.legacySend).not.toHaveBeenCalled()
 expect(result.emailResult.status).toBe('provider_accepted')
})
it('preserves unknown/expired/review-required outcomes instead of claiming resend success',async()=>{
 api.status.mockResolvedValue({referenceStatus:'expired'})
 await expect(resendWorkspaceUserInvite({raw})).rejects.toThrow('Recruitment')
 expect(api.send).not.toHaveBeenCalled()
 api.status.mockResolvedValue({referenceStatus:'prepared',attempt:{reviewRequired:true}})
 await expect(resendWorkspaceUserInvite({raw})).rejects.toThrow('Recruitment')
 api.status.mockResolvedValue({referenceStatus:'prepared',attempt:{id:'original',status:'unknown'}})
 api.send.mockResolvedValue({ok:false,status:'unknown',error:'Sending result uncertain'})
 await expect(resendWorkspaceUserInvite({raw})).rejects.toThrow('uncertain')
})
