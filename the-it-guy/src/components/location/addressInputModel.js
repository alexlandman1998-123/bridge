export function isAddressFieldKey(key = '') {
  const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (/email|line2|city|suburb|province|postalcode|country|streetnumber|streetname/.test(normalized)) return false
  return /(?:address|addressline1|residentialstreet|residentialaddressstreet|currentpremises|domicilium)$/.test(normalized)
}

export function selectedAddressFields(address) {
  if (!address) return {}
  return {
    addressLine1: address.streetAddress || address.formattedAddress || '',
    formattedAddress: address.formattedAddress || '',
    streetAddress: address.streetAddress || '',
    streetNumber: address.streetNumber || '', streetName: address.route || address.streetName || '',
    suburb: address.suburb || '', city: address.city || '', province: address.province || '',
    postalCode: address.postalCode || '', country: address.country || 'South Africa',
    latitude: address.latitude ?? null, longitude: address.longitude ?? null,
    googlePlaceId: address.googlePlaceId || address.placeId || '',
  }
}
