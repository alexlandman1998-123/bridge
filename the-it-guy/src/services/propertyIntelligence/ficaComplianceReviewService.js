const COMPLETE_DOCUMENT_STATUSES = new Set(['received', 'verified'])
const COMPLETED_PROVIDER_STATUSES = new Set(['completed', 'verified', 'clear'])

function text(value) { return String(value || '').trim() }

function status(label, complete, detail) {
  return { label, status: complete ? 'complete' : 'action_required', detail }
}

export function buildFicaCompliancePanel({ declaration = {}, documents = {}, verification = {}, approval = {}, certificate = {} } = {}) {
  const declarationComplete = ['signed', 'uploaded', 'verified'].includes(text(declaration.status)) || Boolean(declaration.documentId)
  const checklist = documents.checklist || {}
  const documentValues = Object.values(checklist)
  const documentsComplete = Boolean(documents.complete) || (documentValues.length > 0 && documentValues.every((item) => COMPLETE_DOCUMENT_STATUSES.has(text(item))))
  const providerComplete = COMPLETED_PROVIDER_STATUSES.has(text(verification.status))
  const approved = text(approval.status) === 'approved'
  const certificateAvailable = Boolean(certificate.documentId) && !certificate.supersededAt
  return {
    steps: [
      status('Declaration', declarationComplete, declarationComplete ? 'Signed or uploaded' : 'Declaration is still required'),
      status('Documents', documentsComplete, documentsComplete ? 'Supporting evidence complete' : 'Supporting evidence is incomplete'),
      status('Provider', providerComplete, providerComplete ? 'Verification result received' : text(verification.reason) || 'Verification is not complete'),
      status('Staff approval', approved, approved ? 'Approved by authorised staff' : 'Authorised staff approval is required'),
    ],
    certificate: certificateAvailable
      ? { status: 'available', detail: 'Certificate is available' }
      : { status: 'unavailable', detail: approved && providerComplete ? 'Certificate generation has not run yet' : 'Certificate requires a completed result and staff approval' },
    readyForApproval: declarationComplete && documentsComplete && providerComplete,
  }
}

export function getFicaCertificateGenerationAvailability(input = {}) {
  const panel = buildFicaCompliancePanel(input)
  if (panel.certificate.status === 'available') return { enabled: false, reason: 'A current certificate already exists.' }
  if (!panel.readyForApproval) return { enabled: false, reason: 'Complete the declaration, documents, and provider verification first.' }
  if (input.approval?.status !== 'approved') return { enabled: false, reason: 'An authorised staff member must approve the compliance result.' }
  return { enabled: true, reason: '' }
}
