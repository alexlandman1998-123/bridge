import { expect,it } from 'vitest'
import { onboardingChecks,recruitmentOnboardingDraft,recruitmentOnboardingErrors } from '../recruitmentOnboardingModel'
import { reopenRecruitmentStage } from '../recruitmentReviewModel'
const lead={id:'lead',status:'contract_signed',contract_signature_json:{recordedAt:'2026-10-05'},onboarding_documents_json:[{path:'org/lead/identity'}]}
const ready=()=>({...recruitmentOnboardingDraft(lead),checks:Object.fromEntries(onboardingChecks.map(([key])=>[key,{status:'complete',notes:'Joining requirements resolved',evidence:['org/lead/identity']}])),documents:[{path:'org/lead/identity',status:'reviewed',notes:'Evidence opened and checked'}],startDate:'2026-10-12',notes:'All final joining requirements complete',confirmed:true})
it('allows partial progress but requires the complete pack, findings, confirmation and joining date for completion',()=>{
  expect(recruitmentOnboardingErrors(lead,recruitmentOnboardingDraft(lead))).toEqual([])
  expect(recruitmentOnboardingErrors(lead,recruitmentOnboardingDraft(lead),true).length).toBeGreaterThan(0)
  expect(recruitmentOnboardingErrors(lead,ready(),true)).toEqual([])
  for(const patch of [{confirmed:false},{startDate:''},{startDate:'2026-02-31'},{notes:''},{documents:[]}]) expect(recruitmentOnboardingErrors(lead,{...ready(),...patch},true).length).toBeGreaterThan(0)
  expect(recruitmentOnboardingErrors({...lead,onboarding_documents_json:[]},{...ready(),documents:[]},true)).toContain('Upload the final onboarding document pack in Documents.')
})
it('keeps final onboarding separate from previous review and rejects unresolved or foreign evidence',()=>{
  const draft=ready()
  draft.checks.training={status:'needs_information',notes:'Training plan remains outstanding',evidence:[]}
  expect(recruitmentOnboardingErrors(lead,draft,true)).toContain('Resolve all six onboarding checks before completing onboarding.')
  draft.checks.training={status:'not_applicable',notes:'Confirmed exemption reviewed',evidence:[]}
  expect(recruitmentOnboardingErrors(lead,draft,true)).toEqual([])
  draft.checks.identity.evidence=['other/lead/identity']
  expect(recruitmentOnboardingErrors(lead,draft,true)).toContain('Use documents from this lead’s onboarding pack as evidence.')
  expect(recruitmentOnboardingErrors({...lead,status:'application_approved'},ready())).toContain('Verify the signed contract before recording onboarding.')
})
it('loads saved progress and defaults new uploaded files to awaiting review; restores completed stage',()=>{
  const saved={...lead,onboarding_json:ready(),onboarding_documents_json:[...lead.onboarding_documents_json,{path:'org/lead/training'}]}
  expect(recruitmentOnboardingDraft(saved).documents[1]).toEqual({path:'org/lead/training',status:'pending',notes:''})
  expect(recruitmentOnboardingDraft(saved).confirmed).toBe(false)
  expect(reopenRecruitmentStage({...saved,onboarding_completed_at:'2026-10-05'})).toBe('onboarding_complete')
})
