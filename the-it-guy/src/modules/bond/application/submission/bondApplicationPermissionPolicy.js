// Review contract for the proposed signing flow. Not an authorisation check,
// legal approval, or replacement for the current production declarations.
import { canonicalizeBondApplicationSnapshot } from './bondApplicationSnapshotHash.js'

export const BOND_PERMISSION_POLICY_VERSION = 'bond-permissions-2026-10-03-draft-1'
export const BOND_PERMISSION_SIGNING_METHODS = ['online', 'download_sign_upload']

export const BOND_PERMISSION_DRAFT_CLAUSES = [
  {
    key: 'originator_authority', required: true,
    title: 'Apply to my selected banks',
    text: 'I authorise the bond originator named in this application to submit this application to the banks I have selected and communicate with them about the application. Adding another bank requires my further authorisation.',
  },
  {
    key: 'application_data_sharing', required: true,
    title: 'Use and share information for this application',
    text: 'I authorise the named bond originator to use my application information and share the information needed to assess this application with my selected banks and the service providers identified in the privacy notice. This permission is for the application and does not include marketing.',
  },
  {
    key: 'credit_checks', required: true,
    title: 'Credit and affordability checks',
    text: 'I authorise the named bond originator and my selected banks to obtain the credit bureau information and perform the credit, affordability and fraud checks described in the privacy notice for this application. This does not authorise unrestricted access to my bank accounts.',
  },
  {
    key: 'information_accuracy', required: true,
    title: 'Confirm my information',
    text: 'I confirm that the information I have provided for this application is accurate and complete to the best of my knowledge. I will notify the bond originator if it changes before the application is decided.',
  },
  {
    key: 'optional_marketing', required: false,
    title: 'Optional marketing',
    text: 'I would like to receive marketing from the organisation named beside this choice, using the channels I select. I can change this preference or unsubscribe without affecting my bond application.',
  },
]

export function createBondPermissionReviewPolicy() {
  return {
    version: BOND_PERMISSION_POLICY_VERSION,
    status: 'draft',
    originator: { id: '', legalName: '', privacyContact: '' },
    // One entry per participating bank: id, name, methods, requiredForms.
    // Each method carries its own accepted/rejected/pending decision evidence.
    banks: [],
    signingMethods: {
      online: { description: 'Review fixed version, verify identity, explicitly consent and sign; each applicant separately.', provider: '', verificationMethod: '', evidenceSpecification: '', jointApplicantProcess: '' },
      download_sign_upload: { description: 'Download fixed version, sign, upload unchanged original; consultant verifies every required signer.', jointApplicantProcess: '' },
    },
    clauses: BOND_PERMISSION_DRAFT_CLAUSES.map((clause) => ({ ...clause })),
    privacy: {
      noticeReference: '', recipientRegisterReference: '', operatorAgreementReference: '',
      rightsAndWithdrawalProcess: '', accessRulesReference: '', accessVerificationReference: '',
      statementHandoff: { provider: '', receiptEvidence: '', arch9Retention: 'status_only' },
      retention: {
        application_and_signed_evidence: { rule: '', basis: '', deletionProcess: '' },
        supporting_documents: { rule: '', basis: '', deletionProcess: '' },
        statement_receipt_status: { rule: '', basis: '', deletionProcess: '' },
        marketing_preference: { rule: '', basis: '', deletionProcess: '' },
      },
    },
    approvals: { legal: null, originator: null, privacy: null },
  }
}

const present = (value) => typeof value === 'string' && value.trim().length > 0
export function getBondPermissionReviewContent(policy) {
  const { approvals: _approvals, status: _status, ...content } = policy
  return canonicalizeBondApplicationSnapshot({
    ...content,
    banks: (policy.banks || []).map((bank) => {
      const details = { ...bank }
      delete details.methods
      return details
    }),
  })
}

function evidencedDecision(decision, version, asOf, reviewedContent) {
  return decision?.status === 'approved' && decision.policyVersion === version &&
    decision.reviewedContent === reviewedContent &&
    present(decision.approvedBy) && present(decision.reference) && present(decision.approvedAt) &&
    Number.isFinite(Date.parse(decision.approvedAt)) && Date.parse(decision.approvedAt) <= Date.parse(asOf)
}

