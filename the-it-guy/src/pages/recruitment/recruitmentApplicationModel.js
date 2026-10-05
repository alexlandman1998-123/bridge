export const applicationVersion = 'recruitment-application-v1'
export const practitionerStatuses = [['new_entrant', 'New to real estate'], ['candidate', 'Candidate practitioner'], ['non_principal', 'Non-principal practitioner'], ['principal', 'Principal practitioner']]
export const ffcStatuses = [['current', 'I hold an FFC'], ['pending', 'Application / renewal pending'], ['expired', 'Expired FFC'], ['not_held', 'No FFC held']]
export const qualificationRoutes = [['occupational', 'Occupational Certificate: Real Estate Agent'], ['legacy', 'Legacy NQF 4 / NQF 5 real estate qualification'], ['exemption', 'PPRA equivalency / exemption'], ['none', 'No real estate qualification yet'], ['unsure', 'Unsure of my route']]
export const learningStatuses = [['completed', 'Completed'], ['in_progress', 'In progress'], ['not_started', 'Not started'], ['exempt', 'Exemption granted'], ['not_applicable', 'Not applicable'], ['unsure', 'Unsure']]
export const cpdStatuses = [['current', 'Up to date'], ['in_progress', 'In progress'], ['not_started', 'Not started'], ['not_applicable', 'Not applicable'], ['unsure', 'Unsure']]
export const applicationSections = ['Basic details', 'Insights', 'PPRA & FFC', 'Review']
export const emptyRecruitmentApplication = () => ({ name: '', email: '', phone: '', area: '', currentAgency: '', yearsExperience: '', dealsPerMonth: '', currentSplit: '', activeMandates: '', mandateCount: '', handoverNotes: '', motivation: '', preferredStartDate: '', practitionerStatus: '', ppraNumber: '', ffcStatus: '', ffcNumber: '', ffcExpiry: '', qualificationRoute: '', qualificationStatus: '', pdeStatus: '', practicalStatus: '', cpdStatus: '', qualificationNotes: '', privacyAccepted: false, declarationAccepted: false })
const limits = { name: 120, email: 254, phone: 50, area: 254, currentAgency: 160, handoverNotes: 1000, motivation: 1500, ppraNumber: 80, ffcNumber: 80, qualificationNotes: 1000 }
export function normalizeRecruitmentApplication(raw = {}) {
  const result = emptyRecruitmentApplication()
  for (const key of Object.keys(result)) result[key] = typeof result[key] === 'boolean' ? raw[key] === true : typeof raw[key] === 'string' || typeof raw[key] === 'number' ? String(raw[key]).trim() : ''
  result.email = result.email.toLowerCase()
  if (result.activeMandates !== 'yes') { result.mandateCount = ''; result.handoverNotes = '' }
  if (result.practitionerStatus === 'new_entrant') { result.ppraNumber = ''; result.ffcStatus = 'not_held' }
  if (!['current','expired'].includes(result.ffcStatus)) { result.ffcNumber = ''; result.ffcExpiry = '' }
  return result
}
const member = (options, value) => options.some(([key]) => key === value)
const number = (value, max, integer = false) => value !== '' && /^\d+(\.\d{1,2})?$/.test(value) && Number(value) <= max && (!integer || Number.isInteger(Number(value)))
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
export function applicationErrors(raw, section) {
  const a = normalizeRecruitmentApplication(raw), errors = {}
  const add = (key, condition, message) => { if (!condition) errors[key] = message }
  if (section === undefined || section === 0) {
    add('name', a.name.length >= 2 && a.name.length <= 120, 'Enter your full name (2–120 characters).')
    add('email', a.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email), 'Enter a valid email address.')
    add('phone', a.phone.length <= 50 && a.phone.replace(/\D/g, '').length >= 9, 'Enter a valid mobile number.')
    add('area', a.area.length >= 2 && a.area.length <= 254, 'Tell us which areas you work in or would like to cover.')
    add('preferredStartDate', !a.preferredStartDate || date(a.preferredStartDate), 'Choose a valid date.')
  }
  if (section === undefined || section === 1) {
    add('yearsExperience', number(a.yearsExperience, 80), 'Enter years of experience, including 0 if you are new.')
    add('dealsPerMonth', number(a.dealsPerMonth, 1000), 'Enter your average deals per month, including 0.')
    add('currentSplit', !a.currentSplit || number(a.currentSplit, 100), 'Enter the percentage you currently keep (0–100).')
    add('activeMandates', ['yes','no'].includes(a.activeMandates), 'Tell us whether you have active mandates.')
    if (a.activeMandates === 'yes') { add('mandateCount', number(a.mandateCount, 10000, true) && Number(a.mandateCount) > 0, 'Enter the number of active mandates.'); add('handoverNotes', Boolean(a.handoverNotes), 'Describe any notice or handover obligations without client details.') }
    add('motivation', a.motivation.length >= 5, 'Tell us what you are looking for in your next agency.')
  }
  if (section === undefined || section === 2) {
    add('practitionerStatus', member(practitionerStatuses, a.practitionerStatus), 'Choose your practitioner status.')
    add('ffcStatus', member(ffcStatuses, a.ffcStatus), 'Choose your FFC status.')
    if (['current','expired'].includes(a.ffcStatus)) { add('ffcNumber', Boolean(a.ffcNumber), 'Enter the FFC number.'); add('ffcExpiry', date(a.ffcExpiry), 'Choose the FFC expiry date.') }
    add('qualificationRoute', member(qualificationRoutes, a.qualificationRoute), 'Choose your qualification route.')
    for (const key of ['qualificationStatus','pdeStatus','practicalStatus']) add(key, member(learningStatuses, a[key]), 'Choose a status, including unsure if necessary.')
    add('cpdStatus', member(cpdStatuses, a.cpdStatus), 'Choose your CPD status.')
  }
  if (section === undefined || section === 3) {
    add('privacyAccepted', a.privacyAccepted, 'Confirm that the organisation may process your application.')
    add('declarationAccepted', a.declarationAccepted, 'Confirm that your answers are accurate to the best of your knowledge.')
  }
  for (const [key, limit] of Object.entries(limits)) if (a[key].length > limit) errors[key] = `Keep this answer to ${limit} characters.`
  return errors
}
export function applicationRequirements(application, today = new Date().toISOString().slice(0, 10)) {
  if (!application?.version) return []
  const a = application.answers
  return [
    { label: 'PPRA / FFC evidence', note: a.practitionerStatus === 'new_entrant' ? 'Confirm the registration and training route for a new entrant.' : a.ffcStatus === 'current' && a.ffcExpiry >= today ? 'Verify the declared FFC with PPRA and obtain a copy.' : 'Clarify the declared FFC status and any renewal / registration action.' },
    { label: 'Qualifications & PDE', note: 'Obtain qualification, results and any exemption evidence; confirm the appropriate education route.' },
    { label: 'Practical training & CPD', note: 'Review the declared training and CPD position for this practitioner’s status.' },
    { label: 'Mandates & agency handover', note: a.activeMandates === 'yes' ? 'Review notice and mandate handover obligations before onboarding.' : 'Confirm the current agency position and joining date.' },
  ]
}
export function applicationSummary(application, includeContact = false) {
  if (!application?.version) return []
  const a = application.answers
  const label = (options, value) => options.find(([key]) => key === value)?.[1] || 'Not supplied'
  return [ ...(includeContact ? [['Full name',a.name],['Email',a.email],['Mobile',a.phone],['Areas',a.area]] : []), ['Experience', `${a.yearsExperience} years`], ['Average deals / month', a.dealsPerMonth], ['Current agency', a.currentAgency || 'Not supplied'], ['Current commission kept', a.currentSplit ? `${a.currentSplit}%` : 'Not supplied'], ['Active mandates', a.activeMandates === 'yes' ? `${a.mandateCount} active` : 'None declared'], ['Mandate handover', a.handoverNotes || 'Not supplied'], ['Preferred start date', a.preferredStartDate || 'Not supplied'], ['Practitioner status', label(practitionerStatuses, a.practitionerStatus)], ['PPRA reference', a.ppraNumber || 'Not supplied'], ['FFC status', label(ffcStatuses, a.ffcStatus)], ['FFC number / expiry', [a.ffcNumber, a.ffcExpiry].filter(Boolean).join(' · ') || 'Not supplied'], ['Qualification route', label(qualificationRoutes, a.qualificationRoute)], ['Qualification status', label(learningStatuses, a.qualificationStatus)], ['PDE', label(learningStatuses, a.pdeStatus)], ['Practical training', label(learningStatuses, a.practicalStatus)], ['CPD', label(cpdStatuses, a.cpdStatus)], ['Education notes', a.qualificationNotes || 'Not supplied'], ['Why join us', a.motivation] ]
}
