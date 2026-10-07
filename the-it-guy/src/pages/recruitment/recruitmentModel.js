import { applicationSummary } from './recruitmentApplicationModel'
export const recruitmentStages = [
  ['lead_received', 'Lead Received'],
  ['application_submitted', 'Application Submitted'],
  ['under_review', 'Under Review'],
  ['application_approved', 'Application Approved'],
  ['contract_sent', 'Contract Sent'],
  ['contract_signed', 'Contract Signed'],
  ['onboarding_complete', 'Onboarding Complete'],
  ['agent_activated', 'Agent Activated'],
]
export const recruitmentOutcomes = [
  ['closed_lost', 'Closed — not proceeding'],
  ['legacy_joined', 'Joined — historical record'],
]
export const recruitmentSources = ['Manual', 'Referral', 'Phone enquiry', 'Email enquiry', 'Event', 'Social media', 'Other']
export const documentTypes = ['CV', 'Identity document', 'Qualifications', 'Registration evidence', 'Other']
export const emptyRecruitmentLead = () => ({
  name: '', email: '', phone: '', area: '', source: 'Manual', status: 'lead_received',
  intake_key: crypto.randomUUID(), intake_channel: 'manual', activity_json: [],
  details_json: { experience: '', qualifications: '', onboardingCaptured: false, notes: '', referredBy: '' },
  documents_json: [],
})
export const isClosedRecruitmentLead = (lead) => ['agent_activated', 'legacy_joined', 'closed_lost'].includes(lead.status)
export const stageLabel = (status) => [...recruitmentStages, ...recruitmentOutcomes].find(([key]) => key === status)?.[1] || 'Lead Received'
export const intakeChannelLabel = (channel) => ({ manual: 'Staff capture', public_link: 'Public application link', website: 'Website', private_link: 'Private onboarding link' })[channel] || 'Staff capture'
export const activityLabel = (type) => ({ lead_received: 'Lead received', application_draft_saved: 'Applicant questionnaire saved', application_submitted: 'Application submitted', review_started: 'Application review started', review_updated: 'Review findings updated', application_approved: 'Application approved', contract_prepared: 'Contract version prepared', contract_delivery_recorded: 'Prior contract delivery recorded', contract_signed: 'Signed contract verified', onboarding_updated: 'Onboarding findings updated', onboarding_document_uploaded: 'Onboarding document uploaded', onboarding_completed: 'Onboarding completed', agent_access_prepared: 'Agent access prepared', agent_activated: 'Agent activated', lead_updated: 'Lead details updated', lead_closed: 'Lead closed', lead_reopened: 'Lead reopened', existing_record_imported: 'Existing recruitment record retained' })[type] || 'Recruitment activity'
export function recruitmentReadiness(lead = {}) {
  const details = lead.details_json || {}
  const application = lead.application_json?.answers
  const qualification = applicationSummary(lead.application_json).find(([label]) => label === 'Qualification route')?.[1]
  const items = [
    { key: 'onboarding', label: 'Agent onboarding captured', complete: Boolean(lead.application_submitted_at) || details.onboardingCaptured === true, tab: 'details' },
    { key: 'experience', label: 'Experience & track record', complete: Boolean(application || details.experience?.trim()), tab: 'details' },
    { key: 'qualifications', label: 'Qualifications & registration', complete: Boolean((qualification && application?.qualificationRoute && !['none','unsure'].includes(application.qualificationRoute)) || details.qualifications?.trim()), tab: 'details' },
    { key: 'area', label: 'Preferred area', complete: Boolean(lead.area?.trim()), tab: 'details' },
    { key: 'documents', label: 'Supporting documents', complete: (lead.documents_json || []).some((doc) => doc.path), tab: 'documents' },
  ]
  const completed = items.filter((item) => item.complete).length
  return { items, completed, score: completed * 20, label: completed === items.length ? 'Captured for review' : 'Needs follow-up' }
}
export function validateRecruitmentLead(lead = {}) {
  const name = String(lead.name || '').trim(), email = String(lead.email || '').trim(), phone = String(lead.phone || '').trim()
  if (name.length < 2 || name.length > 120) return 'Enter the agent’s name (2–120 characters).'
  if (!email && !phone) return 'Enter an email address or phone number.'
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return 'Enter a valid email address.'
  if (phone.length > 50 || (phone && phone.replace(/\D/g, '').length < 9)) return 'Enter a valid phone number.'
  if (!String(lead.source || '').trim() || String(lead.source).trim().length > 120) return 'Choose or enter the lead source (up to 120 characters).'
  if (String(lead.area || '').length > 254) return 'Enter a preferred area up to 254 characters.'
  if (![...recruitmentStages, ...recruitmentOutcomes].some(([key]) => key === lead.status)) return 'Choose a valid recruitment stage.'
  if (!lead.id && lead.status !== 'lead_received') return 'New enquiries start at Lead Received.'
  return ''
}
