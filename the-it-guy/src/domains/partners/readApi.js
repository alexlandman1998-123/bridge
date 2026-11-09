// Developer partner workspace reads; invitation and routing mutations remain in their owners.
import { normalizeNullableUuid, requireClient, isMissingTableError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'

export function normalizeDeveloperPartnerType(value = '') {
  const normalized = normalizeTextValue(value).toLowerCase()
  if (normalized === 'attorney' || normalized === 'attorney_firm' || normalized === 'transfer_attorney')
    return 'transfer_attorney'
  if (normalized === 'bond' || normalized === 'bond_originator') return 'bond_originator'
  if (normalized === 'agent' || normalized === 'agency' || normalized === 'selling_agent') return 'agency'
  return normalized || 'agency'
}

export function getDeveloperPartnerTypeLabel(value = '') {
  const normalized = normalizeDeveloperPartnerType(value)
  if (normalized === 'transfer_attorney') return 'Transfer Attorney'
  if (normalized === 'bond_originator') return 'Bond Originator'
  return 'Agency / Selling Agent'
}

export function getDeveloperPartnerAgreementLabel(value = '') {
  const normalized = normalizeTextValue(value).toLowerCase()
  if (normalized === 'transfer_attorney_sla') return 'Transfer Attorney SLA'
  if (normalized === 'bond_originator_sla') return 'Bond Originator SLA'
  if (normalized === 'agency_mandate') return 'Agency Mandate'
  return 'Agreement'
}

export function normalizeDeveloperPartnerOrganisation(row = null) {
  if (!row || typeof row !== 'object') return null
  const name = normalizeTextValue(row.display_name || row.displayName || row.legal_name || row.legalName || row.name)
  return {
    id: normalizeTextValue(row.id),
    name: name || 'Partner organisation',
    displayName: name || 'Partner organisation',
    legalName: normalizeTextValue(row.legal_name || row.legalName),
    type: normalizeTextValue(row.type || row.workspace_type || row.workspaceType),
    logoUrl: normalizeTextValue(row.logo_url || row.logoUrl),
    status: normalizeTextValue(row.status),
  }
}

export function normalizeDeveloperPartnerAgreementTerm(row = null) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeTextValue(row.id),
    agreementId: normalizeTextValue(row.agreement_id || row.agreementId),
    termsJson: row.terms_json && typeof row.terms_json === 'object' ? row.terms_json : {},
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function normalizeDeveloperPartnerAgreement(row = null, termsByAgreementId = new Map()) {
  if (!row || typeof row !== 'object') return null
  const agreementType = normalizeTextValue(row.agreement_type || row.agreementType)
  const status = normalizeTextValue(row.status) || 'draft'
  const id = normalizeTextValue(row.id)
  return {
    id,
    relationshipId: normalizeTextValue(row.relationship_id || row.relationshipId),
    agreementType,
    agreementLabel: getDeveloperPartnerAgreementLabel(agreementType),
    status,
    templateKey: normalizeTextValue(row.template_key || row.templateKey),
    generatedDocumentId: normalizeTextValue(row.generated_document_id || row.generatedDocumentId),
    packetId: normalizeTextValue(row.packet_id || row.packetId),
    effectiveDate: row.effective_date || row.effectiveDate || null,
    expiryDate: row.expiry_date || row.expiryDate || null,
    signedAt: row.signed_at || row.signedAt || null,
    terminatedAt: row.terminated_at || row.terminatedAt || null,
    waivedAt: row.waived_at || row.waivedAt || null,
    metadataJson: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {},
    createdBy: normalizeTextValue(row.created_by || row.createdBy),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    terms: termsByAgreementId.get(id) || null,
  }
}

export function normalizeDeveloperPartnerRelationship(
  row = null,
  organisationsById = new Map(),
  agreementsByRelationshipId = new Map(),
) {
  if (!row || typeof row !== 'object') return null
  const partnerType = normalizeDeveloperPartnerType(row.partner_type || row.partnerType)
  const partnerOrganisationId = normalizeTextValue(row.partner_organisation_id || row.partnerOrganisationId)
  const organisation = organisationsById.get(partnerOrganisationId) || null
  const displayName = normalizeTextValue(row.partner_display_name || row.partnerDisplayName)
  const invitationEmail = normalizeTextValue(row.partner_invitation_email || row.partnerInvitationEmail)
  const agreements = agreementsByRelationshipId.get(normalizeTextValue(row.id)) || []
  const activeAgreement =
    agreements.find((agreement) => agreement.status === 'active' || agreement.status === 'signed') ||
    agreements[0] ||
    null
  return {
    id: normalizeTextValue(row.id),
    developerOrganisationId: normalizeTextValue(row.developer_organisation_id || row.developerOrganisationId),
    partnerOrganisationId,
    partnerOrganisation: organisation,
    partnerType,
    partnerTypeLabel: getDeveloperPartnerTypeLabel(partnerType),
    partnerName: organisation?.displayName || displayName || invitationEmail || 'Unnamed partner',
    partnerInvitationEmail: invitationEmail,
    status: normalizeTextValue(row.status) || 'invited',
    scopeType: normalizeTextValue(row.scope_type || row.scopeType) || 'all_developments',
    scopeJson: row.scope_json && typeof row.scope_json === 'object' ? row.scope_json : {},
    invitedBy: normalizeTextValue(row.invited_by || row.invitedBy),
    invitedAt: row.invited_at || row.invitedAt || null,
    acceptedBy: normalizeTextValue(row.accepted_by || row.acceptedBy),
    acceptedAt: row.accepted_at || row.acceptedAt || null,
    suspendedAt: row.suspended_at || row.suspendedAt || null,
    archivedAt: row.archived_at || row.archivedAt || null,
    metadataJson: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {},
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
    agreements,
    activeAgreement,
    agreementStatus: activeAgreement?.status || 'not_started',
  }
}

export function buildDeveloperPartnerMetrics(relationships = [], agreements = []) {
  const byPartnerType = relationships.reduce(
    (accumulator, relationship) => {
      const key = normalizeDeveloperPartnerType(relationship.partnerType)
      accumulator[key] = (accumulator[key] || 0) + 1
      return accumulator
    },
    { agency: 0, transfer_attorney: 0, bond_originator: 0 },
  )

  const activeStatuses = new Set(['agreement_active', 'accepted'])
  const pendingAgreementStatuses = new Set(['agreement_pending', 'accepted'])
  return {
    total: relationships.length,
    active: relationships.filter((relationship) => activeStatuses.has(relationship.status)).length,
    pendingInvites: relationships.filter((relationship) => relationship.status === 'invited').length,
    agreementPending: relationships.filter(
      (relationship) => pendingAgreementStatuses.has(relationship.status) && relationship.agreementStatus !== 'active',
    ).length,
    suspended: relationships.filter((relationship) => relationship.status === 'suspended').length,
    activeAgreements: agreements.filter((agreement) => agreement.status === 'active' || agreement.status === 'signed')
      .length,
    byPartnerType,
  }
}

export function buildEmptyDeveloperPartnersWorkspace(schemaReady = true) {
  return {
    schemaReady,
    relationships: [],
    agreements: [],
    terms: [],
    defaults: [],
    metrics: buildDeveloperPartnerMetrics([], []),
  }
}

export const DEVELOPER_PARTNER_PREFERRED_SELECT =
  'id, organisation_id, partner_type, developer_partner_relationship_id, partner_organisation_id, source, scope_type, scope_json, company_name, contact_person, email_address, phone_number, website, physical_address, province, notes, is_active, is_preferred_default, created_at, updated_at'

export const DEVELOPER_PARTNER_PREFERRED_LEGACY_SELECT =
  'id, organisation_id, partner_type, company_name, contact_person, email_address, phone_number, website, physical_address, province, notes, is_active, is_preferred_default, created_at, updated_at'

export function normalizeDeveloperPartnerDefaultRow(row = null) {
  if (!row || typeof row !== 'object') return null
  const partnerType = normalizeTextValue(row.partner_type || row.partnerType)
  return {
    id: normalizeTextValue(row.id),
    organisationId: normalizeTextValue(row.organisation_id || row.organisationId),
    partnerType,
    relationshipId: normalizeTextValue(row.developer_partner_relationship_id || row.developerPartnerRelationshipId),
    partnerOrganisationId: normalizeTextValue(row.partner_organisation_id || row.partnerOrganisationId),
    source: normalizeTextValue(row.source) || 'manual',
    scopeType: normalizeDeveloperPartnerScopeType(row.scope_type || row.scopeType),
    scopeJson:
      row.scope_json && typeof row.scope_json === 'object'
        ? row.scope_json
        : row.scopeJson && typeof row.scopeJson === 'object'
          ? row.scopeJson
          : {},
    companyName: normalizeTextValue(row.company_name || row.companyName),
    contactPerson: normalizeTextValue(row.contact_person || row.contactPerson),
    email: normalizeEmailAddress(row.email_address || row.email),
    phone: normalizeTextValue(row.phone_number || row.phone),
    website: normalizeTextValue(row.website),
    physicalAddress: normalizeTextValue(row.physical_address || row.physicalAddress),
    province: normalizeTextValue(row.province),
    notes: normalizeTextValue(row.notes),
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
    isPreferredDefault: Boolean(row.is_preferred_default || row.isPreferredDefault),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

export function normalizeDeveloperPartnerScopeType(value = '') {
  const normalized = normalizeTextValue(value).toLowerCase()
  if (['specific_developments', 'specific_phases', 'specific_units'].includes(normalized)) return normalized
  return 'all_developments'
}

export async function fetchDeveloperPartnersWorkspace({ organisationId } = {}) {
  const developerOrganisationId = normalizeNullableUuid(organisationId)
  if (!developerOrganisationId) return buildEmptyDeveloperPartnersWorkspace()

  const client = requireClient()
  let relationshipsQuery = client
    .from('developer_partner_relationships')
    .select(
      'id, developer_organisation_id, partner_organisation_id, partner_type, status, scope_type, scope_json, partner_display_name, partner_invitation_email, invited_by, invited_at, accepted_by, accepted_at, suspended_at, archived_at, metadata_json, created_at, updated_at',
    )
    .eq('developer_organisation_id', developerOrganisationId)
    .order('updated_at', { ascending: false })

  const relationshipsResult = await relationshipsQuery
  if (relationshipsResult.error) {
    if (
      isMissingTableError(relationshipsResult.error, 'developer_partner_relationships') ||
      isMissingSchemaError(relationshipsResult.error) ||
      isPermissionDeniedError(relationshipsResult.error)
    ) {
      return buildEmptyDeveloperPartnersWorkspace(false)
    }
    throw relationshipsResult.error
  }

  const relationshipRows = Array.isArray(relationshipsResult.data) ? relationshipsResult.data : []
  const relationshipIds = relationshipRows.map((row) => normalizeTextValue(row.id)).filter(Boolean)
  const partnerOrganisationIds = [
    ...new Set(relationshipRows.map((row) => normalizeNullableUuid(row.partner_organisation_id)).filter(Boolean)),
  ]

  let organisationsById = new Map()
  if (partnerOrganisationIds.length) {
    let organisationsResult = await client
      .from('organisations')
      .select('id, name, display_name, legal_name, type, logo_url, status')
      .in('id', partnerOrganisationIds)

    if (organisationsResult.error && isMissingColumnError(organisationsResult.error)) {
      organisationsResult = await client.from('organisations').select('id, name, type').in('id', partnerOrganisationIds)
    }

    if (organisationsResult.error && !isPermissionDeniedError(organisationsResult.error)) {
      throw organisationsResult.error
    }

    organisationsById = new Map(
      (Array.isArray(organisationsResult.data) ? organisationsResult.data : [])
        .map((row) => normalizeDeveloperPartnerOrganisation(row))
        .filter(Boolean)
        .map((organisation) => [organisation.id, organisation]),
    )
  }

  let agreementRows = []
  if (relationshipIds.length) {
    const agreementsResult = await client
      .from('developer_partner_agreements')
      .select(
        'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
      )
      .in('relationship_id', relationshipIds)
      .order('updated_at', { ascending: false })

    if (agreementsResult.error) {
      if (
        !isMissingTableError(agreementsResult.error, 'developer_partner_agreements') &&
        !isMissingSchemaError(agreementsResult.error) &&
        !isPermissionDeniedError(agreementsResult.error)
      ) {
        throw agreementsResult.error
      }
    } else {
      agreementRows = Array.isArray(agreementsResult.data) ? agreementsResult.data : []
    }
  }

  const agreementIds = agreementRows.map((row) => normalizeTextValue(row.id)).filter(Boolean)
  let termRows = []
  if (agreementIds.length) {
    const termsResult = await client
      .from('developer_partner_agreement_terms')
      .select('id, agreement_id, terms_json, created_at, updated_at')
      .in('agreement_id', agreementIds)

    if (termsResult.error) {
      if (
        !isMissingTableError(termsResult.error, 'developer_partner_agreement_terms') &&
        !isMissingSchemaError(termsResult.error) &&
        !isPermissionDeniedError(termsResult.error)
      ) {
        throw termsResult.error
      }
    } else {
      termRows = Array.isArray(termsResult.data) ? termsResult.data : []
    }
  }

  const terms = termRows.map((row) => normalizeDeveloperPartnerAgreementTerm(row)).filter(Boolean)
  const termsByAgreementId = new Map(terms.map((term) => [term.agreementId, term]))
  const agreements = agreementRows
    .map((row) => normalizeDeveloperPartnerAgreement(row, termsByAgreementId))
    .filter(Boolean)
  const agreementsByRelationshipId = agreements.reduce((accumulator, agreement) => {
    const next = accumulator.get(agreement.relationshipId) || []
    next.push(agreement)
    accumulator.set(agreement.relationshipId, next)
    return accumulator
  }, new Map())
  const relationships = relationshipRows
    .map((row) => normalizeDeveloperPartnerRelationship(row, organisationsById, agreementsByRelationshipId))
    .filter(Boolean)

  let defaultRows = []
  let defaultsResult = await client
    .from('organisation_preferred_partners')
    .select(DEVELOPER_PARTNER_PREFERRED_SELECT)
    .eq('organisation_id', developerOrganisationId)
    .in('partner_type', ['agency', 'transfer_attorney', 'bond_originator'])
    .order('is_preferred_default', { ascending: false })
    .order('company_name', { ascending: true })

  if (
    defaultsResult.error &&
    ['developer_partner_relationship_id', 'partner_organisation_id', 'source', 'scope_type', 'scope_json'].some(
      (column) => isMissingColumnError(defaultsResult.error, column),
    )
  ) {
    defaultsResult = await client
      .from('organisation_preferred_partners')
      .select(DEVELOPER_PARTNER_PREFERRED_LEGACY_SELECT)
      .eq('organisation_id', developerOrganisationId)
      .in('partner_type', ['transfer_attorney', 'bond_originator'])
      .order('is_preferred_default', { ascending: false })
      .order('company_name', { ascending: true })
  }

  if (defaultsResult.error) {
    if (
      !isMissingTableError(defaultsResult.error, 'organisation_preferred_partners') &&
      !isMissingSchemaError(defaultsResult.error) &&
      !isPermissionDeniedError(defaultsResult.error)
    ) {
      throw defaultsResult.error
    }
  } else {
    defaultRows = Array.isArray(defaultsResult.data) ? defaultsResult.data : []
  }

  return {
    schemaReady: true,
    relationships,
    agreements,
    terms,
    defaults: defaultRows.map((row) => normalizeDeveloperPartnerDefaultRow(row)).filter(Boolean),
    metrics: buildDeveloperPartnerMetrics(relationships, agreements),
  }
}
