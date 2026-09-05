export const RENTAL_CRM_LEAD_MODEL_VERSION = 'arch9_rental_crm_lead_model_v1'

export const RENTAL_LEAD_TYPES = Object.freeze(['rental'])
export const RENTAL_LEAD_ROLES = Object.freeze(['tenant', 'landlord'])
export const RENTAL_LEAD_RELATIONSHIP_KEYS = Object.freeze([
  'portfolioId',
  'propertyId',
  'unitId',
  'vacancyId',
  'mandateId',
  'applicationId',
  'tenancyId',
  'listingId',
])
export const RENTAL_LEAD_CONSENT_KEYS = Object.freeze(['privacy', 'marketing', 'screening'])

const text = (value) => String(value ?? '').trim()
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function normaliseRole(value = '') {
  const role = text(value).toLowerCase()
  return ['landlord', 'owner', 'lessor'].includes(role) ? 'landlord' : 'tenant'
}

function normaliseStage(value = '') {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_') || 'new'
}

function normaliseRelationships(values = {}) {
  const source = object(values)
  return Object.fromEntries(RENTAL_LEAD_RELATIONSHIP_KEYS.map((key) => [key, text(source[key] || source[key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)]) || null]))
}

function normaliseConsents(values = {}) {
  const source = object(values)
  return Object.fromEntries(RENTAL_LEAD_CONSENT_KEYS.map((key) => {
    const value = source[key]
    return [key, value === true ? 'granted' : value === false ? 'declined' : text(value).toLowerCase() || 'not_captured']
  }))
}

function sourceMetadata(lead = {}) {
  const raw = object(lead.rawEnquiryPayload || lead.raw_enquiry_payload || lead.raw || lead.metadata || lead)
  return object(raw.rentalCrm || raw.rental_crm || raw)
}

/**
 * Creates the versioned metadata envelope stored in the shared CRM lead's
 * raw enquiry payload until a dedicated, migrated rental-lead projection is introduced.
 */
export function createRentalCrmLeadMetadata({
  leadId = '',
  organisationId = '',
  role = 'tenant',
  stage = 'new',
  source = '',
  campaign = '',
  branchId = '',
  assignedAgentId = '',
  relationships = {},
  consents = {},
  qualification = {},
  ingestion = {},
  legacy = {},
} = {}) {
  if (!text(organisationId)) throw new Error('Organisation is required for a rental CRM lead.')

  return {
    version: RENTAL_CRM_LEAD_MODEL_VERSION,
    arch9RentalLead: true,
    classification: 'rental',
    leadType: 'rental',
    role: normaliseRole(role),
    stage: normaliseStage(stage),
    leadId: text(leadId) || null,
    organisationId: text(organisationId),
    branchId: text(branchId) || null,
    assignedAgentId: text(assignedAgentId) || null,
    source: text(source) || 'manual',
    campaign: text(campaign) || null,
    relationships: normaliseRelationships(relationships),
    consents: normaliseConsents(consents),
    qualification: object(qualification),
    ingestion: object(ingestion),
    ...object(legacy),
  }
}

export function getRentalCrmLeadMetadata(lead = {}) {
  const raw = sourceMetadata(lead)
  const relationshipSource = object(raw.relationships || raw.relationship_refs || raw)
  const consentSource = object(raw.consents || raw.consent)
  const metadata = createRentalCrmLeadMetadata({
    leadId: raw.leadId || raw.lead_id || lead.leadId || lead.lead_id,
    organisationId: raw.organisationId || raw.organisation_id || lead.organisationId || lead.organisation_id || 'legacy-unscoped',
    role: raw.role || raw.rentalRole || raw.rental_role || lead.rentalLeadRole || lead.rental_lead_role,
    stage: raw.stage || raw.rentalStage || raw.rental_stage || lead.rentalStage || lead.rental_stage || lead.stage,
    source: raw.source || raw.leadSource || lead.leadSource || lead.lead_source,
    campaign: raw.campaign || raw.campaignName || raw.campaign_name,
    branchId: raw.branchId || raw.branch_id || lead.branchId || lead.branch_id,
    assignedAgentId: raw.assignedAgentId || raw.assigned_agent_id || lead.assignedAgentId || lead.assigned_agent_id,
    relationships: relationshipSource,
    consents: consentSource,
    qualification: raw.qualification,
    ingestion: raw.ingestion,
    legacy: raw,
  })

  return {
    ...metadata,
    isLegacyUnscoped: metadata.organisationId === 'legacy-unscoped',
  }
}

export function isRentalCrmLead(lead = {}) {
  const raw = sourceMetadata(lead)
  return raw.arch9RentalLead === true
    || text(raw.classification).toLowerCase() === 'rental'
    || text(raw.leadType || raw.lead_type).toLowerCase() === 'rental'
}

export function patchRentalCrmLeadMetadata(lead = {}, patch = {}) {
  const current = getRentalCrmLeadMetadata(lead)
  const update = object(patch)
  return createRentalCrmLeadMetadata({
    ...current,
    ...update,
    relationships: { ...current.relationships, ...object(update.relationships) },
    consents: { ...current.consents, ...object(update.consents) },
    qualification: { ...current.qualification, ...object(update.qualification) },
    ingestion: { ...current.ingestion, ...object(update.ingestion) },
    legacy: {
      ...current,
      ...update,
      relationships: { ...current.relationships, ...object(update.relationships) },
      consents: { ...current.consents, ...object(update.consents) },
      qualification: { ...current.qualification, ...object(update.qualification) },
      ingestion: { ...current.ingestion, ...object(update.ingestion) },
    },
  })
}
