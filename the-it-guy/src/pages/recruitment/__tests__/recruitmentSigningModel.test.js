import { expect,it } from 'vitest'
import { emptyDeliveryDraft, emptySignatureDraft, recruitmentDeliveryErrors, recruitmentSignatureErrors } from '../recruitmentSigningModel'
import { reopenRecruitmentStage } from '../recruitmentReviewModel'
const lead={id:'lead',name:'Sam Agent',email:'sam@example.test',status:'application_approved',approved_at:'2026-10-05T10:00:00Z',contracts_json:[{version:1,path:'org/lead/version'}]}
const delivery={...emptyDeliveryDraft(lead),sentOn:'2026-10-05',notes:'Email message reference 1234',confirmed:true}
const sent={...lead,status:'contract_sent',contract_delivery_json:{...delivery,recordedAt:'2026-10-05T12:00:00Z'}}
const signature={...emptySignatureDraft(sent),organisationSigner:'Principal Person',signedOn:'2026-10-05',notes:'Every page and both signatures checked',checks:{sameVersion:true,allPages:true,agentSignature:true,organisationSignature:true},file:{type:'application/pdf',name:'signed.pdf',size:512}}
it('requires the current prepared version and confirmed prior delivery with a valid chronology',()=>{
  expect(recruitmentDeliveryErrors(lead,delivery,'2026-10-05')).toEqual([])
  expect(recruitmentDeliveryErrors(lead,{...delivery,contractVersion:0},'2026-10-05')).not.toEqual([])
  expect(recruitmentDeliveryErrors(lead,{...delivery,sentOn:'2026-02-30'},'2026-10-05')).not.toEqual([])
  expect(recruitmentDeliveryErrors(lead,{...delivery,confirmed:false},'2026-10-05')).not.toEqual([])
})
it('requires a complete signed copy, both signers and all verification checks',()=>{
  expect(recruitmentSignatureErrors(sent,signature,'2026-10-05')).toEqual([])
  for(const change of [{file:null},{contractVersion:2},{signedOn:'2026-10-04'},{signedOn:'2099-01-01'},{organisationSigner:''},{checks:{...signature.checks,allPages:false}},{method:'external_electronic',reference:''}])expect(recruitmentSignatureErrors(sent,{...signature,...change},'2026-10-05')).not.toEqual([])
  expect(recruitmentSignatureErrors(sent,{...signature,method:'external_electronic',reference:'Envelope-123'},'2026-10-05')).toEqual([])
})
it('restores the delivery or signed stage on reopening',()=>{
  expect(reopenRecruitmentStage({...sent,status:'closed_lost'})).toBe('contract_sent')
  expect(reopenRecruitmentStage({...sent,status:'closed_lost',contract_signature_json:{recordedAt:'2026-10-05'}})).toBe('contract_signed')
})
it('accepts a registered return for the delivered version while retaining every staff verification requirement', () => {
  const returned = { id: 'return', contractVersion: 1, submittedAt: '2026-10-05' }, withReturn = { ...sent, contract_returns_json: [returned] }
  const draft = { ...signature, file: null, returnedId: 'return' }
  expect(emptySignatureDraft(withReturn).returnedId).toBe('return')
  expect(recruitmentSignatureErrors(withReturn, draft, '2026-10-05')).toEqual([])
  expect(recruitmentSignatureErrors(withReturn, { ...draft, checks: { ...draft.checks, organisationSignature: false } }, '2026-10-05')).not.toEqual([])
  expect(recruitmentSignatureErrors(withReturn, { ...draft, returnedId: 'foreign' }, '2026-10-05')).not.toEqual([])
})
