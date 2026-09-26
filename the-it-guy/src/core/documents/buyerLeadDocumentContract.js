import { getCanonicalDocumentRequestMetadata } from './documentRequestCanonicalAdapter.js'
import { getCrossModuleDocumentDefinition } from '../../services/documents/crossModuleDocumentKeyMapService.js'

export const BUYER_LEAD_DOCUMENT_CONTRACT_VERSION = 'buyer_lead_document_contract_v1'

// These are the agent's current upload choices. The OTP has its own upload
// workflow, but is included in the mapping below for the later handoff.
export const BUYER_LEAD_DOCUMENT_TYPES = Object.freeze([
  Object.freeze({ key: 'buyer_id_document', label: 'Buyer ID document' }),
  Object.freeze({ key: 'buyer_proof_of_address', label: 'Buyer proof of address' }),
  Object.freeze({ key: 'proof_of_funds', label: 'Proof of funds' }),
  Object.freeze({ key: 'bank_statements', label: 'Bank statements' }),
  Object.freeze({ key: 'bond_pre_approval', label: 'Bond pre-approval' }),
  Object.freeze({ key: 'buyer_fica_declaration', label: 'Signed Buyer FICA Declaration' }),
])

const DOCUMENT_TARGETS = Object.freeze({
  buyer_id_document: Object.freeze({ documentKey: 'buyer_id_document', requestKey: 'buyer_id_document', subjectScope: 'person' }),
  buyer_proof_of_address: Object.freeze({ documentKey: 'buyer_proof_of_address', requestKey: 'buyer_proof_of_address', subjectScope: 'person' }),
  proof_of_funds: Object.freeze({ documentKey: 'proof_of_funds', requestKey: 'proof_of_funds', subjectScope: 'funding' }),
  bank_statements: Object.freeze({ documentKey: 'bank_statements', requestKey: 'income_affordability_documents', subjectScope: 'purchaser_or_entity' }),
  bond_pre_approval: Object.freeze({ documentKey: 'bond_preapproval', requestKey: '', subjectScope: 'funding' }),
  buyer_fica_declaration: Object.freeze({ documentKey: 'buyer_fica_declaration', requestKey: 'buyer_fica_declaration', subjectScope: 'signatory' }),
  uploaded_otp: Object.freeze({ documentKey: 'signed_otp', requestKey: 'signed_otp', subjectScope: 'transaction' }),
})

const ROLEPLAYER_DOCUMENT_TARGETS = Object.freeze({
  id_or_passport: 'buyer_id_document',
  proof_of_address: 'buyer_proof_of_address',
  source_of_funds: 'buyer_source_of_funds',
  tax_number_confirmation: '',
})

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function resolveBuyerLeadDocumentTarget(documentKey, {
  financeType = '',
  purchaserType = '',
  partyId = '',
  partyRole = '',
  ficaDocumentKind = '',
} = {}) {
  const sourceKey = normalize(documentKey)
  const roleplayerKind = normalize(ficaDocumentKind)
  const roleplayerKey = roleplayerKind ? ROLEPLAYER_DOCUMENT_TARGETS[roleplayerKind] : null
  const target = roleplayerKind
    ? roleplayerKey ? { documentKey: roleplayerKey, requestKey: roleplayerKey, subjectScope: 'person' } : null
    : DOCUMENT_TARGETS[sourceKey] || null
  const normalizedFinance = normalize(financeType)
  const normalizedPurchaser = normalize(purchaserType)
  const normalizedRole = normalize(partyRole)
  const entityPurchaser = ['company', 'trust', 'close_corporation'].includes(normalizedPurchaser)
  let resolvedRequestKey = target?.requestKey || ''
  if (sourceKey === 'proof_of_funds') {
    resolvedRequestKey = ['hybrid', 'combination'].includes(normalizedFinance)
      ? 'proof_of_funds_cash_component'
      : ['cash', 'cash_sale', 'cash_deal'].includes(normalizedFinance)
        ? 'proof_of_funds'
        : ''
  } else if (sourceKey === 'bank_statements' && !['bond', 'hybrid', 'combination'].includes(normalizedFinance)) {
    resolvedRequestKey = ''
  }
  if (entityPurchaser && ['buyer_id_document', 'buyer_proof_of_address'].includes(resolvedRequestKey)) {
    resolvedRequestKey = sourceKey === 'buyer_id_document' || roleplayerKind === 'id_or_passport'
      ? normalizedPurchaser === 'trust' && normalizedRole.includes('trustee')
        ? 'buyer_trustee_fica'
        : ['company', 'close_corporation'].includes(normalizedPurchaser) && (normalizedRole.includes('director') || normalizedRole.includes('member'))
          ? 'buyer_director_fica'
          : ''
      : ''
  }
  const request = resolvedRequestKey
    ? getCanonicalDocumentRequestMetadata(resolvedRequestKey, { context: 'buyer' })
    : null
  const definition = target?.documentKey ? getCrossModuleDocumentDefinition(target.documentKey) : null
  const subjectId = String(partyId || '').trim()
  const subjectScope = target?.subjectScope || ''
  const needsParty = ['person', 'purchaser_or_entity', 'signatory'].includes(subjectScope)
  const mappingStatus = !target || !request?.canonicalDocumentRequestKnown
    ? 'review_required'
    : needsParty && !subjectId
      ? 'party_unresolved'
      : 'mapped'

  return Object.freeze({
    contractVersion: BUYER_LEAD_DOCUMENT_CONTRACT_VERSION,
    sourceKey,
    documentDefinitionKey: definition?.canonicalKey || target?.documentKey || '',
    canonicalRequestKey: request?.canonicalDocumentRequestKey || '',
    canonicalRequestVisibility: request?.canonicalDocumentRequestVisibility || '',
    subjectScope,
    partyId: subjectId,
    partyRole: normalizedRole,
    requiresExactRequirementInstance: Boolean(target),
    mappingStatus,
    // The contract is descriptive only. Phase 2 must check the actual
    // transaction requirement instance and enforce access before linking.
    canAutoLink: false,
  })
}
