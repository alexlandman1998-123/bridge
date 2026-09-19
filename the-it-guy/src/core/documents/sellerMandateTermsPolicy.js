export const SELLER_MANDATE_TERMS_POLICY_CONTRACT = 'arch9-seller-mandate-terms-policy-v1'
export const SELLER_MANDATE_TERMS_DOCUMENT_KEY = 'seller_mandate_terms'
export const SELLER_MANDATE_TERMS_TITLE = 'Seller Mandate Terms, Privacy & Electronic Signing Notice'

export const SELLER_MANDATE_TERMS_APPROVAL_STATUS = Object.freeze({
  draft: 'DRAFT',
  pendingCounselReview: 'PENDING_COUNSEL_REVIEW',
  approved: 'APPROVED',
  retired: 'RETIRED',
})

const REQUIRED_SECTIONS = Object.freeze([
  'mandate_terms',
  'privacy_notice_summary',
  'paia_access_information',
  'electronic_communications_and_signing',
  'records_and_audit_trail',
])

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function normaliseStatus(value) {
  const status = text(value).toUpperCase()
  return Object.values(SELLER_MANDATE_TERMS_APPROVAL_STATUS).includes(status)
    ? status
    : SELLER_MANDATE_TERMS_APPROVAL_STATUS.draft
}

function normaliseSection(section = {}) {
  const source = record(section)
  return {
    key: text(source.key),
    title: text(source.title),
    body: text(source.body),
  }
}

export function createSellerMandateTermsPolicyDraft(input = {}) {
  const source = record(input)
  const sections = Array.isArray(source.sections) ? source.sections.map(normaliseSection).filter((section) => section.key) : []
  return {
    contract: SELLER_MANDATE_TERMS_POLICY_CONTRACT,
    organisationId: text(source.organisationId || source.organisation_id),
    version: text(source.version),
    contentDigest: text(source.contentDigest || source.content_digest).toLowerCase(),
    title: text(source.title) || SELLER_MANDATE_TERMS_TITLE,
    effectiveAt: text(source.effectiveAt || source.effective_at),
    status: normaliseStatus(source.status),
    approvedBy: text(source.approvedBy || source.approved_by),
    approvedAt: text(source.approvedAt || source.approved_at),
    privacyNoticeUrl: text(source.privacyNoticeUrl || source.privacy_notice_url),
    paiaManualUrl: text(source.paiaManualUrl || source.paia_manual_url),
    informationOfficerName: text(source.informationOfficerName || source.information_officer_name),
    informationOfficerEmail: text(source.informationOfficerEmail || source.information_officer_email).toLowerCase(),
    sections,
  }
}

export function assessSellerMandateTermsPolicy(policy = {}) {
  const draft = createSellerMandateTermsPolicyDraft(policy)
  const sectionKeys = new Set(draft.sections.filter((section) => section.body).map((section) => section.key))
  const missing = []
  if (!draft.organisationId) missing.push('organisation')
  if (!draft.version) missing.push('version')
  if (!/^sha256:[a-f0-9]{64}$/.test(draft.contentDigest)) missing.push('terms content digest')
  if (!draft.effectiveAt) missing.push('effective date')
  if (!draft.privacyNoticeUrl) missing.push('privacy notice link')
  if (!draft.paiaManualUrl) missing.push('PAIA Manual link')
  if (!draft.informationOfficerName) missing.push('Information Officer name')
  if (!draft.informationOfficerEmail) missing.push('Information Officer email')
  REQUIRED_SECTIONS.filter((key) => !sectionKeys.has(key)).forEach((key) => missing.push(`section:${key}`))
  if (draft.status !== SELLER_MANDATE_TERMS_APPROVAL_STATUS.approved) missing.push('counsel approval')
  if (draft.status === SELLER_MANDATE_TERMS_APPROVAL_STATUS.approved && (!draft.approvedBy || !draft.approvedAt)) missing.push('approval evidence')

  return {
    contract: SELLER_MANDATE_TERMS_POLICY_CONTRACT,
    ready: missing.length === 0,
    missing,
    policy: draft,
  }
}

export function buildSellerMandateTermsDocumentModel(policy = {}) {
  const assessment = assessSellerMandateTermsPolicy(policy)
  if (!assessment.ready) return null
  const terms = assessment.policy
  return {
    key: SELLER_MANDATE_TERMS_DOCUMENT_KEY,
    title: terms.title,
    introduction: 'These are the agency-approved terms, privacy information and electronic-signing conditions frozen for this signing pack.',
    termsVersion: terms.version,
    contentDigest: terms.contentDigest,
    effectiveAt: terms.effectiveAt,
    privacyNoticeUrl: terms.privacyNoticeUrl,
    paiaManualUrl: terms.paiaManualUrl,
    informationOfficer: { name: terms.informationOfficerName, email: terms.informationOfficerEmail },
    sections: terms.sections.map((section) => ({ title: section.title || section.key, body: section.body })),
    declaration: 'I confirm that I have reviewed this notice and the linked Privacy Notice and PAIA Manual.',
  }
}
