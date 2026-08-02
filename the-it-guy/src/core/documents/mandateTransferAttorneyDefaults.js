function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function firstBoolean(...values) {
  for (const value of values) {
    if (value === true) return true
    if (value === false) return false
    const key = normalizeKey(value)
    if (['true', 'yes', '1'].includes(key)) return true
    if (['false', 'no', '0'].includes(key)) return false
  }
  return false
}

function collectAttorneyCandidates(source = {}) {
  const record = asRecord(source)
  if (!Object.keys(record).length) return []
  return [
    record.preferredTransferAttorney,
    record.preferred_transfer_attorney,
    record.transferAttorney,
    record.transfer_attorney,
    record.transferAttorneySnapshot,
    record.transfer_attorney_snapshot,
    record,
  ].map(asRecord).filter((candidate) => Object.keys(candidate).length)
}

export function resolveMandateTransferAttorneySnapshot(...sources) {
  const candidates = sources.flatMap(collectAttorneyCandidates)
  const preferredPartnerId = firstText(
    ...candidates.map((source) => firstText(
      source.preferredPartnerId,
      source.transferAttorneyPreferredPartnerId,
      source.preferred_partner_id,
      source.transfer_attorney_preferred_partner_id,
      source.partnerRelationshipId,
      source.partner_relationship_id,
      source.partnerId,
      source.partner_id,
      source.id,
    )),
  )
  const companyName = firstText(
    ...candidates.map((source) => firstText(
      source.companyName,
      source.transferAttorneyCompanyName,
      source.company_name,
      source.transfer_attorney_company_name,
      source.partnerName,
      source.partner_name,
      source.organisationName,
      source.organisation_name,
      source.organizationName,
      source.organization_name,
      source.firmName,
      source.firm_name,
      source.name,
      source.nominatedTransferAttorneyName,
      source.nominated_transfer_attorney_name,
      source.nominatedTransferAttorney,
    )),
  )

  return {
    preferredPartnerId,
    partnerRelationshipId: firstText(
      ...candidates.map((source) => firstText(
        source.partnerRelationshipId,
        source.partner_relationship_id,
        source.transferAttorneyPartnerRelationshipId,
        source.transfer_attorney_partner_relationship_id,
        source.relationshipId,
        source.relationship_id,
        source.preferredPartnerId,
        source.preferred_partner_id,
      )),
    ),
    partnerOrganisationId: firstText(
      ...candidates.map((source) => firstText(
        source.partnerOrganisationId,
        source.transferAttorneyPartnerOrganisationId,
        source.partner_organisation_id,
        source.transfer_attorney_partner_organisation_id,
        source.partnerOrganizationId,
        source.transferAttorneyPartnerOrganizationId,
        source.partner_organization_id,
        source.organisationId,
        source.organisation_id,
        source.organizationId,
        source.organization_id,
      )),
    ),
    companyName,
    contactPerson: firstText(
      ...candidates.map((source) => firstText(
        source.contactPerson,
        source.transferAttorneyContactPerson,
        source.contact_person,
        source.transfer_attorney_contact_person,
        source.contactName,
        source.contact_name,
        source.primaryContactName,
        source.primary_contact_name,
        source.nominatedTransferAttorneyContactPerson,
        source.nominated_transfer_attorney_contact_person,
        source.nominatedTransferAttorneyName,
        source.nominated_transfer_attorney_name,
      )),
      companyName,
    ),
    email: firstText(
      ...candidates.map((source) => firstText(
        source.email,
        source.transferAttorneyEmail,
        source.emailAddress,
        source.email_address,
        source.nominatedTransferAttorneyEmail,
        source.nominated_transfer_attorney_email,
      )),
    ).toLowerCase(),
    phone: firstText(
      ...candidates.map((source) => firstText(
        source.phone,
        source.transferAttorneyPhone,
        source.phoneNumber,
        source.phone_number,
        source.telephone,
        source.mobile,
        source.nominatedTransferAttorneyPhone,
        source.nominated_transfer_attorney_phone,
      )),
    ),
    selectionSource: firstText(
      ...candidates.map((source) => firstText(
        source.selectionSource,
        source.transferAttorneySelectionSource,
        source.selection_source,
        source.transfer_attorney_selection_source,
        source.source,
      )),
    ) || 'seller_mandate',
    selectionDeferred: firstBoolean(
      ...candidates.flatMap((source) => [
        source.selectionDeferred,
        source.selection_deferred,
        source.transferAttorneySelectionDeferred,
        source.transfer_attorney_selection_deferred,
      ]),
    ),
  }
}

export function buildSavedMandateTransferAttorneyOption(snapshot = {}) {
  const attorney = resolveMandateTransferAttorneySnapshot(snapshot)
  if (!attorney.preferredPartnerId || !attorney.companyName) return null
  return {
    id: attorney.preferredPartnerId,
    partnerRelationshipId: attorney.partnerRelationshipId || attorney.preferredPartnerId,
    partnerOrganisationId: attorney.partnerOrganisationId,
    companyName: attorney.companyName,
    contactPerson: attorney.contactPerson || attorney.companyName,
    email: attorney.email,
    phone: attorney.phone,
    isActive: true,
    isPreferredDefault: false,
    partnerType: 'transfer_attorney',
    source: attorney.selectionSource || 'saved_mandate_transfer_attorney',
  }
}
