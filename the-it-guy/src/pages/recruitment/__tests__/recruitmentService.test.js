import { activateRecruitmentAgent, getRecruitmentAgentAccessLink, getRecruitmentInvitationStatus, sendRecruitmentInvitation } from '../../../services/recruitmentService'
import { saveRecruitmentOnboarding, uploadRecruitmentOnboardingDocument, downloadRecruitmentOnboardingDocument } from '../../../services/recruitmentService'
import { recruitmentOnboardingDraft } from '../recruitmentOnboardingModel'
import { recordRecruitmentContractDelivery, recordRecruitmentContractSignature, downloadRecruitmentSignedContract } from '../../../services/recruitmentService'
import { recruitmentLocalDate } from '../recruitmentSigningModel'
import { prepareRecruitmentContract, downloadRecruitmentContract } from '../../../services/recruitmentService'
import { approveRecruitmentApplication } from '../../../services/recruitmentService'
import { approvalConfirmation } from '../recruitmentApprovalModel'
import { afterEach, expect, it, vi } from 'vitest'
import { emptyRecruitmentLead } from '../recruitmentModel'
const mocks = vi.hoisted(() => ({ from: vi.fn(), storage: vi.fn(), rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, storage: { from: mocks.storage }, functions: {invoke:mocks.invoke} } }))
import { startRecruitmentReview, saveRecruitmentReview, saveRecruitmentLead, uploadRecruitmentDocument, openRecruitmentDocument } from '../../../services/recruitmentService'
afterEach(() => vi.clearAllMocks())
const lead = { ...emptyRecruitmentLead(), id: 'lead', name: 'Sam Agent', email: 'sam@example.test', version: 3 }
function query(result) {
  const chain = { in: vi.fn(), update: vi.fn(), insert: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) }
  for (const key of ['in','update','insert','eq','select']) chain[key].mockReturnValue(chain)
  mocks.from.mockReturnValue(chain)
  return chain
}
it('scopes saves to the organisation and expected version; never treats a stale save as success', async () => {
  const chain = query({ data: null, error: null })
  await expect(saveRecruitmentLead('org', lead)).rejects.toThrow('changed')
  expect(chain.eq.mock.calls).toEqual([['organisation_id','org'],['id','lead'],['version',3]])
})
it('validates name and contact details before database writes', async () => {
  await expect(saveRecruitmentLead('org', emptyRecruitmentLead())).rejects.toThrow('name')
  await expect(saveRecruitmentLead('org', { ...lead, email: '', phone: '' })).rejects.toThrow('email address or phone')
  expect(mocks.from).not.toHaveBeenCalled()
})
it('rejects unsupported files and unsaved leads before upload', async () => {
  await expect(uploadRecruitmentDocument('org', lead, { type: 'application/x-msdownload', size: 20 }, 'CV')).rejects.toThrow('PDF')
  await expect(uploadRecruitmentDocument('org', lead, { name: 'cv.pdf', type: 'application/pdf', size: 10485761 }, 'CV')).rejects.toThrow('10 MB')
  await expect(uploadRecruitmentDocument('org', emptyRecruitmentLead(), { type: 'application/pdf', size: 10 }, 'CV')).rejects.toThrow('Save')
  expect(mocks.storage).not.toHaveBeenCalled()
})
it('cleans up an uploaded file when the lead save conflicts', async () => {
  query({ data: null, error: null })
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }
  mocks.storage.mockReturnValue(storage)
  await expect(uploadRecruitmentDocument('org', lead, { type: 'application/pdf', size: 10, name: 'cv.pdf' }, 'CV')).rejects.toThrow('changed')
  expect(storage.upload.mock.calls[0][0]).toMatch(/^org\/lead\//)
  expect(storage.remove).toHaveBeenCalledWith([storage.upload.mock.calls[0][0]])
})
it('uses inferred review and onboarding MIME types when the browser leaves File.type blank', async () => {
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn() }
  mocks.storage.mockReturnValue(storage)
  query({ data: { ...lead, documents_json: [] }, error: null })
  await uploadRecruitmentDocument('org', lead, { name: 'cv.pdf', type: '', size: 100 }, 'CV')
  expect(storage.upload.mock.calls[0][2].contentType).toBe('application/pdf')

  const signed = { ...lead, status: 'contract_signed', contract_signature_json: { recordedAt: '2026-10-05' } }
  mocks.rpc.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: signed, error: null }) })
  await uploadRecruitmentOnboardingDocument('org', signed, { name: 'identity.jpg', type: '', size: 100 }, 'Identity document')
  expect(storage.upload.mock.calls[1][2].contentType).toBe('image/jpeg')
  expect(mocks.rpc).toHaveBeenCalledWith('recruitment_add_onboarding_document', expect.objectContaining({
    p_document: expect.objectContaining({ mimeType: 'image/jpeg' }),
  }))
  await expect(uploadRecruitmentOnboardingDocument('org', signed, { name: 'identity.jpg', type: 'image/png', size: 100 }, 'Identity document')).rejects.toThrow('does not match')
  expect(storage.upload).toHaveBeenCalledTimes(2)
})
it('rejects foreign document paths before download', async () => {
  await expect(openRecruitmentDocument('org', 'lead', { path: 'other/lead/file' })).rejects.toThrow('does not belong')
  expect(mocks.storage).not.toHaveBeenCalled()
})

