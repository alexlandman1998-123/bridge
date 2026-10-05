import { applicationRequirements } from './recruitmentApplicationModel'
export const reviewVersion = 'recruitment-review-v1'
export const reviewCheckKeys = ['registration','qualifications','training','handover']
export const reviewStatuses = [['pending','Pending'],['verified','Verified by reviewer'],['needs_information','Needs information'],['not_applicable','Not applicable']]
export const documentReviewStatuses = [['pending','Awaiting review'],['reviewed','Reviewed'],['needs_information','Needs information'],['not_applicable','Not applicable']]
const entry = (value = {}) => ({ status: value.status || 'pending', notes: value.notes || '', evidence: Array.isArray(value.evidence) ? value.evidence : [] })
export function recruitmentReviewDraft(lead = {}) {
  const saved = lead.review_json || {}
  return { version: reviewVersion, checks: Object.fromEntries(reviewCheckKeys.map((key) => [key,entry(saved.checks?.[key])])), documents: (lead.documents_json || []).map((doc) => { const review = saved.documents?.find((item) => item.path === doc.path); return { path: doc.path, status: review?.status || 'pending', notes: review?.notes || '' } }), notes: saved.notes || '', followUpOn: saved.followUpOn || '' }
}
export const recruitmentReviewChecks = (lead) => applicationRequirements(lead.application_json).map((item,index) => ({ ...item,key:reviewCheckKeys[index] }))
export function recruitmentReviewErrors(draft, lead) {
  if (!lead.id || lead.status !== 'under_review' || !lead.review_started_at) return ['Start the application review before saving findings.']
  const errors = [], paths = (lead.documents_json || []).map((doc) => doc.path)
  if (draft.version !== reviewVersion) errors.push('Use the current recruitment review form.')
  for (const key of reviewCheckKeys) {
    const check = draft.checks?.[key]
    if (!check || !reviewStatuses.some(([status]) => status === check.status)) { errors.push('Choose a valid status for every review check.'); continue }
    if (typeof check.notes !== 'string' || check.notes.length > 2000 || (check.status !== 'pending' && check.notes.trim().length < 5)) errors.push('Add a finding or reason (5–2,000 characters) for each completed check or information request.')
    if (!Array.isArray(check.evidence) || check.evidence.some((path) => !paths.includes(path))) errors.push('Supporting evidence must belong to this lead.')
  }
  if (!Array.isArray(draft.documents) || draft.documents.length !== paths.length || new Set(draft.documents.map((doc) => doc.path)).size !== paths.length) errors.push('Refresh the lead to review its current documents.')
  for (const doc of draft.documents || []) {
    if (!paths.includes(doc.path) || !documentReviewStatuses.some(([status]) => status === doc.status)) errors.push('Choose a valid review status for each uploaded document.')
    if (typeof doc.notes !== 'string' || doc.notes.length > 2000 || (doc.status !== 'pending' && doc.notes.trim().length < 5)) errors.push('Add a review finding or reason (5–2,000 characters) for each reviewed document.')
  }
  if (typeof draft.notes !== 'string' || draft.notes.length > 3000) errors.push('Keep overall review notes to 3,000 characters.')
  if (draft.followUpOn && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.followUpOn) || !Number.isFinite(new Date(`${draft.followUpOn}T12:00:00Z`).getTime()) || new Date(`${draft.followUpOn}T12:00:00Z`).toISOString().slice(0,10) !== draft.followUpOn)) errors.push('Choose a valid follow-up date.')
  return [...new Set(errors)]
}
export function recruitmentReviewSummary(lead) {
  if (!lead.review_started_at) return { status:'not_started',label:'Review not started',complete:0,total:4 }
  const draft = recruitmentReviewDraft(lead), checks = Object.values(draft.checks), docs = draft.documents
  const complete = checks.filter((item) => ['verified','not_applicable'].includes(item.status)).length
  const missing = [...checks,...docs].some((item) => item.status === 'needs_information')
  const settled = complete === 4 && docs.every((doc) => ['reviewed','not_applicable'].includes(doc.status))
  return { status:missing ? 'needs_information' : settled ? 'ready_for_approval' : 'in_progress',label:missing ? 'Needs information' : settled ? 'Ready for approval' : 'Review in progress',complete,total:4 }
}
export const reopenRecruitmentStage = (lead) => lead.onboarding_completed_at ? 'onboarding_complete' : lead.contract_signature_json?.recordedAt ? 'contract_signed' : lead.contract_delivery_json?.recordedAt ? 'contract_sent' : lead.approved_at ? 'application_approved' : lead.review_started_at ? 'under_review' : lead.application_submitted_at ? 'application_submitted' : 'lead_received'

export function documentReviewLabel(lead, path) {
  const status = lead.review_json?.documents?.find((item) => item.path === path)?.status || 'pending'
  return documentReviewStatuses.find(([key]) => key === status)?.[1] || 'Awaiting review'
}
