export const RENTAL_EVIDENCE_CONTRACT_VERSION = 'arch9_rental_evidence_v1'
export const RENTAL_EVIDENCE_ENTITY_TYPES = Object.freeze(['rental_property', 'rental_unit', 'rental_landlord', 'rental_mandate'])
export const RENTAL_DOCUMENT_LINK_STATES = Object.freeze(['linked', 'replaced', 'removed'])
export const RENTAL_ACTIVITY_PAYLOAD_MAX_BYTES = 8192

const text = (value) => String(value ?? '').trim()
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function byteLength(value) { return new TextEncoder().encode(JSON.stringify(value)).length }
function required(value, label) { const result = text(value); if (!result) throw new Error(`${label} is required.`); return result }

export function createRentalDocumentLinkPayload(values = {}) {
  const entityType = required(values.entityType || values.entity_type, 'Rental entity type')
  if (!RENTAL_EVIDENCE_ENTITY_TYPES.includes(entityType)) throw new Error('Choose a supported Rental evidence entity.')
  const linkState = text(values.linkState || values.link_state || 'linked').toLowerCase()
  if (!RENTAL_DOCUMENT_LINK_STATES.includes(linkState)) throw new Error('Choose a supported document link state.')
  return { organisation_id: required(values.organisationId || values.organisation_id, 'Organisation'), property_id: required(values.propertyId || values.property_id, 'Property'), branch_id: text(values.branchId || values.branch_id) || null, entity_type: entityType, entity_id: required(values.entityId || values.entity_id, 'Rental entity'), document_id: required(values.documentId || values.document_id, 'Canonical document'), document_label: text(values.documentLabel || values.document_label) || null, document_category: text(values.documentCategory || values.document_category) || null, link_state: linkState, replaces_link_id: text(values.replacesLinkId || values.replaces_link_id) || null, metadata_json: object(values.metadata), created_by: text(values.createdBy || values.created_by) || null }
}

export function createRentalActivityProjection({ sourceEventId = '', organisationId = '', propertyId = '', branchId = '', entityType = '', entityId = '', activityType = '', title = '', description = '', payload = {}, occurredAt = null } = {}) {
  if (!RENTAL_EVIDENCE_ENTITY_TYPES.includes(text(entityType))) throw new Error('Choose a supported Rental activity entity.')
  const normalizedPayload = object(payload)
  if (byteLength(normalizedPayload) > RENTAL_ACTIVITY_PAYLOAD_MAX_BYTES) throw new Error(`Rental activity payload exceeds ${RENTAL_ACTIVITY_PAYLOAD_MAX_BYTES} bytes.`)
  return Object.freeze({ contractVersion: RENTAL_EVIDENCE_CONTRACT_VERSION, sourceEventId: required(sourceEventId, 'Source event'), organisationId: required(organisationId, 'Organisation'), propertyId: required(propertyId, 'Property'), branchId: text(branchId) || null, entityType: text(entityType), entityId: required(entityId, 'Rental entity'), activityType: required(activityType, 'Activity type'), title: required(title, 'Activity title'), description: text(description) || null, payload: normalizedPayload, occurredAt: occurredAt || new Date().toISOString() })
}

export function mapRentalDocumentLink(row = {}) { return { id: text(row.id), entityType: text(row.entity_type), entityId: text(row.entity_id), documentId: text(row.document_id), documentLabel: text(row.document_label), documentCategory: text(row.document_category), linkState: text(row.link_state), createdAt: row.created_at || null, raw: row } }
export function mapRentalActivityProjection(row = {}) { return { id: text(row.id), entityType: text(row.entity_type), entityId: text(row.entity_id), activityType: text(row.activity_type), title: text(row.title), description: text(row.description), occurredAt: row.occurred_at || null, raw: row } }