it('reuses the intake key after an uncertain create instead of adding a duplicate enquiry', async () => {
  const draft = { ...emptyRecruitmentLead(), name: 'Referral Agent', phone: '0821234567' }
  mocks.rpc.mockResolvedValue({ data: { outcome: 'reused', lead: { ...draft, id: 'existing' } }, error: null })
  expect((await saveRecruitmentLead('org', draft)).id).toBe('existing')
  expect(mocks.rpc).toHaveBeenCalledWith('recruitment_create_joining_lead', expect.objectContaining({ p_organisation_id: 'org', p_lead: expect.objectContaining({ status: 'lead_received', intake_key: draft.intake_key, joining_json: draft.joining_json }) }))
  expect(mocks.from).not.toHaveBeenCalled()
})
it('reports pending schema upgrades and blocks later stages on new enquiries', async () => {
  query({ data: null, error: { code: '42703' } })
  await expect(saveRecruitmentLead('org', lead)).rejects.toThrow('setup is pending')
  await expect(saveRecruitmentLead('org', { ...lead, id: undefined, status: 'application_approved' })).rejects.toThrow('start at Lead Received')
})

it('starts review with organisation, application and expected version only', async () => {
  const application = {...lead,status:'application_submitted',application_submitted_at:'2026-10-05'}
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:{...application,status:'under_review'},error:null})})
  expect((await startRecruitmentReview('org',application)).status).toBe('under_review')
  expect(mocks.rpc).toHaveBeenCalledWith('recruitment_start_review',{p_organisation_id:'org',p_lead_id:'lead',p_version:3})
  await expect(startRecruitmentReview('org',lead)).rejects.toThrow('submitted application')
})
it.each(['40001', 'PT409'])('reports a stale review once without retrying (%s)', async (code) => {
  const application = {...lead,status:'application_submitted',application_submitted_at:'2026-10-05'}
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
  await expect(startRecruitmentReview('org',application)).rejects.toThrow('changed')
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('does not overwrite review findings after a concurrent save', async () => {
  const chain = query({data:null,error:null})
  const review = {version:'recruitment-review-v1',checks:Object.fromEntries(['registration','qualifications','training','handover'].map(key=>[key,{status:'pending',notes:'',evidence:[]}])),documents:[],notes:'Awaiting interview',followUpOn:''}
  await expect(saveRecruitmentReview('org',{...lead,status:'under_review',review_started_at:'2026-10-05'},review)).rejects.toThrow('review was not saved')
  expect(chain.update).toHaveBeenCalledWith({review_json:review})
  expect(chain.eq.mock.calls).toEqual([['organisation_id','org'],['id','lead'],['version',3]])
})
it('saves blank approved notes without inventing findings and rejects missing rejection reasons before writing', async () => {
  const reviewing = {...lead,status:'under_review',review_started_at:'2026-10-05',documents_json:[{path:'org/lead/cv'}]}
  const review = {version:'recruitment-review-v1',checks:Object.fromEntries(['registration','qualifications','training','handover'].map(key=>[key,{status:'verified',notes:'',evidence:[]}])),documents:[{path:'org/lead/cv',status:'reviewed',notes:''}],notes:'',followUpOn:''}
  const chain = query({data:{...reviewing,review_json:review,review_status:'ready_for_approval'},error:null})
  expect((await saveRecruitmentReview('org',reviewing,review)).review_status).toBe('ready_for_approval')
  expect(chain.update).toHaveBeenCalledWith({review_json:review})
  mocks.from.mockClear()
  review.checks.registration.status = 'needs_information'
  await expect(saveRecruitmentReview('org',reviewing,review)).rejects.toThrow('rejection reason')
  expect(mocks.from).not.toHaveBeenCalled()
})

it.each(['40001', 'PT409'])('records the confirmed approval declaration and protects unchecked or stale decisions (%s)', async (code) => {
  const review={version:'recruitment-review-v1',checks:Object.fromEntries(['registration','qualifications','training','handover'].map(key=>[key,{status:'verified',notes:'Reviewed by management',evidence:[]}])),documents:[],notes:'',followUpOn:''}
  const ready={...lead,status:'under_review',application_submitted_at:'2026-10-05',review_started_at:'2026-10-05',review_status:'ready_for_approval',review_json:review}
  const draft={confirmed:true}
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:{...ready,status:'application_approved'},error:null})})
  expect((await approveRecruitmentApplication('org',ready,draft)).status).toBe('application_approved')
  expect(mocks.rpc).toHaveBeenCalledWith('recruitment_approve_application',{p_organisation_id:'org',p_lead_id:'lead',p_version:3,p_notes:approvalConfirmation})
  mocks.rpc.mockClear()
  await expect(approveRecruitmentApplication('org',ready,{...draft,confirmed:false})).rejects.toThrow('Confirm')
  await expect(approveRecruitmentApplication('org',{...ready,review_status:'in_progress'},draft)).rejects.toThrow('Resolve')
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
  await expect(approveRecruitmentApplication('org',ready,draft)).rejects.toThrow('Approval was not saved')
  await expect(uploadRecruitmentDocument('org',{...ready,approved_at:'2026-10-05'},{type:'application/pdf',size:10},'CV')).rejects.toThrow('locked')
})

