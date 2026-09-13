export const FICA_MANUAL_PACK_SOURCE = 'agent_physical_upload'
export const FICA_COMPLIANCE_PACK_KEY = 'fica_declaration'

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

export function resolveFicaDeclarationRequirementKey(party = '') {
  return key(party) === 'seller' ? 'seller_fica_declaration' : 'buyer_fica_declaration'
}

export function buildManualFicaPackContext({ party, partyType, signerName, signerCapacity, leadId = '', transactionId = '' } = {}) {
  const normalizedParty = key(party)
  const normalizedPartyType = key(partyType)
  const context = {
    source: FICA_MANUAL_PACK_SOURCE,
    compliancePackKey: FICA_COMPLIANCE_PACK_KEY,
    party: normalizedParty,
    partyType: normalizedPartyType,
    signerName: text(signerName),
    signerCapacity: text(signerCapacity),
    leadId: text(leadId),
    transactionId: text(transactionId),
    requirementKey: resolveFicaDeclarationRequirementKey(normalizedParty),
  }
  const missing = [
    !['buyer', 'seller'].includes(context.party) ? 'buyer or seller' : '',
    !context.partyType ? 'party type' : '',
    !context.signerName ? 'signer name' : '',
    !context.signerCapacity ? 'signer capacity' : '',
    !context.leadId && !context.transactionId ? 'lead or transaction context' : '',
  ].filter(Boolean)
  return { ...context, complete: missing.length === 0, missing }
}

export function buildManualFicaPackDocument(input = {}) {
  const context = buildManualFicaPackContext(input)
  if (!context.complete) {
    throw new Error(`Manual FICA upload requires ${context.missing.join(', ')}.`)
  }
  return {
    key: context.requirementKey,
    requirementKey: context.requirementKey,
    documentType: context.requirementKey,
    label: `${context.party === 'seller' ? 'Seller' : 'Buyer'} FICA Declaration`,
    category: 'fica',
    source: context.source,
    uploadSource: context.source,
    compliancePackKey: context.compliancePackKey,
    ficaManualContext: context,
  }
}
