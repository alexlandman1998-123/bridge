import { withDocumentUploadMimeType, validateDocumentUploadFile } from '../lib/documentUploadPolicy.js'
import { runRecoverableDocumentUpload } from '../lib/documentUploadRecovery.js'
import { recruitmentActivationErrors } from '../pages/recruitment/recruitmentActivationModel'
import { buildAgentInviteLink } from '../lib/agentInviteService'
import { onboardingChecks, onboardingDocumentTypes, recruitmentOnboardingErrors } from '../pages/recruitment/recruitmentOnboardingModel'
import { supabase } from '../lib/supabaseClient'
import { recruitmentDeliveryErrors, recruitmentSignatureErrors } from '../pages/recruitment/recruitmentSigningModel'
import { recruitmentApprovalErrors } from '../pages/recruitment/recruitmentApprovalModel'
import { recruitmentReviewErrors } from '../pages/recruitment/recruitmentReviewModel'
import { validateRecruitmentLead } from '../pages/recruitment/recruitmentModel'
const fields = 'id,organisation_id,name,email,phone,area,source,status,details_json,documents_json,version,created_at,updated_at,received_at,captured_by,intake_channel,intake_key,activity_json,application_json,application_submitted_at,review_json,review_started_at,review_started_by,review_updated_at,review_updated_by,review_status,approved_at,approved_by,approval_notes,approval_snapshot,contracts_json,contract_delivery_json,contract_signature_json,onboarding_json,onboarding_documents_json,onboarding_completed_at,onboarding_completed_by,onboarding_snapshot,activation_json,activated_at,activated_by,contact_capture_json,email_verification_status,email_verified_at,applicant_draft_json,applicant_draft_revision,applicant_draft_saved_at,joining_json,joining_invite_id,contacted_at,contacted_by,documents_uploaded_at,document_waivers_json,rejection_json'
function clientFor(organisationId) {
  if (!supabase) throw new Error('Recruitment is unavailable: database connection is not configured.')
  if (!organisationId || organisationId === 'all') throw new Error('Choose an organisation to manage recruitment.')
  return supabase
}
function fail(error) {
  try {
  if (['42P01','42703','PGRST204','PGRST205','PGRST202'].includes(error?.code)) throw new Error('Recruitment setup is pending. The recruitment database migration must be applied before records can be saved.')
  if (error?.code === '22007' || error?.code === '22008') throw new Error('Choose a valid date for this recruitment action.')
  if (error?.code === '23505') throw new Error('Agent access is already linked to another recruitment record. Reload and check the agent directory before trying again.')
  if (error?.code === '42501' && /joining branch/.test(error.message || '')) throw new Error(error.message)
  if (error?.code === 'P0001' && /joining|existing invitation|business areas|active branch|active commission|differs from|pending agent invitations|Commercial.*handover/i.test(error.message || '')) throw new Error(error.message)
  if (error?.code === 'P0001' && /activat|agent|invitation|membership|prepared.*email/i.test(error.message || '')) throw new Error('Agent access could not be completed. Check completed onboarding, the recorded email, invitation acceptance and the active agent membership, then reload if the record changed.')
  if (error?.code === 'P0001' && /onboarding|joining/i.test(error.message || '')) throw new Error('Onboarding could not be saved. Check the signed contract, joining requirements, document pack and date, then reload if the record changed.')
  if (error?.code === 'P0001' && /contract|PDF/i.test(error.message || '')) throw new Error('Contract could not be saved. Check the contract stage, version, dates, findings and uploaded PDF, then reload if the application changed.')
  if (error?.code === 'P0001' && /approv/i.test(error.message || '')) throw new Error('Approval could not be saved. Resolve the saved review, confirm the evidence and decision reason, then reload if the application changed.')
  if (error?.code === 'P0001' && /review|evidence|finding/i.test(error.message || '')) throw new Error('Review could not be saved. Check the lead stage, findings and supporting documents, then reload if the record changed.')
  if (error?.code === 'P0001') throw new Error('Recruitment could not be saved. Check the required journey step and reload the record.')
  throw new Error(error?.code === '42501' ? 'Only organisation principals and administrators can manage recruitment.' : 'Recruitment could not be loaded or saved. Please try again.')
  } catch (failure) { failure.cause = error; throw failure }
}
export async function listRecruitmentLeads(organisationId) {
  const { data, error } = await clientFor(organisationId).from('recruitment_leads').select(fields).eq('organisation_id', organisationId).order('created_at', { ascending: false })
  if (error) fail(error)
  return data || []
}
export async function recordRecruitmentContact(organisationId, lead) {
  const { data, error } = await clientFor(organisationId).rpc('recruitment_record_contact', { p_organisation_id: organisationId, p_lead_id: lead.id, p_version: lead.version }).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('This lead changed. Reload before recording contact.')
  return data
}
export async function rejectRecruitmentApplication(organisationId, lead, reason) {
  if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 3000) throw new Error('Record a rejection reason (5–3,000 characters).')
  const { data, error } = await clientFor(organisationId).rpc('recruitment_reject_application', { p_organisation_id: organisationId, p_lead_id: lead.id, p_version: lead.version, p_reason: reason.trim() }).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('This application changed. Reload before rejecting.')
  return data
}
export async function saveRecruitmentDocumentExceptions(organisationId, lead, waivers) {
  const { data, error } = await clientFor(organisationId).from('recruitment_leads').update({ document_waivers_json: waivers }).eq('organisation_id', organisationId).eq('id', lead.id).eq('version', lead.version).select(fields).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('This application changed. Reload before saving document exceptions.')
  return data
}
export async function listJoiningRecruitmentLeads(organisationId, branchId = '', { limitedBranch = false, commercialOnly = false } = {}) {
  const client = clientFor(organisationId), rows = [], pageSize = 200
  if(limitedBranch && !branchId) throw new Error('Choose your joining branch.')
  for(let offset=0; ;offset+=pageSize) {
    const {data,error}=await client.rpc('recruitment_joining_progress',{p_organisation_id:organisationId,p_branch_id:branchId || null,p_offset:offset,p_commercial:commercialOnly,p_limited:limitedBranch})
    if(error) fail(error)
    rows.push(...(data || []))
    if(!data || data.length<pageSize)return rows
  }
}
export async function getRecruitmentLead(organisationId, id) {
  const { data, error } = await clientFor(organisationId).from('recruitment_leads').select(fields).eq('organisation_id', organisationId).eq('id', id).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('Agent lead not found or you do not have access.')
  return data
}
export async function saveRecruitmentLead(organisationId, lead) {
  const validation = validateRecruitmentLead(lead)
  if (validation) throw new Error(validation)
  const payload = Object.fromEntries(['name','email','phone','area','source','status','details_json','documents_json'].map((key) => [key, typeof lead[key] === 'string' ? lead[key].trim() : lead[key]]))
  if (lead.joining_json !== undefined) payload.joining_json = lead.joining_json
  if (!lead.id) {
    payload.intake_key = lead.intake_key
    payload.joining_invite_id = lead.joining_invite_id || null
    const { data, error } = await clientFor(organisationId).rpc('recruitment_create_joining_lead', { p_organisation_id: organisationId, p_lead: payload })
    if (error) fail(error)
    if (['review_required', 'existing_member'].includes(data?.outcome)) throw new RecruitmentMatchError(data)
    if (!['created', 'reused'].includes(data?.outcome) || !data.lead?.id) throw new Error('The joining record could not be confirmed. Retry with the same enquiry before creating another.')
    return data.lead
  }
  const client = clientFor(organisationId)
  const query = client.from('recruitment_leads').update(payload).eq('organisation_id', organisationId).eq('id', lead.id).eq('version', lead.version)
  const { data, error } = await query.select(fields).maybeSingle()
  if (error) fail(error)
  if (!data) throw Object.assign(new Error('This lead changed or access was removed. Reload it before saving again.'), { code: '40001' })
  return data
}