it.each(['40001', 'PT409'])('prepares a genuine PDF for the approved application using an immutable private upload and expected version (%s)', async (code) => {
  const ready={...lead,status:'application_approved',approved_at:'2026-10-05'}
  const storage={upload:vi.fn().mockResolvedValue({error:null}),remove:vi.fn().mockResolvedValue({error:null})}
  mocks.storage.mockReturnValue(storage)
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:{...ready,contracts_json:[{version:1}]},error:null})})
  const file={lastModified:code,type:'application/pdf',size:512,name:'Agent agreement.pdf',slice:()=>({arrayBuffer:async()=>new TextEncoder().encode('%PDF-').buffer})}
  expect((await prepareRecruitmentContract('org',ready,file)).contracts_json).toHaveLength(1)
  expect(mocks.storage).toHaveBeenCalledWith('recruitment-contracts')
  expect(storage.upload.mock.calls[0][2]).toEqual({contentType:'application/pdf',upsert:false})
  expect(mocks.rpc).toHaveBeenCalledWith('recruitment_prepare_contract',{p_organisation_id:'org',p_lead_id:'lead',p_version:3,p_document:{path:storage.upload.mock.calls[0][0],name:file.name,size:512}})
  await expect(prepareRecruitmentContract('org',lead,file)).rejects.toThrow('Approve')
  await expect(prepareRecruitmentContract('org',ready,{...file,slice:()=>({arrayBuffer:async()=>new TextEncoder().encode('wrong').buffer})})).rejects.toThrow('not a PDF')
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
  await expect(prepareRecruitmentContract('org',ready,{...file,lastModified:`rejected-${code}`})).rejects.toThrow('changed or access')
  expect(storage.remove).toHaveBeenCalled()
  await expect(downloadRecruitmentContract('org',ready,{path:'other/lead/private.pdf'})).rejects.toThrow('does not belong')
})

