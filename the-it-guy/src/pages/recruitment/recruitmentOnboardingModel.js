import { recruitmentLocalDate } from './recruitmentSigningModel'
export const onboardingVersion = 'recruitment-onboarding-v1'
export const onboardingChecks = [
  ['identity','Identity & contact details','Confirm the joining agent’s identity and current contact details.'],
  ['registration','PPRA / FFC joining position','Record the verified registration position and any agreed joining conditions.'],
  ['qualifications','Qualifications & PDE','Confirm the education route and any outstanding qualification or examination plan.'],
  ['training','Training & CPD plan','Record the agreed supervision, practical training and CPD arrangements.'],
  ['handover','Mandates & agency handover','Confirm notice, mandate handover and the agreed joining date.'],
  ['induction','Organisation induction','Confirm the organisation’s policies, induction and joining arrangements.'],
]
export const onboardingStatuses = [['pending','Pending'],['complete','Complete'],['needs_information','Needs information'],['not_applicable','Not applicable']]
export const onboardingDocumentTypes = ['Identity document','Registration evidence','Qualifications','Training / CPD','Agency handover','Induction','Other']
export const onboardingDocumentStatuses = [['pending','Awaiting review'],['reviewed','Reviewed'],['needs_information','Needs information'],['not_applicable','Not applicable']]
export function recruitmentOnboardingDraft(lead={}) {
  const saved=lead.onboarding_json || {}
  return {version:onboardingVersion,checks:Object.fromEntries(onboardingChecks.map(([key])=>[key,{status:saved.checks?.[key]?.status || 'pending',notes:saved.checks?.[key]?.notes || '',evidence:saved.checks?.[key]?.evidence || []}])),documents:(lead.onboarding_documents_json || []).map(doc=>{const review=saved.documents?.find(item=>item.path===doc.path);return {path:doc.path,status:review?.status || 'pending',notes:review?.notes || ''}}),startDate:saved.startDate || '',notes:saved.notes || '',confirmed:false}
}
export function recruitmentOnboardingErrors(lead,draft,complete=false) {
  const errors=[], paths=(lead.onboarding_documents_json || []).map(doc=>doc.path)
  if (!lead.id || lead.status!=='contract_signed' || !lead.contract_signature_json?.recordedAt || lead.onboarding_completed_at) errors.push('Verify the signed contract before recording onboarding.')
  if (draft.version!==onboardingVersion) errors.push('Use the current onboarding checklist.')
  for (const [key] of onboardingChecks) {
    const item=draft.checks?.[key]
    if (!item || !onboardingStatuses.some(([status])=>status===item.status) || typeof item.notes!=='string' || item.notes.length>2000 || (item.status!=='pending' && item.notes.trim().length<5)) errors.push('Record a valid status and finding or reason (5–2,000 characters) for every resolved onboarding check.')
    if (!Array.isArray(item?.evidence) || item.evidence.some(path=>!paths.includes(path))) errors.push('Use documents from this lead’s onboarding pack as evidence.')
    if (complete && !['complete','not_applicable'].includes(item?.status)) errors.push('Resolve all six onboarding checks before completing onboarding.')
  }
  if (!Array.isArray(draft.documents) || draft.documents.length!==paths.length || new Set(draft.documents.map(doc=>doc.path)).size!==paths.length) errors.push('Reload to review the current onboarding document pack.')
  for (const doc of draft.documents || []) {
    if (!paths.includes(doc.path) || !onboardingDocumentStatuses.some(([status])=>status===doc.status) || typeof doc.notes!=='string' || doc.notes.length>2000 || (doc.status!=='pending' && doc.notes.trim().length<5)) errors.push('Record a valid review status and finding for each onboarding document.')
    if (complete && !['reviewed','not_applicable'].includes(doc.status)) errors.push('Review every document in the onboarding pack before completion.')
  }
  if (typeof draft.notes!=='string' || draft.notes.length>3000 || (complete && draft.notes.trim().length<5)) errors.push('Record completion findings (5–3,000 characters).')
  if (typeof draft.startDate!=='string' || (draft.startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) || !Number.isFinite(new Date(`${draft.startDate}T12:00:00Z`).getTime()) || new Date(`${draft.startDate}T12:00:00Z`).toISOString().slice(0,10)!==draft.startDate)) || (complete && !draft.startDate)) errors.push('Choose a valid agreed joining date.')
  if (complete && !paths.length) errors.push('Upload the final onboarding document pack in Documents.')
  if (complete && draft.confirmed!==true) errors.push('Confirm the joining requirements and document pack are complete.')
  return [...new Set(errors)]
}
export const onboardingProgress = lead => onboardingChecks.filter(([key])=>['complete','not_applicable'].includes(lead.onboarding_json?.checks?.[key]?.status)).length
export const onboardingDocumentLabel = (lead,path) => onboardingDocumentStatuses.find(([key])=>key===(lead.onboarding_json?.documents?.find(doc=>doc.path===path)?.status || 'pending'))?.[1] || 'Awaiting review'
export const onboardingRecordedDate = value => value ? new Date(value).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}) : recruitmentLocalDate()
