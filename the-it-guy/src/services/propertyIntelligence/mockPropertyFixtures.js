const STREET_NAMES = Object.freeze([
  'Jacaranda Avenue',
  'Silver Tree Crescent',
  'Fynbos Street',
  'Protea Close',
  'Yellowwood Lane',
  'Cape Ash Road',
])

const PROPERTY_TYPES = Object.freeze(['House', 'Townhouse', 'Apartment', 'Vacant Land'])
const FICTIONAL_OWNER_NAMES = Object.freeze([
  'Amina Daniels',
  'Thabo Ndlovu',
  'Mia van Wyk',
  'Kagiso Molefe',
  'Leila Petersen',
  'Sipho Maseko',
])

function buildParcelBoundary(latitude, longitude, row, column) {
  const latitudeRadius = 0.00016 + ((row % 3) * 0.000015)
  const longitudeRadius = 0.00021 + ((column % 3) * 0.000018)
  return [
    { latitude: latitude - latitudeRadius, longitude: longitude - longitudeRadius },
    { latitude: latitude - latitudeRadius, longitude: longitude + longitudeRadius },
    { latitude: latitude + latitudeRadius, longitude: longitude + longitudeRadius },
    { latitude: latitude + latitudeRadius, longitude: longitude - longitudeRadius },
  ]
}

function buildProperty(index) {
  const row = Math.floor(index / 6)
  const column = index % 6
  const streetName = STREET_NAMES[row % STREET_NAMES.length]
  const streetNumber = 5 + (column * 4) + (row % 2)
  const latitude = -34.0716 + (row * 0.00092) + ((column % 2) * 0.00008)
  const longitude = 18.8464 + (column * 0.00105)
  const indicativeValue = 1450000 + (index * 135000) + ((column % 3) * 225000)
  const propertyType = PROPERTY_TYPES[index % PROPERTY_TYPES.length]
  const erfNumber = String(2800 + (index * 17))
  const transferYear = 2018 + (index % 7)
  const transferMonth = String((index % 12) + 1).padStart(2, '0')
  const propertyId = `mock-property-${String(index + 1).padStart(3, '0')}`

  return Object.freeze({
    id: propertyId,
    providerPropertyId: `ARCH9-DEMO-${erfNumber}`,
    address: `${streetNumber} ${streetName}`,
    formattedAddress: `${streetNumber} ${streetName}, Arch9 Demo Estate, Western Cape`,
    streetNumber: String(streetNumber),
    streetName,
    suburb: 'Arch9 Demo Estate',
    city: 'Somerset West',
    province: 'Western Cape',
    postalCode: '7130',
    erfNumber,
    propertyType,
    erfSizeSquareMetres: 520 + (index * 25),
    latitude,
    longitude,
    parcelBoundary: Object.freeze(buildParcelBoundary(latitude, longitude, row, column).map(Object.freeze)),
    lastTransferDate: `${transferYear}-${transferMonth}-15`,
    lastTransferAmount: Math.round(indicativeValue * 0.72),
    indicativeValue,
    reportAvailability: Object.freeze({
      deeds_summary: true,
      transfer_history: true,
      property_valuation: propertyType !== 'Vacant Land',
    }),
    isDemoData: true,
    demoNotice: 'Fictional property data for demonstration only.',
    reportData: Object.freeze({
      registeredOwner: FICTIONAL_OWNER_NAMES[index % FICTIONAL_OWNER_NAMES.length],
      titleDeedNumber: `T${42000 + (index * 83)}/${transferYear}`,
      registrationDivision: 'Demo Registration Division',
      comparablePropertyCount: 4 + (index % 6),
    }),
  })
}

export const MOCK_PROPERTY_FIXTURES = Object.freeze(Array.from({ length: 24 }, (_, index) => buildProperty(index)))

export const MOCK_PROPERTY_DEFAULT_BOUNDS = Object.freeze({
  north: Math.max(...MOCK_PROPERTY_FIXTURES.map((property) => property.latitude)) + 0.0005,
  south: Math.min(...MOCK_PROPERTY_FIXTURES.map((property) => property.latitude)) - 0.0005,
  east: Math.max(...MOCK_PROPERTY_FIXTURES.map((property) => property.longitude)) + 0.0005,
  west: Math.min(...MOCK_PROPERTY_FIXTURES.map((property) => property.longitude)) - 0.0005,
})
