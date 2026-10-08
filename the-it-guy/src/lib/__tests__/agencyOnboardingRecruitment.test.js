import { expect,it } from 'vitest'
import { createAgencyInviteDraft, mergeAgencyOnboardingDraft, isNewAgencyRecruit } from '../agencyOnboarding'
it('keeps setup identities and explicit existing-staff intent across saved draft recovery',()=>{
 const invitations=[createAgencyInviteDraft({id:'new-agent',name:'New Agent',email:'new@example.test',role:'agent'}),createAgencyInviteDraft({id:'returning-agent',name:'Returning Agent',email:'returning@example.test',role:'agent',purpose:'existing_staff'}),createAgencyInviteDraft({id:'assistant',name:'Support Staff',email:'assistant@example.test',role:'assistant'}),createAgencyInviteDraft({id:'manager',name:'Branch Manager',email:'manager@example.test',role:'branch_manager'})]
 const recovered=mergeAgencyOnboardingDraft(null,{invitations})
 expect(recovered.invitations.filter(isNewAgencyRecruit).map((r)=>r.id)).toEqual(['new-agent'])
 expect(recovered.invitations.filter((r)=>!isNewAgencyRecruit(r)).map((r)=>r.id)).toEqual(['returning-agent','assistant','manager'])
 expect(recovered.invitations.find((r)=>r.id==='returning-agent').purpose).toBe('existing_staff')
 expect(mergeAgencyOnboardingDraft(recovered,{invitations:recovered.invitations}).invitations).toEqual(recovered.invitations)
})
