import { normalizePreferredPartnerType } from './preferredPartners'

export function mapPreferredDirectoryPartnerToTransactionOption(partner = {}) {
  const id = String(partner.id || '').trim()
  const companyName = String(partner.companyName || '').trim()
  if (!id || !companyName || partner.isActive === false) return null

  return {
    id: `preferred-partner:${id}`,
    source: 'preferred_partner',
    preferredPartnerId: id,
    relationshipId: partner.developerPartnerRelationshipId || null,
    relationshipType: partner.isPreferredDefault ? 'preferred' : 'operational_partner',
    companyName,
    contactPerson: String(partner.contactPerson || '').trim(),
    email: String(partner.email || '').trim().toLowerCase(),
    phone: String(partner.phone || '').trim(),
    organisationId: partner.partnerOrganisationId || null,
    partnerOrganisationId: partner.partnerOrganisationId || null,
    partnerOrganizationId: partner.partnerOrganisationId || null,
    preferred: Boolean(partner.isPreferredDefault),
    isPreferredDefault: Boolean(partner.isPreferredDefault),
  }
}

export function getPreferredDirectoryPartnerOptions(partners = [], roleType = '') {
  const normalizedRoleType = normalizePreferredPartnerType(roleType)
  return (Array.isArray(partners) ? partners : [])
    .filter((partner) => normalizePreferredPartnerType(partner?.partnerType) === normalizedRoleType)
    .map(mapPreferredDirectoryPartnerToTransactionOption)
    .filter(Boolean)
}

export function mergePartnerConnectionOptions(connectionOptions = [], legacyOptions = []) {
  const byKey = new Map()
  const options = [...connectionOptions, ...legacyOptions]
  options.forEach((option) => {
    const key = option.organisationId || option.partnerOrganisationId || option.partnerOrganizationId || option.companyName || option.id
    if (!key) return
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, option)
      return
    }

    const optionHasPreference = Boolean(option.preferredRoutingRuleId || option.preferred || option.isPreferredDefault || option.userId)
    const existingHasPreference = Boolean(existing.preferredRoutingRuleId || existing.preferred || existing.isPreferredDefault || existing.userId)
    const preferredRecord = optionHasPreference && !existingHasPreference ? option : existing
    const secondaryRecord = preferredRecord === option ? existing : option
    byKey.set(key, {
      ...secondaryRecord,
      ...preferredRecord,
      connectionId: preferredRecord.connectionId || secondaryRecord.connectionId || null,
      relationshipId: preferredRecord.relationshipId || secondaryRecord.relationshipId || null,
      preferredPartnerId: preferredRecord.preferredPartnerId || secondaryRecord.preferredPartnerId || null,
      organisationId: preferredRecord.organisationId || secondaryRecord.organisationId || null,
      partnerOrganisationId: preferredRecord.partnerOrganisationId || secondaryRecord.partnerOrganisationId || null,
      partnerOrganizationId: preferredRecord.partnerOrganizationId || secondaryRecord.partnerOrganizationId || null,
      email: preferredRecord.email || secondaryRecord.email || '',
      phone: preferredRecord.phone || secondaryRecord.phone || '',
    })
  })
  return [...byKey.values()].sort((left, right) => {
    const defaultDifference = Number(Boolean(right.isPreferredDefault)) - Number(Boolean(left.isPreferredDefault))
    if (defaultDifference !== 0) return defaultDifference
    const preferredDifference = Number(Boolean(right.preferred)) - Number(Boolean(left.preferred))
    if (preferredDifference !== 0) return preferredDifference
    return String(left.companyName || '').localeCompare(String(right.companyName || ''))
  })
}

export function partnerOptionToRolePlayerSelection(roleType, partner, selectionSource = '') {
  if (!partner) return null
  const resolvedSelectionSource =
    selectionSource ||
    (partner.source === 'development_default'
      ? 'development_default'
      : partner.source === 'preferred_partner' ||
          partner.preferredPartnerId ||
          partner.preferredRoutingRuleId ||
          partner.relationshipType === 'preferred'
        ? 'preferred_partner'
        : 'connected_partner')

  return {
    roleType,
    source: resolvedSelectionSource,
    selectionSource: resolvedSelectionSource,
    preferredPartnerId: partner.preferredPartnerId || partner.preferred_partner_id || null,
    partnerRelationshipId: partner.relationshipId || null,
    partnerConnectionId: partner.connectionId || null,
    partnerOrganisationId:
      partner.organisationId || partner.partnerOrganisationId || partner.partnerOrganizationId || null,
    userId: partner.userId || null,
    partner: {
      companyName: partner.companyName,
      contactPerson: partner.contactPerson || partner.contactName || partner.companyName,
      email: partner.email,
      phone: partner.phone || '',
      userId: partner.userId || null,
      partnerConnectionId: partner.connectionId || null,
    },
  }
}
