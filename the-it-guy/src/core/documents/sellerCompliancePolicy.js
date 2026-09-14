export const SELLER_COMPLIANCE_POLICY_CONTRACT = 'arch9-seller-compliance-policy-v1'

export const SELLER_COMPLIANCE_POLICY_REVIEW_STATUS = Object.freeze({
  pending: 'PENDING_AGENCY_APPROVAL',
  approved: 'APPROVED',
  rejected: 'REJECTED',
})

const REQUIRED_APPROVALS = Object.freeze([
  {
    key: 'popia_processing',
    title: 'Privacy / POPIA processing acknowledgement',
    purpose: 'Personal-information processing for seller onboarding and transaction administration.',
  },
  {
    key: 'fica_kyc_permission',
    title: 'FICA / KYC verification permission',
    purpose: 'Collection, verification and retention of information and supporting evidence for compliance.',
  },
  {
    key: 'seller_information_declaration',
    title: 'Seller information accuracy declaration',
    purpose: 'Confirmation that the supplied basic facts are true and complete to the seller’s knowledge.',
  },
  {
    key: 'mandate_template',
    title: 'Digital mandate template and commission clause',
    purpose: 'Approved mandate wording, VAT treatment and signature conditions.',
  },
  {
    key: 'disclosure_template',
    title: 'Mandatory disclosure template',
    purpose: 'Approved disclosure form wording and signing conditions.',
  },
  {
    key: 'fica_declaration_template',
    title: 'FICA declaration template',
    purpose: 'Approved FICA declaration wording, separate from supporting-document requests.',
  },
])

export const SELLER_COMPLIANCE_SCENARIOS = Object.freeze({
  individual: { requiredSignerRoles: ['seller_1'], authorityEvidence: [] },
  married: { requiredSignerRoles: ['seller_1', 'spouse'], authorityEvidence: [] },
  multiple_owners: { requiredSignerRoles: ['each_owner'], authorityEvidence: [] },
  company: { requiredSignerRoles: ['authorised_signatory'], authorityEvidence: ['company_resolution'] },
  trust: { requiredSignerRoles: ['authorised_trustee'], authorityEvidence: ['trustee_resolution', 'letters_of_authority'] },
  deceased_estate: { requiredSignerRoles: ['executor'], authorityEvidence: ['letters_of_executorship'] },
  power_of_attorney: { requiredSignerRoles: ['representative'], authorityEvidence: ['power_of_attorney_document'] },
})

function text(value) {
  return String(value ?? '').trim()
}

function normalizeStatus(value) {
  const status = text(value).toUpperCase()
  return Object.values(SELLER_COMPLIANCE_POLICY_REVIEW_STATUS).includes(status)
    ? status
    : SELLER_COMPLIANCE_POLICY_REVIEW_STATUS.pending
}

export function createSellerCompliancePolicyDraft({ organisationId = '', approvals = {} } = {}) {
  const normalizedApprovals = Object.fromEntries(REQUIRED_APPROVALS.map((item) => {
    const existing = approvals[item.key] || {}
    return [item.key, {
      key: item.key,
      status: normalizeStatus(existing.status),
      wordingVersion: text(existing.wordingVersion),
      approvedBy: text(existing.approvedBy),
      approvedAt: text(existing.approvedAt),
      notes: text(existing.notes),
    }]
  }))

  return {
    contract: SELLER_COMPLIANCE_POLICY_CONTRACT,
    organisationId: text(organisationId),
    approvals: normalizedApprovals,
    scenarios: SELLER_COMPLIANCE_SCENARIOS,
    documents: ['disclosure', 'fica_declaration', 'mandate'],
  }
}

export function assessSellerCompliancePolicyReadiness(policy = {}) {
  const draft = createSellerCompliancePolicyDraft(policy)
  const missing = REQUIRED_APPROVALS
    .filter((item) => draft.approvals[item.key].status !== SELLER_COMPLIANCE_POLICY_REVIEW_STATUS.approved)
    .map((item) => ({ key: item.key, title: item.title, purpose: item.purpose }))

  return {
    contract: SELLER_COMPLIANCE_POLICY_CONTRACT,
    ready: missing.length === 0,
    missing,
    approvalCount: REQUIRED_APPROVALS.length,
    approvedCount: REQUIRED_APPROVALS.length - missing.length,
  }
}

export function listSellerCompliancePolicyApprovals() {
  return REQUIRED_APPROVALS.map((item) => ({ ...item }))
}