export class RecruitmentMatchError extends Error {
  constructor(result) {
    super(result.outcome === 'existing_member'
      ? 'This person is already an active agency member. Open their existing profile to manage access.'
      : 'Matching recruitment records or invitations exist. Review them before creating a separate enquiry.')
    this.name = 'RecruitmentMatchError'
    this.outcome = result.outcome
    this.matches = result.matches
  }
}
export async function getRecruitmentJoiningOptions(organisationId) {
  const { data, error } = await clientFor(organisationId).rpc('recruitment_joining_options', { p_organisation_id: organisationId })
  if (error) fail(error)
  return data
}
export async function getRecruitmentJoiningConnections(organisationId, leadId) {
  const { data, error } = await clientFor(organisationId).rpc('recruitment_joining_connections', { p_organisation_id: organisationId, p_lead_id: leadId })
  if (error) fail(error)
  return data
}
export async function uploadRecruitmentDocument(organisationId, lead, file, type) {
  if (!lead.id) throw new Error('Save the agent lead before uploading documents.')
  if (lead.approved_at) throw new Error('Approved review documents are locked. Contract and onboarding documents belong to the next phases.')
  const filePolicy = validateDocumentUploadFile(file, { surface: 'recruitment_document' })
  const client = clientFor(organisationId)
  return runRecoverableDocumentUpload({ client, scope: ['recruitment_review', organisationId, lead.id, type], file, storageBuckets: ['recruitment-documents'],
    run: async attempt => {
      const storage = clientFor(organisationId).storage.from('recruitment-documents')
      const path = attempt.path(`${organisationId}/${lead.id}/${crypto.randomUUID()}`)
      await attempt.upload(async () => {
        const { error } = await storage.upload(path, withDocumentUploadMimeType(file, filePolicy.mimeType), { contentType: filePolicy.mimeType, upsert: false })
        if (error) throw Object.assign(new Error('Document upload failed. Please try again.'), { cause: error })
        return 'recruitment-documents'
      })
      const result = await attempt.persist({
        save: async () => {
          return { data: await saveRecruitmentLead(organisationId, { ...lead, documents_json: [...lead.documents_json, { path, name: file.name, type, uploadedAt: new Date().toISOString() }] }) }
        },
        read: async () => { const reopened = await getRecruitmentLead(organisationId, lead.id); return reopened.documents_json?.some(item => item.path === path) ? { data: reopened } : null },
        cleanup: () => storage.remove([path]),
      })
      return result.data
    },
  })
}
export async function openRecruitmentDocument(organisationId, leadId, document) {
  if (!document.path?.startsWith(`${organisationId}/${leadId}/`)) throw new Error('Document does not belong to this agent lead.')
  const { data, error } = await clientFor(organisationId).storage.from('recruitment-documents').download(document.path)
  if (error) throw new Error('Document could not be downloaded. Please try again.')
  const url = URL.createObjectURL(data)
  const link = window.document.createElement('a')
  link.href = url; link.download = document.name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function startRecruitmentReview(organisationId, lead) {
  if (!lead.id || !['application_submitted', 'documents_uploaded'].includes(lead.status) || !lead.application_submitted_at) throw new Error('A submitted application is required to start review.')
  const { data, error } = await clientFor(organisationId).rpc('recruitment_start_review', { p_organisation_id: organisationId, p_lead_id: lead.id, p_version: lead.version }).maybeSingle()
  if (['40001', 'PT409'].includes(error?.code)) throw new Error('This application changed or access was removed. Reload before starting review.')
  if (error) fail(error)
  if (!data) throw new Error('This application changed or access was removed. Reload before starting review.')
  return data
}
export async function saveRecruitmentReview(organisationId, lead, draft) {
  const errors = recruitmentReviewErrors(draft, lead)
  if (errors.length) throw new Error(errors.join(' '))
  const { data, error } = await clientFor(organisationId).from('recruitment_leads').update({ review_json: draft }).eq('organisation_id', organisationId).eq('id', lead.id).eq('version', lead.version).select(fields).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('This lead changed or access was removed. Your review was not saved. Reload before trying again.')
  return data
}

export async function approveRecruitmentApplication(organisationId, lead, draft) {
  const errors = recruitmentApprovalErrors(lead, draft)
  if (errors.length) throw new Error(errors.join(' '))
  const { data, error } = await clientFor(organisationId).rpc('recruitment_approve_application', { p_organisation_id: organisationId, p_lead_id: lead.id, p_version: lead.version, p_notes: draft.notes.trim() }).maybeSingle()
  if (['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This application changed or access was removed. Approval was not saved. Reload and review it before trying again.')
  if (error) fail(error)
  return data
}

export async function prepareRecruitmentContract(organisationId, lead, file) {
  if (!lead.id || lead.status !== 'application_approved' || !lead.approved_at) throw new Error('Approve the application before preparing a contract.')
  validateDocumentUploadFile(file, { surface: 'recruitment_contract' })
  if (!file.name?.trim() || file.name.length > 254) throw new Error('Choose a contract PDF up to 10 MB with a file name up to 254 characters.')
  const header = new TextDecoder().decode(await file.slice(0,5).arrayBuffer())
  if (header !== '%PDF-') throw new Error('The selected file is not a PDF. Export the contract as a PDF before uploading.')
  const client = clientFor(organisationId)
  return runRecoverableDocumentUpload({ client, scope: ['recruitment_contract', organisationId, lead.id], file, storageBuckets: ['recruitment-contracts'],
    run: async attempt => {
      const storage = clientFor(organisationId).storage.from('recruitment-contracts')
      const path = attempt.path(`${organisationId}/${lead.id}/${crypto.randomUUID()}`)
      await attempt.upload(async () => {
        const uploaded = await storage.upload(path, withDocumentUploadMimeType(file, 'application/pdf'), {contentType:'application/pdf',upsert:false})
        if (uploaded.error) throw Object.assign(new Error('Contract upload failed. Please try again.'), { cause: uploaded.error })
        return 'recruitment-contracts'
      })
      const result = await attempt.persist({
        save: async () => {
          const {data,error} = await clientFor(organisationId).rpc('recruitment_prepare_contract',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_document:{path,name:file.name,size:file.size}}).maybeSingle()
          if (['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw Object.assign(new Error('This application changed or access was removed. Reload before preparing the contract again.'), { cause: error })
          if (error) fail(error)
          return { data }
        },
        read: async () => { const reopened = await getRecruitmentLead(organisationId, lead.id); return reopened.contracts_json?.some(item => item.path === path) ? { data: reopened } : null },
        cleanup: () => storage.remove([path]),
      })
      return result.data
    },
  })
}
export async function downloadRecruitmentContract(organisationId, lead, contract) {
  if (!contract?.path?.startsWith(`${organisationId}/${lead.id}/`) || !lead.contracts_json?.some(item=>item.path===contract.path)) throw new Error('Contract does not belong to this agent lead.')
  const {data,error}=await clientFor(organisationId).storage.from('recruitment-contracts').download(contract.path)
  if (error) throw new Error('Contract could not be downloaded. Please try again.')
  const url=URL.createObjectURL(data), link=window.document.createElement('a')
  link.href=url;link.download=contract.name;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export async function recordRecruitmentContractDelivery(organisationId, lead, draft) {
  const errors=recruitmentDeliveryErrors(lead,draft)
  if(errors.length) throw new Error(errors.join(' '))
  const payload=Object.fromEntries(['contractVersion','recipientName','recipientContact','channel','sentOn','notes','confirmed'].map(key=>[key,typeof draft[key]==='string' ? draft[key].trim() : draft[key]]))
  const {data,error}=await clientFor(organisationId).rpc('recruitment_record_contract_delivery',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_delivery:payload}).maybeSingle()
  if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This contract changed or access was removed. Delivery was not recorded. Reload before trying again.')
  if(error) fail(error)
  return data
}
export async function recordRecruitmentContractSignature(organisationId, lead, draft) {
  const errors=recruitmentSignatureErrors(lead,draft)
  if(errors.length) throw new Error(errors.join(' '))
  const file=draft.file
  const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer())
  if(header!=='%PDF-') throw new Error('The selected signed copy is not a PDF. Scan or export all signed pages into one PDF.')
  const client = clientFor(organisationId)
  return runRecoverableDocumentUpload({ client, scope: ['recruitment_signed_contract', organisationId, lead.id, draft.contractVersion], file, storageBuckets: ['recruitment-signed-contracts'],
    run: async attempt => {
      const storage=clientFor(organisationId).storage.from('recruitment-signed-contracts')
      const path=attempt.path(`${organisationId}/${lead.id}/${crypto.randomUUID()}`)
      await attempt.upload(async () => {
        const uploaded=await storage.upload(path,withDocumentUploadMimeType(file,'application/pdf'),{contentType:'application/pdf',upsert:false})
        if(uploaded.error) throw Object.assign(new Error('Signed contract upload failed. Your findings have been kept; please try again.'), { cause: uploaded.error })
        return 'recruitment-signed-contracts'
      })
      const result = await attempt.persist({
        save: async () => {
          const payload=Object.fromEntries(['contractVersion','agentSigner','organisationSigner','signedOn','method','reference','notes'].map(key=>[key,typeof draft[key]==='string' ? draft[key].trim() : draft[key]]))
          payload.checks=Object.fromEntries(['sameVersion','allPages','agentSignature','organisationSignature'].map(key=>[key,draft.checks[key]===true]))
          Object.assign(payload,{path,name:file.name,size:file.size})
          const {data,error}=await clientFor(organisationId).rpc('recruitment_record_contract_signature',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_signature:payload}).maybeSingle()
          if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw Object.assign(new Error('This contract changed or access was removed. Signatures were not recorded. Reload before trying again.'), { cause: error })
          if(error) fail(error)
          return { data }
        },
        read: async () => { const reopened = await getRecruitmentLead(organisationId, lead.id); return reopened.contract_signature_json?.path === path ? { data: reopened } : null },
        cleanup: () => storage.remove([path]),
      })
      return result.data
    },
  })
}
export async function downloadRecruitmentSignedContract(organisationId,lead) {
  const signature=lead.contract_signature_json
  if(!signature?.recordedAt || !signature.path?.startsWith(`${organisationId}/${lead.id}/`)) throw new Error('No signed contract is recorded for this lead.')
  const {data,error}=await clientFor(organisationId).storage.from('recruitment-signed-contracts').download(signature.path)
  if(error) throw new Error('Signed contract could not be downloaded. Please try again.')
  const url=URL.createObjectURL(data), link=window.document.createElement('a')
  link.href=url;link.download=signature.name;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export async function saveRecruitmentOnboarding(organisationId,lead,draft,complete=false) {
  const errors=recruitmentOnboardingErrors(lead,draft,complete)
  if(errors.length) throw new Error(errors.join(' '))
  const payload={version:draft.version,checks:Object.fromEntries(onboardingChecks.map(([key])=>[key,{status:draft.checks[key].status,notes:draft.checks[key].notes.trim(),evidence:draft.checks[key].evidence}])),documents:draft.documents.map(doc=>({path:doc.path,status:doc.status,notes:doc.notes.trim()})),startDate:draft.startDate,notes:draft.notes.trim(),confirmed:complete && draft.confirmed===true}
  const {data,error}=await clientFor(organisationId).rpc('recruitment_save_onboarding',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_onboarding:payload,p_complete:complete}).maybeSingle()
  if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This onboarding record changed or access was removed. Your findings were not saved. Reload before trying again.')
  if(error) fail(error)
  return data
}
export async function uploadRecruitmentOnboardingDocument(organisationId,lead,file,type) {
  if(!lead.id || lead.status!=='contract_signed' || !lead.contract_signature_json?.recordedAt || lead.onboarding_completed_at) throw new Error('Verify the signed contract before uploading onboarding documents.')
  const filePolicy = validateDocumentUploadFile(file, { surface: 'recruitment_onboarding' })
  if(!file.name?.trim() || file.name.length>254 || !onboardingDocumentTypes.includes(type)) throw new Error('Choose an onboarding PDF, JPG or PNG up to 10 MB and a valid document type.')
  const client = clientFor(organisationId)
  return runRecoverableDocumentUpload({ client, scope: ['recruitment_onboarding', organisationId, lead.id, type], file, storageBuckets: ['recruitment-onboarding-documents'],
    run: async attempt => {
      const storage=clientFor(organisationId).storage.from('recruitment-onboarding-documents')
      const path=attempt.path(`${organisationId}/${lead.id}/${crypto.randomUUID()}`)
      await attempt.upload(async () => {
        const uploaded=await storage.upload(path,withDocumentUploadMimeType(file,filePolicy.mimeType),{contentType:filePolicy.mimeType,upsert:false})
        if(uploaded.error) throw Object.assign(new Error('Onboarding document upload failed. Please try again.'), { cause: uploaded.error })
        return 'recruitment-onboarding-documents'
      })
      const result = await attempt.persist({
        save: async () => {
          const {data,error}=await clientFor(organisationId).rpc('recruitment_add_onboarding_document',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_document:{path,name:file.name,type,mimeType:filePolicy.mimeType,size:file.size}}).maybeSingle()
          if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw Object.assign(new Error('This onboarding record changed or access was removed. Reload before uploading again.'), { cause: error })
          if(error) fail(error)
          return { data }
        },
        read: async () => { const reopened = await getRecruitmentLead(organisationId, lead.id); return reopened.onboarding_documents_json?.some(item => item.path === path) ? { data: reopened } : null },
        cleanup: () => storage.remove([path]),
      })
      return result.data
    },
  })
}
export async function downloadRecruitmentOnboardingDocument(organisationId,lead,document) {
  if(!document.path?.startsWith(`${organisationId}/${lead.id}/`) || !lead.onboarding_documents_json?.some(doc=>doc.path===document.path)) throw new Error('Onboarding document does not belong to this lead.')
  const {data,error}=await clientFor(organisationId).storage.from('recruitment-onboarding-documents').download(document.path)
  if(error) throw new Error('Onboarding document could not be downloaded. Please try again.')
  const url=URL.createObjectURL(data),link=window.document.createElement('a')
  link.href=url;link.download=document.name;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export async function activateRecruitmentAgent(organisationId,lead,draft) {
  const errors=recruitmentActivationErrors(lead,draft)
  if(errors.length) throw new Error(errors.join(' '))
  const {data,error}=await clientFor(organisationId).rpc('recruitment_activate_joining_agent_v2',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_notes:draft.notes.trim(),p_confirmed:draft.confirmed===true}).maybeSingle()
  if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This recruitment record changed or access was removed. Activation was not saved. Reload before trying again.')
  if(error) fail(error)
  return data
}
export async function getRecruitmentAgentAccessLink(organisationId,lead) {
  const access=lead.activation_json
  if(lead.status!=='onboarding_complete' || !access?.inviteId || access.state!=='awaiting_acceptance') throw new Error('Prepare agent access before getting an invitation link.')
  const {data,error}=await clientFor(organisationId).from('invites').select('id,token,status,email,expires_at,target_workspace_role,target_branch_id,invite_type').eq('id',access.inviteId).eq('target_workspace_id',organisationId).in('invite_type',['workspace_invite','branch_invite']).maybeSingle()
  if(error) fail(error)
  const plan=access.joiningPlan
  if(!data || data.status!=='pending' || data.target_workspace_role!==(plan?.role || 'agent') || (plan && data.target_branch_id!==plan.branchId) || data.email?.trim().toLowerCase()!==access.email || !data.token) throw new Error('The invitation is no longer pending or does not match this agent. Check the agent directory and confirm activation again.')
  if(data.expires_at && new Date(data.expires_at).getTime()<=Date.now()) throw new Error('The invitation expired. Confirm agent activation again to prepare a fresh access link.')
  return buildAgentInviteLink(data.token)
}