it('records confirmed prior delivery with scope and current version; never represents it as an email send', async () => {
  const ready={...lead,status:'application_approved',approved_at:recruitmentLocalDate(),contracts_json:[{version:2}]}
  const draft={contractVersion:2,recipientName:'Sam Agent',recipientContact:'sam@example.test',channel:'email',sentOn:recruitmentLocalDate(),notes:'Email reference 1234',confirmed:true,source:'automated',recordedBy:'forged'}
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:{...ready,status:'contract_sent'},error:null})})
  expect((await recordRecruitmentContractDelivery('org',ready,draft)).status).toBe('contract_sent')
  const args=mocks.rpc.mock.calls[0][1]
  expect(args).toMatchObject({p_organisation_id:'org',p_lead_id:'lead',p_version:3,p_delivery:{contractVersion:2,confirmed:true}})
  expect(args.p_delivery.source).toBeUndefined()
  expect(args.p_delivery.recordedBy).toBeUndefined()
  await expect(recordRecruitmentContractDelivery('org',ready,{...draft,confirmed:false})).rejects.toThrow('Confirm')
  for (const code of ['40001', 'PT409']) {
    mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
    const calls = mocks.rpc.mock.calls.length
    await expect(recordRecruitmentContractDelivery('org',ready,draft)).rejects.toThrow('Delivery was not recorded')
    expect(mocks.rpc).toHaveBeenCalledTimes(calls + 1)
  }
})
it.each(['40001', 'PT409'])('records only a complete signed PDF and verified findings; cleans up a conflicted upload (%s)', async (code) => {
  const sent={...lead,status:'contract_sent',contract_delivery_json:{contractVersion:2,recordedAt:'2026-10-05',sentOn:recruitmentLocalDate()}}
  const file={lastModified:code,type:'application/pdf',size:512,name:'signed.pdf',slice:()=>({arrayBuffer:async()=>new TextEncoder().encode('%PDF-').buffer})}
  const draft={contractVersion:2,agentSigner:'Sam Agent',organisationSigner:'Agency Principal',signedOn:recruitmentLocalDate(),method:'wet_ink',reference:'',notes:'Compared all pages and both signatures',checks:{sameVersion:true,allPages:true,agentSignature:true,organisationSignature:true},file,recordedBy:'forged'}
  const storage={upload:vi.fn().mockResolvedValue({error:null}),remove:vi.fn().mockResolvedValue({error:null})}
  mocks.storage.mockReturnValue(storage)
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:{...sent,status:'contract_signed'},error:null})})
  expect((await recordRecruitmentContractSignature('org',sent,draft)).status).toBe('contract_signed')
  expect(mocks.storage).toHaveBeenCalledWith('recruitment-signed-contracts')
  const args=mocks.rpc.mock.calls[0][1]
  expect(args).toMatchObject({p_organisation_id:'org',p_lead_id:'lead',p_version:3,p_signature:{contractVersion:2,name:'signed.pdf',agentSigner:'Sam Agent'}})
  expect(args.p_signature.recordedBy).toBeUndefined()
  expect(storage.upload.mock.calls[0][2].upsert).toBe(false)
  await expect(recordRecruitmentContractSignature('org',sent,{...draft,checks:{...draft.checks,allPages:false}})).rejects.toThrow('Verify')
  await expect(recordRecruitmentContractSignature('org',sent,{...draft,file:{...file,slice:()=>({arrayBuffer:async()=>new TextEncoder().encode('wrong').buffer})}})).rejects.toThrow('not a PDF')
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
  await expect(recordRecruitmentContractSignature('org',sent,{...draft,file:{...file,lastModified:`rejected-${code}`}})).rejects.toThrow('Signatures were not recorded')
  expect(storage.remove).toHaveBeenCalled()
  await expect(downloadRecruitmentSignedContract('org',{...sent,contract_signature_json:{recordedAt:'2026-10-05',path:'other/lead/signed'}})).rejects.toThrow('No signed contract')
})

