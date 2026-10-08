import { expect,it } from 'vitest'
import { emptyJoiningPlan } from '../recruitmentJoiningModel'
import { emptyActivationDraft,recruitmentActivationErrors } from '../recruitmentActivationModel'
const plan={...emptyJoiningPlan(),branchId:'a1111111-1111-4111-8111-111111111111',businessWorkspaces:['rentals'],startDate:'2026-10-15'}
const lead={joining_json:plan,id:'lead',status:'onboarding_complete',email:'sam@example.test',onboarding_completed_at:'2026-10-05',onboarding_snapshot:{version:'recruitment-onboarding-completion-v1'}}
it('requires completed onboarding, a valid identity email, findings and deliberate confirmation',()=>{
  const draft={notes:'Joining evidence and access confirmed',confirmed:true}
  expect(recruitmentActivationErrors(lead,draft)).toEqual([])
  expect(recruitmentActivationErrors(lead,emptyActivationDraft()).length).toBeGreaterThan(0)
  for(const patch of [{status:'contract_signed'},{email:'invalid'},{onboarding_snapshot:{}},{activated_at:'2026-10-05'}]) expect(recruitmentActivationErrors({...lead,...patch},draft).length).toBeGreaterThan(0)
  expect(recruitmentActivationErrors({...lead,activation_json:{email:'old@example.test'}},draft)).toContain('The agent email changed after access was prepared. Restore the recorded email before continuing.')
})

it('requires reviewed supported joining choices and retains the contract of already prepared legacy access',()=>{
  const draft={notes:'Identity and joining choices reviewed',confirmed:true}
  for(const patch of [{branchId:''},{startDate:''},{businessWorkspaces:[]},{role:'commercial_broker'},{businessWorkspaces:['commercial']}]) expect(recruitmentActivationErrors({...lead,joining_json:{...plan,...patch}},draft).length).toBeGreaterThan(0)
  expect(recruitmentActivationErrors({...lead,joining_json:{},activation_json:{inviteId:'legacy',email:lead.email}},draft)).toEqual([])
  expect(recruitmentActivationErrors({...lead,joining_json:{},activation_json:{inviteId:'prepared',email:lead.email,joiningPlan:plan}},draft)).toEqual([])
})
it('allows a completed Commercial joining plan and still requires verified onboarding',()=>{
 const broker={...lead,joining_json:{...plan,role:'commercial_broker',businessWorkspaces:['commercial']}}
 expect(recruitmentActivationErrors(broker,{notes:'Commercial plan and identity verified',confirmed:true})).toEqual([])
 expect(recruitmentActivationErrors({...broker,onboarding_completed_at:null},{notes:'Commercial plan and identity verified',confirmed:true}).length).toBeGreaterThan(0)
})