export async function captureBranchRecruitmentLead(organisationId, branchId, contact) {
  const {data,error} = await clientFor(organisationId).rpc('recruitment_capture_branch_joining', {p_organisation_id:organisationId,p_branch_id:branchId,p_contact:{name:contact.name,email:contact.email,phone:contact.phone,intake_key:contact.intake_key,entryPoint:contact.joining_json?.origin?.entryPoint}})
  if(error) fail(error)
  if(!data?.id) throw new Error('The joining enquiry could not be confirmed. Retry this same enquiry.')
  return data
}

export async function getRecruitmentInvitationStatus(organisationId, leadId, kind, referenceId) {
  const {data,error}=await clientFor(organisationId).rpc('recruitment_invitation_status',{p_organisation_id:organisationId,p_lead_id:leadId,p_kind:kind,p_reference_id:referenceId})
  if(error) fail(error)
  if(!data?.referenceStatus) throw new Error('Invitation status could not be confirmed. Refresh before sending.')
  return data
}
export async function sendRecruitmentInvitation(organisationId, leadId, kind, referenceId, {requestId, applicationLink, allowDuplicate=false}={}) {
  if(!leadId || !referenceId || !requestId || !['application','workspace'].includes(kind)) throw new Error('Choose a saved application or workspace invitation.')
  const {data,error}=await clientFor(organisationId).functions.invoke('send-email',{body:{type:'recruitment_invitation',organisationId,leadId,kind,referenceId,requestId,...(kind==='application' ? {applicationLink} : {}),allowDuplicate:allowDuplicate===true}})
  if(error) {
    let detail
    try {detail=await error.context?.json()} catch { /* The network may have failed after provider acceptance. */ }
    throw new Error(detail?.error || 'The email result could not be confirmed. Refresh invitation status before retrying.')
  }
  if(!data || (!data.status && !data.busy && !data.suppressed)) throw new Error('The email result could not be confirmed. Refresh invitation status before retrying.')
  return data
}
