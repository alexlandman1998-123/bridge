import {
  BOND_CONSULTANT_ACTIONS,
  buildBondConsultantActionHref,
} from '../bondConsultantActionService.js'

export const BOND_ORIGINATOR_EVIDENCE_LINK_VERSION = 'bond-originator-evidence-links-v1'

export const BOND_ORIGINATOR_EVIDENCE_LINK_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'application',
    label: 'Application',
    action: BOND_CONSULTANT_ACTIONS.reviewApplication,
    evidence: ['buyer_application_data', 'finance_intake'],
  }),
  Object.freeze({
    key: 'documents',
    label: 'Documents',
    action: BOND_CONSULTANT_ACTIONS.requestDocuments,
    evidence: ['document_requests', 'uploaded_finance_documents'],
  }),
  Object.freeze({
    key: 'bankFeedback',
    label: 'Bank Feedback',
    action: BOND_CONSULTANT_ACTIONS.updateBankFeedback,
    evidence: ['bank_applications', 'lender_feedback'],
  }),
  Object.freeze({
    key: 'offers',
    label: 'Offers',
    action: BOND_CONSULTANT_ACTIONS.captureOffer,
    evidence: ['bank_quotes', 'offer_comparison'],
  }),
  Object.freeze({
    key: 'buyerDecision',
    label: 'Buyer Decision',
    action: BOND_CONSULTANT_ACTIONS.recordBuyerDecision,
    evidence: ['accepted_offer', 'declined_offer'],
  }),
  Object.freeze({
    key: 'grant',
    label: 'Grant',
    action: BOND_CONSULTANT_ACTIONS.recordGrantReceived,
    evidence: ['formal_grant', 'approval_letter'],
  }),
  Object.freeze({
    key: 'signedGrant',
    label: 'Signed Grant',
    action: BOND_CONSULTANT_ACTIONS.recordGrantSigned,
    evidence: ['signed_grant', 'buyer_signature'],
  }),
  Object.freeze({
    key: 'instruction',
    label: 'Instruction',
    action: BOND_CONSULTANT_ACTIONS.sendAttorneyInstruction,
    evidence: ['attorney_instruction', 'bank_reference', 'signed_grant'],
  }),
  Object.freeze({
    key: 'activity',
    label: 'Activity',
    action: BOND_CONSULTANT_ACTIONS.monitorRegistration,
    evidence: ['originator_activity', 'registration_monitoring'],
  }),
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

export function resolveBondOriginatorEvidenceTransactionId(transactionOrId = {}) {
  if (typeof transactionOrId === 'string') return normalizeText(transactionOrId)
  return normalizeText(
    transactionOrId?.transactionId ||
    transactionOrId?.transaction_id ||
    transactionOrId?.id ||
    transactionOrId?.transaction?.id,
  )
}

export function buildBondOriginatorEvidenceDeepLinks(transactionOrId = {}) {
  const transactionId = resolveBondOriginatorEvidenceTransactionId(transactionOrId)
  const links = Object.fromEntries(
    BOND_ORIGINATOR_EVIDENCE_LINK_DEFINITIONS.map((definition) => [
      definition.key,
      {
        key: definition.key,
        label: definition.label,
        actionKey: definition.action.key,
        targetWorkspaceTab: definition.action.targetWorkspaceTab,
        targetAction: definition.action.targetAction,
        href: transactionId ? buildBondConsultantActionHref(transactionId, definition.action) : '',
        evidence: definition.evidence,
        readOnlyForAttorney: true,
      },
    ]),
  )

  return {
    version: BOND_ORIGINATOR_EVIDENCE_LINK_VERSION,
    transactionId,
    available: Boolean(transactionId),
    links,
    attorneyPolicy: 'read_only_deep_link_to_originator_workspace',
  }
}
