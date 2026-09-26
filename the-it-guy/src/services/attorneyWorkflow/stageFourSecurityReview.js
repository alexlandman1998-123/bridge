import { normalizeFinanceType } from '../../core/transactions/financeType.js'

const STAGE_FOUR_KEYS = new Set([
  'cash_funding_source_review', 'payment_security_review',
])
const CASH_EVIDENCE_KEYS = new Set(['proof_of_funds', 'buyer_proof_of_funds', 'source_of_funds'])
const GUARANTEE_EVIDENCE_KEYS = new Set([
  'guarantee_letter', 'bank_guarantee', 'bond_guarantee', 'guarantees',
  'guarantee_wording_acceptance', 'transfer_guarantee',
])
const label = (value) => String(value || '').trim()
const key = (value) => label(value).toLowerCase().replace(/[\s-]+/g, '_')

function hasFile(document = {}) {
  if (document.missing === true || ['missing', 'requested', 'rejected', 'not_applicable'].includes(key(document.status))) return false
  return Boolean(document.fileUrl || document.file_url || document.url || document.linkedDocument?.id ||
    (document.source === 'documents' && document.id && (document.uploadedAt || document.uploaded_at)))
}

function documentKeys(document = {}) {
  return [document.sourceRequirementKey, document.requiredDocumentKey, document.documentType,
    document.document_type, document.requirement?.key, document.requiredDocument?.key].map(key).filter(Boolean)
}

function matchingEvidence(documents, keys) {
  const seen = new Set()
  return (documents || []).filter((document) => {
    if (!hasFile(document) || !documentKeys(document).some((item) => keys.has(item))) return false
    const id = label(document.linkedDocument?.id || document.documentId || document.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function applicantLabel(requirement, applicants) {
  if (requirement.scope !== 'participant') return 'Application'
  const role = requirement.participantRole || 'primary_applicant'
  const ordinal = Number(label(requirement.participantKey).match(/:(\d+)$/)?.[1] || 1)
  const person = role === 'primary_applicant'
    ? applicants.find((item) => item.role === 'primary_applicant')
    : role === 'co_applicant'
      ? applicants.find((item) => item.role === 'co_applicant')
      : applicants.filter((item) => item.role === 'surety')[ordinal - 1]
  return label(person?.fullName) || (role === 'co_applicant' ? 'Co-applicant' : role === 'surety' ? `Surety ${ordinal}` : 'Primary applicant')
}

function bondRows(checklist, applicants) {
  const seen = new Set()
  return (checklist?.items || []).filter((item) => item.requirement?.required).map((item) => {
    const requirement = item.requirement
    const scope = requirement.participantKey || requirement.participantRole || 'application'
    const identity = `${scope}:${requirement.key}`
    if (seen.has(identity)) return null
    seen.add(identity)
    return {
      id: identity,
      title: label(requirement.title || requirement.label || requirement.key),
      person: applicantLabel(requirement, applicants),
      participantKey: requirement.participantKey || null,
      participantRole: requirement.participantRole || null,
      status: item.status || 'missing',
      statusLabel: item.statusLabel || 'Missing',
      complete: item.complete === true,
      uploadedCount: Number(item.uploadedCount || 0),
      requiredCount: Number(item.requiredCount || 1),
    }
  }).filter(Boolean).sort((left, right) => Number(left.complete) - Number(right.complete) || left.person.localeCompare(right.person) || left.title.localeCompare(right.title))
}

export function buildStageFourSecurityReview({
  taskKey = '', routingProfile = {}, documents = [], securityDocuments = [],
  bondApplicationChecklist = null, bondApplicants = [],
} = {}) {
  if (!STAGE_FOUR_KEYS.has(taskKey)) return null
  const financeType = normalizeFinanceType(routingProfile.financeType || routingProfile.finance_type, { allowUnknown: true })
  const cashApplies = financeType === 'cash' || financeType === 'combination'
  const bondApplies = financeType === 'bond' || financeType === 'combination'
  const fundingKnown = cashApplies || bondApplies
  const paymentSecurity = key(routingProfile.paymentSecurity || routingProfile.mvpProfile?.paymentSecurity) || 'unknown'
  const allSecurityDocuments = [...documents, ...securityDocuments]
  const cashEvidence = cashApplies ? matchingEvidence(allSecurityDocuments, CASH_EVIDENCE_KEYS) : []
  const guaranteeEvidence = paymentSecurity === 'guarantee'
    ? matchingEvidence(allSecurityDocuments, GUARANTEE_EVIDENCE_KEYS)
    : []
  const applicationRows = bondApplies ? bondRows(bondApplicationChecklist, bondApplicants) : []
  const notApplicable = [
    ...(fundingKnown && !cashApplies ? ['Cash-source review'] : []),
    ...(fundingKnown && !bondApplies ? ['Bond-application evidence'] : []),
    ...(paymentSecurity === 'cleared_trust_funds' ? ['Guarantee evidence'] : []),
  ]
  return {
    financeType,
    financeLabel: financeType === 'combination' ? 'Mixed cash and bond' : financeType === 'bond' ? 'Bond funded' : financeType === 'cash' ? 'Cash funded' : financeType === 'developer' ? 'Developer finance · cash/bond split to confirm' : 'Finance route to confirm',
    paymentSecurity,
    paymentSecurityLabel: paymentSecurity === 'cleared_trust_funds' ? 'Cleared trust funds' : paymentSecurity === 'guarantee' ? 'Guarantee' : paymentSecurity === 'other' ? 'Other security' : 'Security to confirm',
    cashApplies,
    bondApplies,
    cashEvidenceCount: cashEvidence.length,
    guaranteeEvidenceCount: guaranteeEvidence.length,
    bondRows: applicationRows,
    bondReadyCount: applicationRows.filter((row) => row.complete).length,
    bondOutstandingCount: applicationRows.filter((row) => !row.complete).length,
    notApplicable,
    taskApplicable: taskKey !== 'cash_funding_source_review' || financeType !== 'bond',
  }
}
