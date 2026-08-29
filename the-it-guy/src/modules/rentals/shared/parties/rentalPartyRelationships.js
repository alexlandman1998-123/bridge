export const RENTAL_PARTY_RELATIONSHIP_CONTRACT_VERSION = 'arch9_rentals_party_relationships_v1'

export const RENTAL_PARTY_ROLES = Object.freeze({
  landlord: 'landlord',
  applicant: 'applicant',
  tenant: 'tenant',
  contractor: 'contractor',
})

export const RENTAL_PARTY_RELATIONSHIP_ENTITIES = Object.freeze({
  property: 'rental_property',
  application: 'rental_application',
  tenancy: 'rental_tenancy',
  maintenanceRequest: 'rental_maintenance_request',
  inspection: 'rental_inspection',
})

const ROLE_ENTITY_RULES = Object.freeze({
  [RENTAL_PARTY_ROLES.landlord]: new Set([RENTAL_PARTY_RELATIONSHIP_ENTITIES.property]),
  [RENTAL_PARTY_ROLES.applicant]: new Set([RENTAL_PARTY_RELATIONSHIP_ENTITIES.application]),
  [RENTAL_PARTY_ROLES.tenant]: new Set([RENTAL_PARTY_RELATIONSHIP_ENTITIES.tenancy]),
  [RENTAL_PARTY_ROLES.contractor]: new Set([
    RENTAL_PARTY_RELATIONSHIP_ENTITIES.maintenanceRequest,
    RENTAL_PARTY_RELATIONSHIP_ENTITIES.inspection,
  ]),
})

export const RENTAL_PARTY_RLS_ENTITY_CONTRACTS = Object.freeze([
  'rental_party_relationships',
  'rental_party_workflow_snapshots',
])

function text(value) {
  return String(value ?? '').trim()
}

function requireText(value, label) {
  const result = text(value)
  if (!result) throw new Error(`${label} is required.`)
  return result
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function immutable(value) {
  const cloned = clone(value)
  const freeze = (item) => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item
    Object.values(item).forEach(freeze)
    return Object.freeze(item)
  }
  return freeze(cloned)
}

export function canAttachRentalPartyRole({ role = '', entityType = '' } = {}) {
  return ROLE_ENTITY_RULES[text(role)]?.has(text(entityType)) === true
}

export function buildRentalPartyRelationshipKey({ organisationId = '', partyId = '', role = '', entityType = '', entityId = '' } = {}) {
  return [organisationId, partyId, role, entityType, entityId].map(text).join(':')
}

/** Links a canonical CRM party; never copies it into a Rentals-owned contact table. */
export function createRentalPartyRelationship({
  organisationId = '', branchId = '', partyId = '', role = '', entityType = '', entityId = '',
  relationshipStatus = 'active', primaryContact = false, createdBy = '', metadata = {},
} = {}) {
  const normalizedRole = requireText(role, 'Rental party role')
  const normalizedEntityType = requireText(entityType, 'Rental relationship entity type')
  if (!canAttachRentalPartyRole({ role: normalizedRole, entityType: normalizedEntityType })) {
    throw new Error(`Rental party role ${normalizedRole} cannot be attached to ${normalizedEntityType}.`)
  }
  const relationship = {
    contractVersion: RENTAL_PARTY_RELATIONSHIP_CONTRACT_VERSION,
    organisationId: requireText(organisationId, 'Organisation id'),
    branchId: text(branchId) || null,
    partyId: requireText(partyId, 'Canonical party id'),
    role: normalizedRole,
    entityType: normalizedEntityType,
    entityId: requireText(entityId, 'Rental entity id'),
    relationshipStatus: text(relationshipStatus) || 'active',
    primaryContact: Boolean(primaryContact),
    createdBy: text(createdBy) || null,
    metadata: object(metadata),
  }
  return { ...relationship, relationshipKey: buildRentalPartyRelationshipKey(relationship) }
}

export function assertNoDuplicateActiveRentalPartyRelationship(existingRelationships = [], candidate = {}) {
  const key = candidate.relationshipKey || buildRentalPartyRelationshipKey(candidate)
  const duplicate = (Array.isArray(existingRelationships) ? existingRelationships : []).find((relationship) => (
    text(relationship?.relationshipStatus || 'active') === 'active' &&
    (relationship?.relationshipKey || buildRentalPartyRelationshipKey(relationship)) === key
  ))
  if (duplicate) throw new Error('An active relationship already exists for this canonical party, role and rental entity.')
  return true
}

/**
 * Captures submission/signing evidence once. It is intentionally detached from
 * the mutable CRM record, so later profile edits cannot rewrite workflow truth.
 */
export function createRentalPartyWorkflowSnapshot({ relationship = {}, party = {}, capturedAt = new Date(), sourceRevision = '' } = {}) {
  const linkedPartyId = requireText(relationship.partyId, 'Relationship canonical party id')
  const canonicalPartyId = requireText(party.id || party.partyId || party.contactId, 'Canonical party id')
  if (linkedPartyId !== canonicalPartyId) throw new Error('Snapshot party must match the relationship canonical party.')
  const relationshipOrganisationId = requireText(relationship.organisationId, 'Relationship organisation id')
  const partyOrganisationId = text(party.organisationId || party.organisation_id)
  if (partyOrganisationId && partyOrganisationId !== relationshipOrganisationId) {
    throw new Error('Snapshot party must belong to the relationship organisation.')
  }
  const date = capturedAt instanceof Date ? capturedAt : new Date(capturedAt)
  if (Number.isNaN(date.getTime())) throw new Error('Snapshot capture time must be valid.')
  return immutable({
    contractVersion: RENTAL_PARTY_RELATIONSHIP_CONTRACT_VERSION,
    organisationId: relationshipOrganisationId,
    branchId: text(relationship.branchId) || null,
    partyId: canonicalPartyId,
    role: requireText(relationship.role, 'Relationship role'),
    entityType: requireText(relationship.entityType, 'Relationship entity type'),
    entityId: requireText(relationship.entityId, 'Relationship entity id'),
    relationshipKey: relationship.relationshipKey || buildRentalPartyRelationshipKey(relationship),
    sourceRevision: text(sourceRevision || party.updatedAt || party.updated_at) || null,
    capturedAt: date.toISOString(),
    identity: {
      displayName: text(party.displayName || party.name || party.fullName),
      partyType: text(party.partyType || party.type) || 'person',
      legalName: text(party.legalName) || null,
    },
    contact: {
      email: text(party.email) || null,
      phone: text(party.phone) || null,
    },
  })
}

export function buildRentalPartyRlsContract(tableName = '') {
  if (!RENTAL_PARTY_RLS_ENTITY_CONTRACTS.includes(tableName)) return null
  return {
    tableName,
    exposedSchema: 'public',
    requiredColumns: ['organisation_id', 'branch_id', 'party_id', 'created_by', 'created_at'],
    rules: [
      'Enable RLS and revoke default anon/authenticated grants in the same migration.',
      'Use TO authenticated plus organisation, branch and assigned-user predicates; party_id alone is never sufficient access control.',
      'Snapshots are insert-only workflow evidence; do not permit browser updates or deletes.',
      'Use USING and WITH CHECK for relationship updates and add explicit SQL allow/deny tests.',
      'Do not read user_metadata or use SECURITY DEFINER to bypass party access rules.',
    ],
  }
}
