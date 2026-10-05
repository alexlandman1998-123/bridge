import { expect,it } from 'vitest'
import { emptyActivationDraft,recruitmentActivationErrors } from '../recruitmentActivationModel'
const lead={id:'lead',status:'onboarding_complete',email:'sam@example.test',onboarding_completed_at:'2026-10-05',onboarding_snapshot:{version:'recruitment-onboarding-completion-v1'}}
it('requires completed onboarding, a valid identity email, findings and deliberate confirmation',()=>{
  const draft={notes:'Joining evidence and access confirmed',confirmed:true}
  expect(recruitmentActivationErrors(lead,draft)).toEqual([])
  expect(recruitmentActivationErrors(lead,emptyActivationDraft()).length).toBeGreaterThan(0)
  for(const patch of [{status:'contract_signed'},{email:'invalid'},{onboarding_snapshot:{}},{activated_at:'2026-10-05'}]) expect(recruitmentActivationErrors({...lead,...patch},draft).length).toBeGreaterThan(0)
  expect(recruitmentActivationErrors({...lead,activation_json:{email:'old@example.test'}},draft)).toContain('The agent email changed after access was prepared. Restore the recorded email before continuing.')
})