it.each(['40001', 'PT409'])('saves partial onboarding with expected version and strips client audit fields (%s)',async(code)=>{
  const signed={...lead,status:'contract_signed',contract_signature_json:{recordedAt:'2026-10-05'}}
  const draft={...recruitmentOnboardingDraft(signed),notes:'Joining arrangements to confirm',updatedBy:'forged',confirmed:true}
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:signed,error:null})})
  expect(await saveRecruitmentOnboarding('org',signed,draft)).toBe(signed)
  const args=mocks.rpc.mock.calls[0][1]
  expect(args).toMatchObject({p_organisation_id:'org',p_lead_id:'lead',p_version:3,p_complete:false,p_onboarding:{confirmed:false}})
  expect(args.p_onboarding.updatedBy).toBeUndefined()
  await expect(saveRecruitmentOnboarding('org',signed,draft,true)).rejects.toThrow('Resolve all six')
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
  await expect(saveRecruitmentOnboarding('org',signed,draft)).rejects.toThrow('findings were not saved')
})
it.each(['40001', 'PT409'])('uploads final documents into a separate immutable private pack and cleans up a conflicted upload (%s)',async(code)=>{
  const signed={...lead,status:'contract_signed',contract_signature_json:{recordedAt:'2026-10-05'}}
  const storage={upload:vi.fn().mockResolvedValue({error:null}),remove:vi.fn().mockResolvedValue({error:null})}
  const file={lastModified:code,type:'application/pdf',size:512,name:'Joining evidence.pdf'}
  mocks.storage.mockReturnValue(storage)
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:signed,error:null})})
  expect(await uploadRecruitmentOnboardingDocument('org',signed,file,'Identity document')).toBe(signed)
  expect(mocks.storage).toHaveBeenCalledWith('recruitment-onboarding-documents')
  expect(storage.upload.mock.calls[0][2]).toEqual({contentType:'application/pdf',upsert:false})
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_organisation_id:'org',p_lead_id:'lead',p_version:3,p_document:{name:file.name,type:'Identity document',mimeType:'application/pdf',size:512}})
  await expect(uploadRecruitmentOnboardingDocument('org',{...signed,status:'onboarding_complete'},file,'Identity document')).rejects.toThrow('Verify the signed')
  await expect(uploadRecruitmentOnboardingDocument('org',signed,{...file,size:10485761},'Identity document')).rejects.toThrow('10 MB')
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
  await expect(uploadRecruitmentOnboardingDocument('org',signed,{...file,lastModified:`rejected-${code}`},'Identity document')).rejects.toThrow('changed or access')
  expect(storage.remove).toHaveBeenCalled()
  await expect(downloadRecruitmentOnboardingDocument('org',signed,{path:'other/lead/file'})).rejects.toThrow('does not belong')
})

