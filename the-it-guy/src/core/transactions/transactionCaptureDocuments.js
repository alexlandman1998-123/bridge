import { resolveCanonicalDocumentRequestsForScenario } from '../documents/documentRequestCanonicalMatrix.js'
import { transactionPartyDocumentSubjects } from './transactionPartyProfile.js'

export function transactionCaptureDocumentOptions(parties, financeType, sellerHasExistingBond = false) {
  const options = [
    { value: 'signed_otp', key: 'signed_otp', label: 'Signed OTP / sale agreement' },
    { value: 'signed_mandate', key: 'signed_mandate', label: 'Signed mandate' },
    { value: 'general', key: 'general', label: 'Other transaction document' },
  ]
  for (const requirement of resolveCanonicalDocumentRequestsForScenario({ transactionParties: parties, financeType, sellerHasExistingBond })) {
    if (options.some((option) => option.key === requirement.key)) continue
    const subjects = transactionPartyDocumentSubjects(requirement.key, parties)
    for (const person of subjects.length ? subjects : [null]) {
      options.push({ value: `${requirement.key}${person ? `:${person.id}` : ''}`, key: requirement.key, partyId: person?.id || null,
        label: `${requirement.label}${person ? ` — ${person.name || 'Unnamed person'}` : ''}` })
    }
  }
  return options
}

// Never infer a person-specific target by document type alone: two co-buyers
// may have the same requirement. Unmatched evidence stays in the library.
export function transactionCaptureUploadTarget(entry, requirements = []) {
  const matches = requirements.filter((requirement) => (requirement.key === entry.key || requirement.canonicalDocumentKey === entry.key)
    && (requirement.partyId || null) === (entry.partyId || null)
    && requirement.canonicalRequirementInstanceId)
  return matches.length === 1 ? matches[0].canonicalRequirementInstanceId : null
}

export async function saveTransactionCaptureDocuments({ transactionId, entries, requirements = [], upload, onEntry = () => {} }) {
  if (!transactionId) throw new Error('Save the transaction before uploading documents.')
  const results = []
  for (const entry of entries) {
    if (entry.status === 'saved') { results.push(entry); continue }
    const target = transactionCaptureUploadTarget(entry, requirements)
    onEntry({ ...entry, status: 'uploading', error: '' })
    try {
      const document = await upload({ transactionId, file: entry.file, category: entry.label,
        documentType: entry.key, requiredDocumentKey: entry.key === 'general' ? null : entry.key,
        canonicalRequirementInstanceId: target, inferCanonicalRequirement: Boolean(target),
        uploadedByParty: entry.partyId, relatedEntityId: entry.partyId,
        relatedEntityType: entry.partyId ? 'transaction_party' : null,
        source: 'transaction_capture', isClientVisible: false })
      if (!document?.id) throw new Error('The document save could not be confirmed. Retry this file.')
      const result = { ...entry, status: 'saved', documentId: document.id, error: '',
        needsMatching: entry.key !== 'general' && !target }
      results.push(result)
      onEntry(result)
    } catch (error) {
      const result = { ...entry, status: 'failed', error: error?.message || 'Upload failed. Retry this file.' }
      results.push(result)
      onEntry(result)
    }
  }
  return results
}
