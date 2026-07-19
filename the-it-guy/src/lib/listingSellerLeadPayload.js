function text(value) {
  return String(value || '').trim()
}

function email(value) {
  return text(value).toLowerCase()
}

/**
 * Builds the single canonical CRM payload used when a listing is captured
 * directly from seller details. Keeping this in one place prevents listing
 * intake from becoming a contact-data dead end.
 */
export function buildListingSellerLeadPayload({
  seller = {},
  property = {},
  assignment = {},
  source = 'Manual Entry',
  notes = '',
} = {}) {
  const firstName = text(seller.firstName || seller.name)
  const lastName = text(seller.lastName || seller.surname)
  const sellerEmail = email(seller.email)
  const sellerPhone = text(seller.phone)
  const propertyAddress = text(property.propertyAddress || property.addressLine1 || property.streetAddress)
  const assignedAgentId = text(assignment.id || assignment.userId)
  const assignedAgentEmail = email(assignment.email)

  return {
    assignedAgent: {
      id: assignedAgentId,
      userId: assignedAgentId,
      branchId: text(assignment.branchId),
      name: text(assignment.name || assignment.fullName),
      email: assignedAgentEmail,
    },
    branchId: text(assignment.branchId),
    assignedUserId: assignedAgentId,
    createdBy: text(assignment.createdBy || assignedAgentId),
    contact: {
      firstName: firstName || 'Seller',
      lastName,
      email: sellerEmail,
      phone: sellerPhone,
      contactType: 'Seller',
      notes: text(notes),
    },
    lead: {
      leadCategory: 'Seller',
      leadDirection: 'Inbound',
      leadSource: text(source) || 'Manual Entry',
      stage: 'Seller Lead',
      status: 'Seller Lead',
      priority: 'Medium',
      sellerName: firstName || 'Seller',
      sellerSurname: lastName,
      sellerEmail,
      sellerPhone,
      sellerPropertyAddress: propertyAddress,
      formattedAddress: text(property.formattedAddress || propertyAddress),
      streetAddress: text(property.streetAddress || propertyAddress),
      suburb: text(property.suburb),
      city: text(property.city),
      province: text(property.province),
      country: text(property.country) || 'South Africa',
      postalCode: text(property.postalCode),
      latitude: property.latitude ?? null,
      longitude: property.longitude ?? null,
      googlePlaceId: text(property.googlePlaceId),
      propertyInterest: text(property.title || property.propertyType),
      estimatedValue: Number(property.estimatedValue || property.askingPrice || 0) || 0,
      notes: text(notes),
    },
  }
}