// Call from a trusted server configuration in a later implementation phase.
// A browser-supplied "approved" flag must never enable signing or grant access.
export function assessBondPermissionReviewPolicy(policy = createBondPermissionReviewPolicy(), { asOf = new Date().toISOString() } = {}) {
  const issues = []
  const reviewedContent = getBondPermissionReviewContent(policy)
  const requireText = (value, path) => { if (!present(value)) issues.push({ code: 'decision_required', path }) }
  if (policy.version !== BOND_PERMISSION_POLICY_VERSION) issues.push({ code: 'policy_version_mismatch', path: 'version' })
  if (policy.status !== 'approved') issues.push({ code: 'policy_not_approved', path: 'status' })
  if (!Number.isFinite(Date.parse(asOf))) issues.push({ code: 'invalid_assessment_date', path: 'asOf' })
  for (const field of ['id', 'legalName', 'privacyContact']) requireText(policy.originator?.[field], `originator.${field}`)
  for (const role of ['legal', 'originator', 'privacy']) {
    if (!evidencedDecision(policy.approvals?.[role], policy.version, asOf, reviewedContent)) issues.push({ code: 'approval_evidence_required', path: `approvals.${role}` })
  }
  for (const field of ['noticeReference', 'recipientRegisterReference', 'operatorAgreementReference', 'rightsAndWithdrawalProcess', 'accessRulesReference', 'accessVerificationReference']) requireText(policy.privacy?.[field], `privacy.${field}`)
  for (const category of Object.keys(createBondPermissionReviewPolicy().privacy.retention)) {
    for (const field of ['rule', 'basis', 'deletionProcess']) requireText(policy.privacy?.retention?.[category]?.[field], `privacy.retention.${category}.${field}`)
  }
  for (const field of ['provider', 'receiptEvidence']) requireText(policy.privacy?.statementHandoff?.[field], `privacy.statementHandoff.${field}`)
  if (policy.privacy?.statementHandoff?.arch9Retention !== 'status_only') issues.push({ code: 'statement_retention_conflict', path: 'privacy.statementHandoff.arch9Retention' })
  for (const clause of BOND_PERMISSION_DRAFT_CLAUSES) {
    const matches = (policy.clauses || []).filter((item) => item.key === clause.key)
    if (matches.length !== 1 || !present(matches[0]?.text) || matches[0]?.required !== clause.required) issues.push({ code: 'invalid_permission_clause', path: `clauses.${clause.key}` })
  }
  const banks = Array.isArray(policy.banks) ? policy.banks : []
  if (!banks.length) issues.push({ code: 'participating_banks_required', path: 'banks' })
  if (new Set(banks.map((bank) => bank.id)).size !== banks.length) issues.push({ code: 'duplicate_bank', path: 'banks' })
  banks.forEach((bank, index) => {
    requireText(bank.id, `banks.${index}.id`)
    requireText(bank.name, `banks.${index}.name`)
    // [] means the bank explicitly confirmed that no additional forms apply.
    if (!Array.isArray(bank.requiredForms)) issues.push({ code: 'bank_forms_decision_required', path: `banks.${index}.requiredForms` })
    for (const method of BOND_PERMISSION_SIGNING_METHODS) {
      const decision = bank.methods?.[method]
      if (!['approved', 'rejected'].includes(decision?.status) || !present(decision?.approvedBy) || !present(decision?.reference) || decision?.policyVersion !== policy.version || decision?.reviewedContent !== reviewedContent || !present(decision?.approvedAt) || !Number.isFinite(Date.parse(decision?.approvedAt)) || Date.parse(decision.approvedAt) > Date.parse(asOf)) {
        issues.push({ code: 'bank_method_decision_required', path: `banks.${index}.methods.${method}` })
      }
    }
  })
  const methods = Object.fromEntries(BOND_PERMISSION_SIGNING_METHODS.map((method) => {
    const methodIssues = [...issues]
    requireMethodFields(method, policy, methodIssues)
    banks.forEach((bank, index) => {
      if (!evidencedDecision(bank.methods?.[method], policy.version, asOf, reviewedContent)) methodIssues.push({ code: 'bank_method_not_accepted', path: `banks.${index}.methods.${method}` })
    })
    return [method, { readyForImplementation: methodIssues.length === 0, issues: methodIssues }]
  }))
  return { version: policy.version, decisionsComplete: issues.length === 0, issues, methods }
}

function requireMethodFields(method, policy, issues) {
  const fields = method === 'online' ? ['provider', 'verificationMethod', 'evidenceSpecification', 'jointApplicantProcess'] : ['jointApplicantProcess']
  for (const field of fields) {
    if (!present(policy.signingMethods?.[method]?.[field])) issues.push({ code: 'signing_method_detail_required', path: `signingMethods.${method}.${field}` })
  }
}
