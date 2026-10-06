import { recruitmentActivationErrors } from '../pages/recruitment/recruitmentActivationModel'
import { buildAgentInviteLink } from '../lib/agentInviteService'
import { onboardingChecks, onboardingDocumentTypes, recruitmentOnboardingErrors } from '../pages/recruitment/recruitmentOnboardingModel'
import { supabase } from '../lib/supabaseClient'
import { recruitmentDeliveryErrors, recruitmentSignatureErrors } from '../pages/recruitment/recruitmentSigningModel'
import { recruitmentApprovalErrors } from '../pages/recruitment/recruitmentApprovalModel'
import { recruitmentReviewErrors } from '../pages/recruitment/recruitmentReviewModel'
import { validateRecruitmentLead } from '../pages/recruitment/recruitmentModel'
const fields = 'id,organisation_id,name,email,phone,area,source,status,details_json,documents_json,version,created_at,updated_at,received_at,captured_by,intake_channel,intake_key,activity_json,application_json,application_submitted_at,review_json,review_started_at,review_started_by,review_updated_at,review_updated_by,review_status,approved_at,approved_by,approval_notes,approval_snapshot,contracts_json,contract_delivery_json,contract_signature_json,onboarding_json,onboarding_documents_json,onboarding_completed_at,onboarding_completed_by,onboarding_snapshot,activation_json,activated_at,activated_by'
function clientFor(organisationId) {
  if (!supabase) throw new Error('Recruitment is unavailable: database connection is not configured.')
  if (!organisationId || organisationId === 'all') throw new Error('Choose an organisation to manage recruitment.')
  return supabase
}
function fail(error) {
  if (['42P01','42703','PGRST204','PGRST205','PGRST202'].includes(error?.code)) throw new Error('Recruitment setup is pending. The recruitment database migration must be applied before records can be saved.')
  if (error?.code === '22007' || error?.code === '22008') throw new Error('Choose a valid date for this recruitment action.')
  if (error?.code === '23505') throw new Error('Agent access is already linked to another recruitment record. Reload and check the agent directory before trying again.')
  if (error?.code === 'P0001' && /activat|agent|invitation|membership|prepared.*email/i.test(error.message || '')) throw new Error('Agent access could not be completed. Check completed onboarding, the recorded email, invitation acceptance and the active agent membership, then reload if the record changed.')
  if (error?.code === 'P0001' && /onboarding|joining/i.test(error.message || '')) throw new Error('Onboarding could not be saved. Check the signed contract, joining requirements, document pack and date, then reload if the record changed.')
  if (error?.code === 'P0001' && /contract|PDF/i.test(error.message || '')) throw new Error('Contract could not be saved. Check the contract stage, version, dates, findings and uploaded PDF, then reload if the application changed.')
  if (error?.code === 'P0001' && /approv/i.test(error.message || '')) throw new Error('Approval could not be saved. Resolve the saved review, confirm the evidence and decision reason, then reload if the application changed.')
  if (error?.code === 'P0001' && /review|evidence|finding/i.test(error.message || '')) throw new Error('Review could not be saved. Check the lead stage, findings and supporting documents, then reload if the record changed.')
  if (error?.code === 'P0001') throw new Error('Recruitment could not be saved. Check the required journey step and reload the record.')
  throw new Error(error?.code === '42501' ? 'Only organisation principals and administrators can manage recruitment.' : 'Recruitment could not be loaded or saved. Please try again.')
}
export async function listRecruitmentLeads(organisationId) {
  const { data, error } = await clientFor(organisationId).from('recruitment_leads').select(fields).eq('organisation_id', organisationId).order('created_at', { ascending: false })
  if (error) fail(error)
  return data || []
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
  if (!lead.id) {
    payload.intake_key = lead.intake_key
    payload.intake_channel = 'manual'
  }
  const client = clientFor(organisationId)
  const query = lead.id ? client.from('recruitment_leads').update(payload).eq('organisation_id', organisationId).eq('id', lead.id).eq('version', lead.version) : client.from('recruitment_leads').insert({ ...payload, organisation_id: organisationId })
  const { data, error } = await query.select(fields).maybeSingle()
  if (error?.code === '23505' && !lead.id && lead.intake_key) {
    const retry = await client.from('recruitment_leads').select(fields).eq('organisation_id', organisationId).eq('intake_key', lead.intake_key).maybeSingle()
    if (retry.error) fail(retry.error)
    if (retry.data) return retry.data
  }
  if (error) fail(error)
  if (!data) throw new Error('This lead changed or access was removed. Reload it before saving again.')
  return data
}
export async function uploadRecruitmentDocument(organisationId, lead, file, type) {
  if (!lead.id) throw new Error('Save the agent lead before uploading documents.')
  if (lead.approved_at) throw new Error('Approved review documents are locked. Contract and onboarding documents belong to the next phases.')
  if (!['application/pdf','image/jpeg','image/png'].includes(file.type) || file.size > 10485760 || !file.size) throw new Error('Choose a PDF, JPG or PNG file up to 10 MB.')
  const storage = clientFor(organisationId).storage.from('recruitment-documents')
  const path = `${organisationId}/${lead.id}/${crypto.randomUUID()}`
  const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error('Document upload failed. Please try again.')
  try {
    return await saveRecruitmentLead(organisationId, { ...lead, documents_json: [...lead.documents_json, { path, name: file.name, type, uploadedAt: new Date().toISOString() }] })
  } catch (error) {
    await storage.remove([path]).catch(() => {})
    throw error
  }
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
  if (!lead.id || lead.status !== 'application_submitted' || !lead.application_submitted_at) throw new Error('A submitted application is required to start review.')
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
  if (file?.type !== 'application/pdf' || !file.size || file.size > 10485760 || !file.name?.trim() || file.name.length > 254) throw new Error('Choose a contract PDF up to 10 MB with a file name up to 254 characters.')
  const header = new TextDecoder().decode(await file.slice(0,5).arrayBuffer())
  if (header !== '%PDF-') throw new Error('The selected file is not a PDF. Export the contract as a PDF before uploading.')
  const storage = clientFor(organisationId).storage.from('recruitment-contracts')
  const path = `${organisationId}/${lead.id}/${crypto.randomUUID()}`
  const uploaded = await storage.upload(path, file, {contentType:'application/pdf',upsert:false})
  if (uploaded.error) throw new Error('Contract upload failed. Please try again.')
  try {
    const {data,error} = await clientFor(organisationId).rpc('recruitment_prepare_contract',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_document:{path,name:file.name,size:file.size}}).maybeSingle()
    if (['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This application changed or access was removed. Reload before preparing the contract again.')
    if (error) fail(error)
    return data
  } catch(error) {
    // Retention policies keep files registered by a successful but uncertain response.
    await storage.remove([path]).catch(()=>{})
    throw error
  }
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
  const storage=clientFor(organisationId).storage.from('recruitment-signed-contracts')
  const path=`${organisationId}/${lead.id}/${crypto.randomUUID()}`
  const uploaded=await storage.upload(path,file,{contentType:'application/pdf',upsert:false})
  if(uploaded.error) throw new Error('Signed contract upload failed. Your findings have been kept; please try again.')
  try {
    const payload=Object.fromEntries(['contractVersion','agentSigner','organisationSigner','signedOn','method','reference','notes'].map(key=>[key,typeof draft[key]==='string' ? draft[key].trim() : draft[key]]))
    payload.checks=Object.fromEntries(['sameVersion','allPages','agentSignature','organisationSignature'].map(key=>[key,draft.checks[key]===true]))
    Object.assign(payload,{path,name:file.name,size:file.size})
    const {data,error}=await clientFor(organisationId).rpc('recruitment_record_contract_signature',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_signature:payload}).maybeSingle()
    if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This contract changed or access was removed. Signatures were not recorded. Reload before trying again.')
    if(error) fail(error)
    return data
  } catch(error) {
    await storage.remove([path]).catch(()=>{})
    throw error
  }
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
  if(!file || !['application/pdf','image/jpeg','image/png'].includes(file.type) || !file.size || file.size>10485760 || !file.name?.trim() || file.name.length>254 || !onboardingDocumentTypes.includes(type)) throw new Error('Choose an onboarding PDF, JPG or PNG up to 10 MB and a valid document type.')
  const storage=clientFor(organisationId).storage.from('recruitment-onboarding-documents'),path=`${organisationId}/${lead.id}/${crypto.randomUUID()}`
  const uploaded=await storage.upload(path,file,{contentType:file.type,upsert:false})
  if(uploaded.error) throw new Error('Onboarding document upload failed. Please try again.')
  try {
    const {data,error}=await clientFor(organisationId).rpc('recruitment_add_onboarding_document',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_document:{path,name:file.name,type,mimeType:file.type,size:file.size}}).maybeSingle()
    if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This onboarding record changed or access was removed. Reload before uploading again.')
    if(error) fail(error)
    return data
  } catch(error) {
    await storage.remove([path]).catch(()=>{})
    throw error
  }
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
  const {data,error}=await clientFor(organisationId).rpc('recruitment_activate_agent',{p_organisation_id:organisationId,p_lead_id:lead.id,p_version:lead.version,p_notes:draft.notes.trim(),p_confirmed:draft.confirmed===true}).maybeSingle()
  if(['40001', 'PT409'].includes(error?.code) || (!error && !data)) throw new Error('This recruitment record changed or access was removed. Activation was not saved. Reload before trying again.')
  if(error) fail(error)
  return data
}
export async function getRecruitmentAgentAccessLink(organisationId,lead) {
  const access=lead.activation_json
  if(lead.status!=='onboarding_complete' || !access?.inviteId || access.state!=='awaiting_acceptance') throw new Error('Prepare agent access before getting an invitation link.')
  const {data,error}=await clientFor(organisationId).from('invites').select('id,token,status,email,expires_at,target_workspace_role').eq('id',access.inviteId).eq('target_workspace_id',organisationId).eq('invite_type','workspace_invite').maybeSingle()
  if(error) fail(error)
  if(!data || data.status!=='pending' || data.target_workspace_role!=='agent' || data.email?.trim().toLowerCase()!==access.email || !data.token) throw new Error('The invitation is no longer pending or does not match this agent. Check the agent directory and confirm activation again.')
  if(data.expires_at && new Date(data.expires_at).getTime()<=Date.now()) throw new Error('The invitation expired. Confirm agent activation again to prepare a fresh access link.')
  return buildAgentInviteLink(data.token)
}
