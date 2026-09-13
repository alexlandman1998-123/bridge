export const KNOWLEDGE_FACTORY_FICA_PROVIDER = 'knowledge_factory'
export const KNOWLEDGE_FACTORY_FICA_INTEGRATION_STATUS = Object.freeze({
  notConfigured: 'not_configured',
  integrationUnavailable: 'integration_unavailable',
  ready: 'ready',
})

function text(value) { return String(value ?? '').trim() }
function key(value) { return text(value).toLowerCase().replace(/[\s-]+/g, '_') }

export function buildKnowledgeFactoryFicaHandoff({
  organisationId = '', party = '', partyType = '', leadId = '', transactionId = '', declarationDocumentId = '', documentReadiness = {},
} = {}) {
  const checklist = documentReadiness && typeof documentReadiness === 'object' ? documentReadiness : {}
  const declarationReady = Boolean(checklist.declarationReady)
  const supportingDocumentsReady = Boolean(checklist.supportingDocumentsReady)
  const contextReady = Boolean(text(leadId) || text(transactionId))
  const complete = declarationReady && supportingDocumentsReady && contextReady && ['buyer', 'seller'].includes(key(party)) && Boolean(text(partyType))
  return {
    provider: KNOWLEDGE_FACTORY_FICA_PROVIDER,
    party: key(party),
    partyType: key(partyType),
    organisationId: text(organisationId),
    leadId: text(leadId),
    transactionId: text(transactionId),
    declarationDocumentId: text(declarationDocumentId),
    documentReadiness: { declarationReady, supportingDocumentsReady },
    complete,
    blockers: [
      !text(organisationId) ? 'organisation context' : '',
      !['buyer', 'seller'].includes(key(party)) ? 'buyer or seller party' : '',
      !text(partyType) ? 'party type' : '',
      !contextReady ? 'lead or transaction context' : '',
      !declarationReady ? 'signed declaration' : '',
      !supportingDocumentsReady ? 'context-required supporting documents' : '',
    ].filter(Boolean),
  }
}

export function getKnowledgeFactoryFicaVerificationAvailability(handoff = {}, integrationStatus = KNOWLEDGE_FACTORY_FICA_INTEGRATION_STATUS.notConfigured) {
  const status = key(integrationStatus) || KNOWLEDGE_FACTORY_FICA_INTEGRATION_STATUS.notConfigured
  if (!handoff?.complete) return { enabled: false, status: 'not_ready', reason: `Complete ${handoff?.blockers?.join(', ') || 'the FICA pack'} before verification.` }
  if (status !== KNOWLEDGE_FACTORY_FICA_INTEGRATION_STATUS.ready) {
    return { enabled: false, status, reason: status === KNOWLEDGE_FACTORY_FICA_INTEGRATION_STATUS.integrationUnavailable ? 'Knowledge Factory verification is temporarily unavailable.' : 'Knowledge Factory verification is not configured.' }
  }
  return { enabled: true, status: 'ready', reason: '' }
}
