// This projection is shared by token APIs and agent screens. No private discovery or storage paths.
export const RENTAL_REQUIREMENT_FIELDS = 'id, checklist_id, application_id, landlord_lead_id, subject_id, scope_key, purpose, required, active, generation, discovery_revision, rule_version, mode, state, current_document_id, current_landlord_document_id, expires_at'
export function mapRentalRequirement(row) {
  return { id: row.id, checklistId: row.checklist_id, applicationId: row.application_id, landlordLeadId: row.landlord_lead_id, subjectId: row.subject_id, scopeKey: row.scope_key, purpose: row.purpose, required: row.required, active: row.active, generation: row.generation, discoveryRevision: row.discovery_revision, ruleVersion: row.rule_version, mode: row.mode, state: row.state, documentId: row.current_landlord_document_id || row.current_document_id, expiresAt: row.expires_at }
}
export function rentalSavedRequirementProgress(requirements) {
  const current = (requirements || []).filter((item) => item.active && item.required && item.mode === 'active')
  const received = current.filter((item) => ['received', 'accepted'].includes(item.state) && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now())).length
  const accepted = current.filter((item) => item.state === 'accepted' && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now())).length
  return { required: current.length, received, accepted, collectionComplete: current.length > 0 && received === current.length, approvalComplete: current.length > 0 && accepted === current.length }
}
