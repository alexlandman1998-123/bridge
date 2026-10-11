export function buildDevelopmentPartnerOptions(defaults = [], relationships = [], partnerType) {
  const available = (partner) => !partner.scopeType || partner.scopeType === 'all_developments'
  const options = defaults.filter((partner) => partner.partnerType === partnerType && partner.isActive && available(partner)).map((partner) => {
    const relationship = relationships.find((item) => item.id === partner.relationshipId || (partner.partnerOrganisationId && item.partnerOrganisationId === partner.partnerOrganisationId))
    return {
      key: partner.id, preferredPartnerId: partner.id, relationshipId: partner.relationshipId || relationship?.id || '',
      organisationId: partner.partnerOrganisationId || relationship?.partnerOrganisationId || '',
      name: partner.companyName || partner.contactPerson || partner.email,
      email: partner.email || relationship?.partnerInvitationEmail || '',
      contactName: partner.contactPerson || '', phone: partner.phone || '',
      logoUrl: partner.logoUrl || relationship?.partnerOrganisation?.logoUrl || '',
      preferred: Boolean(partner.isPreferredDefault),
    }
  })
  relationships.filter((partner) => partner.partnerType === partnerType && partner.status === 'active' && available(partner)).forEach((partner) => {
    if (options.some((option) => option.relationshipId === partner.id || (option.organisationId && option.organisationId === partner.partnerOrganisationId))) return
    options.push({ key: partner.id, relationshipId: partner.id, preferredPartnerId: '', organisationId: partner.partnerOrganisationId || '',
      name: partner.partnerName, email: partner.partnerInvitationEmail || '', contactName: '', phone: '', logoUrl: partner.partnerOrganisation?.logoUrl || '', preferred: false })
  })
  return options.sort((left, right) => Number(right.preferred) - Number(left.preferred) || String(left.name).localeCompare(String(right.name)))
}
