function firstText(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
}

export function buildSellerLeadReadinessRows({
  lead = {},
  listing = {},
  onboarding = {},
  journey = {},
  listingReadiness = {},
  documentSummary = {},
} = {}) {
  if (listingReadiness.hasListing) {
    return (listingReadiness.items || []).map((item) => ({
      key: item.key,
      label: item.label,
      complete: item.complete,
      status: item.complete ? 'Complete' : 'Incomplete',
    }))
  }

  const address = firstText(
    listing?.propertyAddress, listing?.property_address, listing?.addressLine1,
    onboarding?.propertyAddress, onboarding?.formattedAddress,
    lead?.sellerPropertyAddress, lead?.seller_property_address,
  )
  const propertyType = firstText(
    listing?.propertyType, listing?.property_type,
    onboarding?.propertyType, onboarding?.property_type,
    lead?.propertyType, lead?.property_type, lead?.sellerPropertyType, lead?.seller_property_type,
  )
  const propertyComplete = Boolean(address && propertyType)
  const propertyPartial = Boolean(address || propertyType)
  const marketingItems = (listingReadiness.items || [])
    .filter((item) => ['photos', 'description', 'pricing'].includes(item.key))
  const marketingCaptured = marketingItems.filter((item) => item.complete).length
  const documentTotal = Number(documentSummary.total) || 0
  const documentCompleted = Number(documentSummary.completed) || 0
  const mandateStatus = firstText(journey.mandateStatus).toLowerCase()

  return [
    {
      key: 'onboarding',
      label: 'Seller Onboarding',
      complete: journey.onboardingSubmitted === true,
      status: journey.onboardingSubmitted ? 'Submitted' : journey.onboardingSent ? 'Awaiting submission' : 'Not started',
    },
    {
      key: 'mandate',
      label: 'Mandate',
      complete: mandateStatus === 'signed',
      status: mandateStatus === 'signed' ? 'Signed' : mandateStatus === 'sent' ? 'Sent' : mandateStatus === 'draft' ? 'In progress' : 'Not signed',
    },
    {
      key: 'property_details',
      label: 'Property Details',
      complete: propertyComplete,
      status: propertyComplete ? 'Captured' : propertyPartial ? 'Partial' : 'Not captured',
    },
    {
      key: 'marketing_assets',
      label: 'Marketing Assets',
      complete: marketingItems.length > 0 && marketingCaptured === marketingItems.length,
      status: marketingCaptured ? `${marketingCaptured} of ${marketingItems.length} captured` : 'Not started',
    },
    {
      key: 'seller_documents',
      label: 'Seller Documents',
      complete: documentTotal > 0 && documentCompleted === documentTotal,
      status: documentTotal ? `${documentCompleted} of ${documentTotal} complete` : 'Not collected',
    },
    { key: 'listing', label: 'Listing', complete: false, status: 'Not created' },
  ]
}