it.each(['40001', 'PT409'])('prepares or records activation with current organisation/version and never sends or creates an arbitrary privileged member (%s)',async(code)=>{
  const ready={...lead,joining_json:{...lead.joining_json,branchId:'a1111111-1111-4111-8111-111111111111',businessWorkspaces:['rentals'],startDate:'2026-10-15'},status:'onboarding_complete',onboarding_completed_at:'2026-10-05',onboarding_snapshot:{version:'recruitment-onboarding-completion-v1'}}
  const draft={notes:'  Joining record reviewed and agent access confirmed  ',confirmed:true,userId:'forged',role:'principal'}
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:{...ready,activation_json:{state:'awaiting_acceptance'}},error:null})})
  expect((await activateRecruitmentAgent('org',ready,draft)).status).toBe('onboarding_complete')
  expect(mocks.rpc).toHaveBeenCalledWith('recruitment_activate_joining_agent_v2',{p_organisation_id:'org',p_lead_id:'lead',p_version:3,p_notes:'Joining record reviewed and agent access confirmed',p_confirmed:true})
  await expect(activateRecruitmentAgent('org',ready,{...draft,confirmed:false})).rejects.toThrow('Confirm')
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code}})})
  await expect(activateRecruitmentAgent('org',ready,draft)).rejects.toThrow('Activation was not saved')
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code:'23505'}})})
  await expect(activateRecruitmentAgent('org',ready,draft)).rejects.toThrow('another recruitment record')
})
it('loads only a pending unexpired agent access link with matching identity and organisation scope',async()=>{
  const waiting={...lead,status:'onboarding_complete',activation_json:{state:'awaiting_acceptance',inviteId:'invite',email:'sam@example.test'}}
  const row={id:'invite',token:'sample-token',status:'pending',target_workspace_role:'agent',email:'SAM@example.test',expires_at:new Date(Date.now()+86400000).toISOString()}
  const chain=query({data:row,error:null})
  expect(await getRecruitmentAgentAccessLink('org',waiting)).toContain('/invite/sample-token')
  expect(chain.eq.mock.calls).toEqual([['id','invite'],['target_workspace_id','org']])
  expect(chain.in).toHaveBeenCalledWith('invite_type',['workspace_invite','branch_invite'])
  for(const patch of [{email:'other@example.test'},{status:'revoked'},{target_workspace_role:'admin'}]) {
    query({data:{...row,...patch},error:null})
    await expect(getRecruitmentAgentAccessLink('org',waiting)).rejects.toThrow('no longer pending or does not match')
  }
  query({data:{...row,expires_at:'2000-01-01'},error:null})
  await expect(getRecruitmentAgentAccessLink('org',waiting)).rejects.toThrow('expired')
})

it('loads a reused branch invitation with the reviewed senior-agent role and refuses a mismatched branch',async()=>{
  const waiting={...lead,status:'onboarding_complete',activation_json:{state:'awaiting_acceptance',inviteId:'branch-invite',email:lead.email,joiningPlan:{role:'senior_agent',branchId:'reviewed-branch'}}}
  const row={token:'sample-token',status:'pending',email:lead.email,target_workspace_role:'senior_agent',target_branch_id:'reviewed-branch',invite_type:'branch_invite'}
  query({data:row,error:null})
  expect(await getRecruitmentAgentAccessLink('org',waiting)).toContain('/invite/sample-token')
  query({data:{...row,target_branch_id:'other-branch'},error:null})
  await expect(getRecruitmentAgentAccessLink('org',waiting)).rejects.toThrow('does not match')
})

it('blocks access preparation when the handover migration is absent, without using the old activation endpoint',async()=>{
  const ready={...lead,status:'onboarding_complete',onboarding_completed_at:'2026-10-05',onboarding_snapshot:{version:'recruitment-onboarding-completion-v1'},joining_json:{...lead.joining_json,branchId:'a1111111-1111-4111-8111-111111111111',businessWorkspaces:['sales'],startDate:'2026-10-15'}}
  mocks.rpc.mockReturnValue({maybeSingle:vi.fn().mockResolvedValue({data:null,error:{code:'PGRST202'}})})
  await expect(activateRecruitmentAgent('org',ready,{confirmed:true,notes:'Final joining setup checked'})).rejects.toThrow('setup is pending')
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect(mocks.rpc.mock.calls[0][0]).toBe('recruitment_activate_joining_agent_v2')
})

