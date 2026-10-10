export const requiredRecruitmentDocuments = ['CV', 'Identity document', 'Qualifications', 'Registration evidence']
export const recruitmentDocumentTypes = [...requiredRecruitmentDocuments, 'Other']
export const homeSeekersRecruitmentOrganisationId = '2958d402-368e-43c9-b728-0098e10505f1'
export const recruitmentDocumentAccept = '.pdf,.jpg,.jpeg,.png'
export function recruitmentDocumentPresentation(type, homeSeekers = false) {
  const labels = {
    'CV': { title: 'CV', hint: 'Experience and professional background.' },
    'Identity document': { title: 'Identity document', hint: 'A clear copy of the applicant’s ID or passport.' },
    'Qualifications': { title: 'Qualifications', hint: 'Relevant qualifications and certificates.' },
    'Registration evidence': { title: homeSeekers ? 'FFC certificate' : 'Registration evidence', hint: 'Professional registration and FFC evidence.' },
    'Other': { title: homeSeekers ? 'Proof of address / supporting FICA' : 'Additional documents', hint: homeSeekers ? 'A recent proof of address or other supporting FICA evidence.' : 'Other supporting evidence for the application.' },
  }
  return labels[type] || { title: type, hint: 'Supporting evidence for the application.' }
}
export function recruitmentDocumentError(file) {
  if (!file || !file.name || file.name.length > 254 || /[/\\]/.test(file.name)) return 'Choose a file with a name up to 254 characters.'
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > 10 * 1024 * 1024) return 'Choose a file up to 10 MB.'
  const expected = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[file.name.split('.').at(-1).toLowerCase()]
  if (!expected || (file.type && file.type !== expected)) return 'Choose a PDF, JPG or PNG file.'
  return ''
}
export function recruitmentDocumentMime(file) {
  return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[file.name.split('.').at(-1).toLowerCase()]
}
export function recruitmentDocumentPack(lead) {
  const homeSeekers = lead.organisation_id === homeSeekersRecruitmentOrganisationId
  return (homeSeekers ? recruitmentDocumentTypes : requiredRecruitmentDocuments).map(type => ({ type, label: homeSeekers && type === 'Other' ? 'Supporting FICA documents / proof of address' : type, files: (lead.documents_json || []).filter(file => file?.type === type && typeof file.path === 'string' && file.path.trim()), reason: type === 'Other' ? '' : lead.document_waivers_json?.[type] || '' }))
}
export const recruitmentDocumentsComplete = lead => recruitmentDocumentPack(lead).every(item => item.files.length > 0 || item.reason.trim().length >= 5)
