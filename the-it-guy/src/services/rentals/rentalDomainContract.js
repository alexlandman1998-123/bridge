export const RENTAL_DOMAIN_CONTRACT_VERSION = 'arch9_rental_domain_contract_v1'

export const RENTAL_DOMAIN_ENTITIES = Object.freeze({
  party: {
    owner: 'platform_crm',
    purpose: 'Canonical person or organisation record reused for landlord, applicant, tenant and contractor roles.',
  },
  portfolio: {
    owner: 'rentals',
    purpose: 'Managed group of rental properties.',
  },
  property: {
    owner: 'rentals',
    purpose: 'Managed physical property, independent of a marketing listing.',
  },
  unit: {
    owner: 'rentals',
    purpose: 'The rentable object within a property; a house is represented as a single unit.',
  },
  vacancy: {
    owner: 'rentals',
    purpose: 'A period in which a unit is available or becoming available.',
  },
  listing: {
    owner: 'shared_listings',
    purpose: 'Marketing projection of a rental vacancy; never the source of truth for occupancy or tenancy.',
  },
  application: {
    owner: 'rentals',
    purpose: 'Versioned applicant submission for a vacancy, with immutable submission evidence.',
  },
  screening: {
    owner: 'rentals',
    purpose: 'Manual or provider-backed verification evidence; it can inform but never make a final approval decision.',
  },
  lease: {
    owner: 'rentals',
    purpose: 'Versioned legal agreement and terms for a tenancy.',
  },
  tenancy: {
    owner: 'rentals',
    purpose: 'Operational occupation relationship between a unit and one or more tenant parties.',
  },
  charge: {
    owner: 'rentals',
    purpose: 'Amount due under a tenancy; introduced only in the collections phase.',
  },
  payment: {
    owner: 'rentals',
    purpose: 'Append-only received-money record; introduced only in the collections phase.',
  },
  maintenance_request: {
    owner: 'rentals',
    purpose: 'Operational repair or maintenance workflow against a property, unit or tenancy.',
  },
  inspection: {
    owner: 'rentals',
    purpose: 'Incoming, routine or outgoing condition report.',
  },
  renewal: {
    owner: 'rentals',
    purpose: 'Expiry and renewal decision workflow for an active tenancy.',
  },
  notice: {
    owner: 'rentals',
    purpose: 'Recorded tenant or landlord intent to end a tenancy.',
  },
})

export const RENTAL_SHARED_INFRASTRUCTURE = Object.freeze({
  crm: 'Reuse canonical contacts/clients and add rental roles/relationships; do not create a second CRM.',
  documents: 'Reuse shared document storage and requirements through typed rental entity links.',
  activity: 'Reuse shared activity delivery through rental event adapters.',
  notifications: 'Reuse shared delivery, preferences and templates through rental event types.',
  appointments: 'Reuse shared appointments for viewings, inspections and maintenance visits.',
  permissions: 'Reuse the platform permission engine, but add rental-specific capabilities in Phase 3.',
  listing_distribution: 'Reuse shared listing/media/syndication only as a vacancy marketing projection.',
})

export const RENTAL_BOUNDARY_RULES = Object.freeze([
  'Property and Unit are canonical rental inventory; Listing is only a marketing projection.',
  'A Vacancy belongs to exactly one Unit; a Unit may have at most one open Vacancy.',
  'A submitted Application belongs to one Vacancy and references a canonical applicant Party.',
  'Approval is always an explicit human decision; screening results cannot approve or decline an Application on their own.',
  'Lease is the agreement; Tenancy is the operational relationship. They are never interchangeable.',
  'A Unit may have at most one active Tenancy at a time.',
  'A close-tenancy action may create a new Vacancy, but must never overwrite Tenancy history.',
  'Charges and Payments are append-only financial records and are out of scope until the collections phase.',
  'Short-term bookings and stays must use separate future workflows; they must not reuse Tenancy states.',
  'Sales records, status enums and default queries are never repurposed for Rentals.',
])