it.each(['workspace','documents_reminder','approval'])('loads invitation status without raw token data and sends only a scoped stable %s request',async(kind)=>{
 mocks.rpc.mockResolvedValue({data:{referenceStatus:'prepared',attempt:null}})
 expect(await getRecruitmentInvitationStatus('org','lead','application','link')).toEqual({referenceStatus:'prepared',attempt:null})
 expect(mocks.rpc).toHaveBeenCalledWith('recruitment_invitation_status',{p_organisation_id:'org',p_lead_id:'lead',p_kind:'application',p_reference_id:'link'})
 mocks.invoke.mockResolvedValue({data:{ok:true,status:'provider_accepted'}})
 const referenceId=kind==='workspace' ? 'invite' : 'lead'
 await sendRecruitmentInvitation('org','lead',kind,referenceId,{requestId:'same-request',applicationLink:'not-applicable',to:'forged@example.test'})
 expect(mocks.invoke).toHaveBeenCalledWith('send-email',{body:{type:'recruitment_invitation',organisationId:'org',leadId:'lead',kind,referenceId,requestId:'same-request',allowDuplicate:false}})
 mocks.invoke.mockClear()
 await expect(sendRecruitmentInvitation('org','lead','unsupported','lead',{requestId:'same-request'})).rejects.toThrow('saved recruitment email')
 expect(mocks.invoke).not.toHaveBeenCalled()
 mocks.invoke.mockResolvedValue({error:{context:{json:async()=>({error:'Invitation expired'})}}})
 await expect(sendRecruitmentInvitation('org','lead','application','link',{requestId:'same-request'})).rejects.toThrow('expired')
})
it('uploads and publishes a Home Seekers contract in one transaction, with no client-controlled recipient', async () => {
  const org = '2958d402-368e-43c9-b728-0098e10505f1', ready = { ...lead, organisation_id: org, status: 'application_approved', approved_at: '2026-10-10' }
  const file = { type: 'application/pdf', size: 128, name: 'Contract.pdf', slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer }) }
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn() }
  mocks.storage.mockReturnValue(storage)
  mocks.rpc.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...ready, status: 'contract_sent' } }) })
  expect((await prepareRecruitmentContract(org, ready, file)).status).toBe('contract_sent')
  expect(mocks.rpc).toHaveBeenCalledWith('recruitment_publish_contract', { p_organisation_id: org, p_lead_id: 'lead', p_version: 3, p_document: { path: expect.stringContaining(`${org}/lead/`), name: 'Contract.pdf', size: 128 } })
  expect(storage.upload.mock.calls[0][2].upsert).toBe(false)
})
it('verifies the registered returned PDF without a duplicate upload and ignores forged path metadata', async () => {
  const returned = { id: 'returned', path: 'org/lead/registered', name: 'Signed.pdf', size: 128, contractVersion: 2, submittedAt: '2026-10-10' }
  const sent = { ...lead, status: 'contract_sent', contract_delivery_json: { contractVersion: 2, recordedAt: '2026-10-10', sentOn: recruitmentLocalDate() }, contract_returns_json: [returned] }
  const draft = { contractVersion: 2, returnedId: returned.id, file: null, agentSigner: 'Sam Agent', organisationSigner: 'Agency Principal', signedOn: recruitmentLocalDate(), method: 'wet_ink', reference: '', notes: 'All pages and both signatures verified.', checks: { sameVersion: true, allPages: true, agentSignature: true, organisationSignature: true }, path: 'foreign' }
  mocks.rpc.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...sent, status: 'contract_signed' } }) })
  expect((await recordRecruitmentContractSignature('org', sent, draft)).status).toBe('contract_signed')
  expect(mocks.storage).not.toHaveBeenCalled()
  expect(mocks.rpc.mock.calls[0][1].p_signature).toMatchObject({ path: returned.path, name: returned.name, size: returned.size })
  await expect(recordRecruitmentContractSignature('org', sent, { ...draft, returnedId: 'foreign' })).rejects.toThrow('Choose the complete signed')
})
