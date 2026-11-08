import { expect, it } from 'vitest'
import { buildDeveloperLeadJourneyStages, getDeveloperLeadNextAction, getDeveloperLeadPrimaryAction, getNextManualLeadStatus } from '../developerLeadWorkspaceModel.js'
import { buildDeveloperLeadTransactionHandoff } from '../developerLeadTransactionHandoff.js'
const base = { developerLeadId: 'lead', developerOrgId: 'org', leadOwner: 'developer', sourceLeadId: 'buyer', primaryDevelopmentId: 'development', buyerFullName: 'Buyer', buyerEmail: 'buyer@example.test' }
const cases = [
 ['new', {}, 'update_status', 'contacted'], ['contacted', {}, 'update_status', 'qualified'],
 ['qualified', {}, 'update_status', 'viewing'], ['viewing', {}, 'select_unit', 'reservation'],
 ['viewing', {preferredUnitId:'unit'}, 'reserve_unit', 'reservation'],
 ['reserved', {preferredUnitId:'unit',reservationState:'reserved'}, 'open_buyer_workspace', 'onboarding_sent'],
 ['onboarding_sent', {convertedTransactionId:'context'}, 'open_transaction', 'onboarding_submitted'],
 ['onboarding_submitted', {convertedTransactionId:'context'}, 'open_transaction', 'otp'],
 ['otp', {convertedTransactionId:'transaction'}, 'open_transaction', 'converted'],
 ['converted', {convertedTransactionId:'transaction'}, 'open_transaction', 'converted'],
]
it.each(cases)('keeps the actionable command and current journey milestone aligned at %s', (leadStatus, patch, actionKey, stageKey) => {
 const lead={...base,leadStatus,...patch};const action=getDeveloperLeadPrimaryAction(lead)
 expect(action.key).toBe(actionKey);expect(action.stageKey).toBe(stageKey)
 expect(getDeveloperLeadNextAction(lead).label).toBe(action.label)
 const stages=buildDeveloperLeadJourneyStages(lead);expect(stages.filter(s=>s.state==='current')).toHaveLength(1);expect(stages.find(s=>s.state==='current').key).toBe(stageKey)
})
it('uses an approved contact catch-up in both the next action and journey, without turning payment or OTP into evidence',()=>{
 const lead={...base,leadStatus:'new'};const overrides=[{stageKey:'contacted',actionType:'mark_complete'},{stageKey:'reservation',actionType:'mark_paid'}]
 const action=getDeveloperLeadPrimaryAction(lead,{overrides});expect(action.status).toBe('qualified')
 const stages=buildDeveloperLeadJourneyStages(lead,overrides);expect(stages.find(s=>s.state==='current').key).toBe('qualified');expect(stages.find(s=>s.key==='reservation').done).toBe(false)
 for(const leadStatus of ['onboarding_sent','onboarding_submitted'])expect(getNextManualLeadStatus({...base,leadStatus})).toBeNull()
})
it('routes Revo-shaped linked records to their existing buyer workflow instead of making another deal',()=>{
 const lead={...base,leadStatus:'qualified',buyerWorkspaceTransactionId:'existing-context'}
 expect(getDeveloperLeadPrimaryAction(lead)).toMatchObject({key:'open_buyer_workspace',sourceLeadId:'buyer'})
})
it('protects an agency introduction before displaying advanced transaction actions',()=>{
 expect(getDeveloperLeadPrimaryAction({...base,leadOwner:'agency',convertedTransactionId:'foreign-context',leadStatus:'onboarding_submitted',accessProfile:{agencyFed:true,requiresHandoverBeforePrivateDetails:true}}).key).toBe('request_handover')
})
it('does not equate a unit hold with paid funds and blocks expired reservation onboarding',()=>{
 const lead={...base,preferredUnitId:'unit',leadStatus:'reserved',reservationState:'reserved'}
 const held=buildDeveloperLeadTransactionHandoff(lead);expect(held.handoff.finance.reservationStatus).toBe('pending');expect(held.handoff.status.stage).toBe('Reserved')
 expect(buildDeveloperLeadTransactionHandoff({...lead,reservationStatus:'verified'}).handoff.status.stage).toBe('Deposit Paid')
 const expired={...lead,reservationExpiresAt:'2000-01-01T00:00:00Z'};expect(buildDeveloperLeadTransactionHandoff(expired).eligible).toBe(false);expect(getDeveloperLeadPrimaryAction(expired).key).toBe('reserve_unit')
})

it('targets the working onboarding and document tabs rather than a generic workspace',()=>{
 expect(getDeveloperLeadPrimaryAction({...base,leadStatus:'onboarding_sent',convertedTransactionId:'tx'}).targetTab).toBe('onboarding');
 expect(getDeveloperLeadPrimaryAction({...base,leadStatus:'onboarding_submitted',convertedTransactionId:'tx'}).targetTab).toBe('documents');
})