export const RENTAL_STATUS = Object.freeze({
  unit: Object.freeze(['vacant', 'marketing', 'application_pending', 'lease_pending', 'occupied', 'notice_given', 'maintenance_hold']),
  vacancy: Object.freeze(['draft', 'marketing', 'enquiries', 'applications', 'tenant_selected', 'lease_pending', 'filled', 'cancelled']),
  application: Object.freeze(['started', 'incomplete', 'submitted', 'screening', 'ready_for_review', 'approved', 'declined', 'withdrawn']),
  screening: Object.freeze(['not_started', 'pending', 'complete', 'failed', 'needs_review']),
  lease: Object.freeze(['draft', 'awaiting_tenant', 'awaiting_landlord', 'signed', 'active', 'cancelled', 'superseded']),
  tenancy: Object.freeze(['draft', 'move_in_pending', 'active', 'notice_given', 'move_out_pending', 'closed']),
  renewal: Object.freeze(['not_started', 'intention_requested', 'negotiating', 'accepted', 'declined', 'expired']),
  notice: Object.freeze(['draft', 'received', 'acknowledged', 'withdrawn', 'completed']),
})

const transitions = Object.freeze({
  vacancy: Object.freeze({
    draft: ['marketing', 'cancelled'],
    marketing: ['enquiries', 'applications', 'cancelled'],
    enquiries: ['applications', 'tenant_selected', 'cancelled'],
    applications: ['tenant_selected', 'marketing', 'cancelled'],
    tenant_selected: ['lease_pending', 'applications', 'cancelled'],
    lease_pending: ['filled', 'applications', 'cancelled'],
    filled: [],
    cancelled: [],
  }),
  application: Object.freeze({
    started: ['incomplete', 'submitted', 'withdrawn'],
    incomplete: ['submitted', 'withdrawn'],
    submitted: ['screening', 'withdrawn'],
    screening: ['ready_for_review', 'incomplete', 'withdrawn'],
    ready_for_review: ['approved', 'declined', 'incomplete', 'withdrawn'],
    approved: [],
    declined: [],
    withdrawn: [],
  }),
  lease: Object.freeze({
    draft: ['awaiting_tenant', 'awaiting_landlord', 'cancelled'],
    awaiting_tenant: ['awaiting_landlord', 'signed', 'cancelled'],
    awaiting_landlord: ['awaiting_tenant', 'signed', 'cancelled'],
    signed: ['active', 'cancelled'],
    active: ['superseded'],
    cancelled: [],
    superseded: [],
  }),
  tenancy: Object.freeze({
    draft: ['move_in_pending', 'closed'],
    move_in_pending: ['active', 'closed'],
    active: ['notice_given', 'move_out_pending'],
    notice_given: ['move_out_pending'],
    move_out_pending: ['closed'],
    closed: [],
  }),
})

export const RENTAL_COMMAND_CATALOG = Object.freeze([
  { key: 'create_portfolio', phase: 7, aggregate: 'portfolio' },
  { key: 'create_property', phase: 7, aggregate: 'property' },
  { key: 'create_unit', phase: 8, aggregate: 'unit' },
  { key: 'create_vacancy', phase: 12, aggregate: 'vacancy' },
  { key: 'project_vacancy_to_listing', phase: 13, aggregate: 'vacancy' },
  { key: 'submit_rental_application', phase: 25, aggregate: 'application' },
  { key: 'record_screening_result', phase: 27, aggregate: 'application' },
  { key: 'approve_rental_application', phase: 28, aggregate: 'application', humanDecisionRequired: true },
  { key: 'decline_rental_application', phase: 28, aggregate: 'application', humanDecisionRequired: true },
  { key: 'create_tenancy_from_application', phase: 29, aggregate: 'tenancy', transactional: true, idempotent: true },
  { key: 'activate_tenancy', phase: 34, aggregate: 'tenancy', transactional: true, idempotent: true },
  { key: 'generate_monthly_charges', phase: 37, aggregate: 'charge', idempotent: true },
  { key: 'record_payment', phase: 38, aggregate: 'payment' },
  { key: 'allocate_payment', phase: 39, aggregate: 'payment', transactional: true, idempotent: true },
  { key: 'close_tenancy_and_create_vacancy', phase: 61, aggregate: 'tenancy', transactional: true, idempotent: true },
])

export function canTransitionRentalStatus(aggregate, fromStatus, toStatus) {
  if (fromStatus === toStatus) return true
  return transitions[aggregate]?.[fromStatus]?.includes(toStatus) === true
}

export function assertRentalStatusTransition(aggregate, fromStatus, toStatus) {
  if (canTransitionRentalStatus(aggregate, fromStatus, toStatus)) return
  throw new Error(`Invalid ${aggregate} transition: ${fromStatus} → ${toStatus}`)
}

export function getRentalCommandContract(commandKey) {
  return RENTAL_COMMAND_CATALOG.find((command) => command.key === commandKey) || null
}
