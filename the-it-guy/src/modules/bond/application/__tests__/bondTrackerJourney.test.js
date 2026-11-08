// @vitest-environment node
import { expect, it } from 'vitest'
import { buildBondApplicationJourneyModel } from '../journey/bondApplicationJourney.js'
import { resolveBondConsultantAction } from '../../../../services/bondConsultantActionService.js'
import { getBondApplicationActions } from '../../../../lib/clientPortalNextActionsEngine.js'
it('does not ask buyers to complete or sign an application in tracker mode',()=>{
 for (const status of [null,'draft','in_progress','submitted']) {
  expect(getBondApplicationActions({transaction:{finance_type:'bond'},bondApplication:{status}})).toEqual([])
 }
})
it('points the next action and journey at tracking even when applications and documents are incomplete',()=>{
 const journey=buildBondApplicationJourneyModel({participantReadiness:[{status:'in_progress'}],missingDocuments:[{title:'Statements'}]})
 expect(journey.stages.some(stage=>stage.key==='documents')).toBe(false)
 expect(journey.currentStage.title).toBe('Record bank submission')
 expect(journey.nextActions[0].label).toBe('Record bank submission')
 const action=resolveBondConsultantAction({financeStageKey:'bond_application_open',missingDocuments:10})
 expect(action.key).toBe('submit-bank');expect(action.blockers).toEqual([])
})
it('moves to bank follow-up from the recorded submission without selected-bank or signature approval',()=>{
 const journey=buildBondApplicationJourneyModel({submissionRows:[{id:'bank',bank_name:'FNB',status:'submitted',submitted_at:'2026-11-01'}],missingDocuments:[{title:'Payslips'}]})
 expect(journey.nextActions[0].label).toBe('Follow up bank responses')
})

it('follows later recorded outcomes without forcing an imported deal to recreate bank submission history',()=>{
 const quote=buildBondApplicationJourneyModel({quoteRows:[{id:'offer',bankName:'FNB'}]})
 expect(quote.nextActions[0].label).toBe('Compare and accept offer')
 const completed=buildBondApplicationJourneyModel({workflowData:{workflow:{status:'completed',currentStage:'complete'}}})
 expect(completed.nextActions[0].label).toBe('View completed file')
})
it('keeps a registered deal closed despite an older ready-for-review finance label',()=>{
 expect(resolveBondConsultantAction({financeStageKey:'ready_for_review',status:'registered'}).key).toBe('review-outcome')
})
