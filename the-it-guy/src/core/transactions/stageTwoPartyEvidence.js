function value(input) {
  return String(input || '').trim().toLowerCase()
}

export function ficaDocumentAppliesToParty(documentKey, party = {}) {
  const key = value(documentKey).replace(/^document:/, '')
  if (party.entityType === 'individual') return !/company|director|trust|trustee|corporation|member|(^|_)cc(_|$)/.test(key)
  if (party.entityType === 'company') return /company|director|beneficial_ownership/.test(key)
  if (party.entityType === 'trust') return /trust|trustee|letters_of_authority|beneficial_ownership/.test(key)
  if (party.entityType === 'close_corporation') return /corporation|member|company|director|beneficial_ownership|(^|_)cc(_|$)/.test(key)
  return false
}

export function documentBelongsToParty(document = {}, partyId = '') {
  const subject = value(partyId)
  if (!subject) return false
  const participantId = subject.split(':').at(-1)
  const relatedType = value(document.relatedEntityType || document.related_entity_type)
  const relatedId = value(document.relatedEntityId || document.related_entity_id)
  if (relatedType === 'transaction_participant' && relatedId) return relatedId === participantId
  const directIds = [document.partyId, document.party_id, document.applicantId, document.applicant_id,
    document.participantId, document.participant_id, document.requirement?.partyId]
    .map(value).filter(Boolean)
  return directIds.some(id => id === subject || id === participantId)
}
