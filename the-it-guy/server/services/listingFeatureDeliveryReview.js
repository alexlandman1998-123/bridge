import { LISTING_FEATURE_CATALOG, resolveListingFeature } from '../../src/services/listings/listingFeatureCatalog.js'
import { normalizeListingPortalFeatures } from './listingPortalFeatureNormalizer.js'
import { RESIDENTIAL_FEATURE_TAGS, RESIDENTIAL_FEATURE_TYPES, RESIDENTIAL_LISTING_TAGS, RESIDENTIAL_ROOF_TAGS, resolveProperty24PropertyTypeId } from './property24ListingMapper.js'
import { PRIVATE_PROPERTY_FEATURE_ATTRIBUTES, resolvePrivatePropertyCategory, supportsPrivatePropertyFeature } from './privatePropertyListingMapper.js'

// A native entry means the entire captured value is represented structurally.
// A count reduced to a portal presence flag (e.g. carports) is deliberately
// excluded, even though the payload also sends the flag.
export const PROPERTY24_NATIVE_FACT_FIELDS = Object.freeze({
  studies: 'propertyFeatures.studies', kitchens: 'propertyFeatures.kitchens.kitchens',
  kitchen_dishwasher: 'propertyFeatures.kitchens.dishwasher',
  kitchen_cleaning_service: 'propertyFeatures.kitchens.cleaningService',
  kitchen_sink: 'propertyFeatures.kitchens.sink',
  kitchen_coffee_machine: 'propertyFeatures.kitchens.coffeeMachine',
  reception_rooms: 'propertyFeatures.receptionRooms', domestic_rooms: 'propertyFeatures.domesticRooms',
  domestic_bathrooms: 'propertyFeatures.domesticBathrooms', outside_toilets: 'propertyFeatures.outsideToilets',
  storeys: 'propertyFeatures.numberOfFloors', second_house: 'propertyFeatures.secondHouse',
  standalone_building: 'propertyFeatures.hasStandaloneBuilding',
  outbuildings_area: 'propertyFeatures.outBuildingsSize',
  secure_parking: 'propertyFeatures.parking.secureParking', street_parking: 'propertyFeatures.parking.onStreetParking',
  covered_parking: 'propertyFeatures.parking.shadeNetCoveredParking', underground_parking: 'propertyFeatures.parking.undergroundParking',
  visitors_parking: 'propertyFeatures.parking.visitorsParking', tandem_parking: 'propertyFeatures.parking.tandemParking',
  single_parking: 'propertyFeatures.parking.singleParking', double_parking: 'propertyFeatures.parking.doubleParking',
  triple_parking: 'propertyFeatures.parking.tripleParking',
  flatlet: 'propertyFeatures.flatlet', garden: 'propertyFeatures.garden', pool: 'propertyFeatures.pool',
  balcony: 'propertyFeatures.outsideArea.balcony', courtyard: 'propertyFeatures.outsideArea.courtyard',
  roof_area: 'propertyFeatures.outsideArea.roofArea',
  outside_areas: 'propertyFeatures.outsideArea.outsideAreas',
  solar_panels: 'propertyFeatures.sustainabilityInfo.solarPanels', solar_geyser: 'propertyFeatures.sustainabilityInfo.solarGeyser',
  gas_geyser: 'propertyFeatures.sustainabilityInfo.gasGeyser', water_tank: 'propertyFeatures.sustainabilityInfo.waterTank',
  borehole: 'propertyFeatures.sustainabilityInfo.borehole', inverter_battery: 'propertyFeatures.sustainabilityInfo.backupBatteryOrInverter',
  generator: 'propertyFeatures.hasGenerator', backup_water: 'propertyFeatures.hasBackupWater',
  fibre: 'propertyFeatures.internetAccess.fibre', internet_adsl: 'propertyFeatures.internetAccess.adsl',
  internet_dial_up: 'propertyFeatures.internetAccess.dialUp', internet_fixed_wimax: 'propertyFeatures.internetAccess.fixedWiMax',
  internet_isdn: 'propertyFeatures.internetAccess.isdn', internet_satellite: 'propertyFeatures.internetAccess.satellite',
  internet_vdsl: 'propertyFeatures.internetAccess.vdsl',
  nearby_bus: 'propertyFeatures.publicTransport.nearbyBusService',
  nearby_minibus_taxi: 'propertyFeatures.publicTransport.nearbyMinibusTaxiService',
  nearby_train: 'propertyFeatures.publicTransport.nearbyTrainService',
  wheelchair_accessible: 'propertyFeatures.isWheelchairAccessible', pet_friendly: 'propertyFeatures.petsAllowed',
})

function selectedValue(feature, facts) {
  const value = facts[feature.key]
  if (feature.type === 'boolean') return value === true ? 'Yes' : null
  if (feature.type === 'count') return Number.isFinite(value) && value > 0 ? String(value) : null
  return value || null
}

function reviewFact(feature, value, { property24Category, property24TypeId, privatePropertyCategory }) {
  const key = feature.key
  const property24Field = property24Category === 'residential'
    ? PROPERTY24_NATIVE_FACT_FIELDS[key]
      || (RESIDENTIAL_LISTING_TAGS[key] && (key !== 'new_development' || [4, 6].includes(property24TypeId)) ? `tags.${RESIDENTIAL_LISTING_TAGS[key]}` : '')
      || (RESIDENTIAL_FEATURE_TAGS[key] ? `featureTags.${RESIDENTIAL_FEATURE_TAGS[key][0]}.${RESIDENTIAL_FEATURE_TAGS[key][1]}` : '')
      || (RESIDENTIAL_FEATURE_TYPES[key] ? `featureTags.${RESIDENTIAL_FEATURE_TYPES[key]}` : '')
      || (key === 'roof_type' && RESIDENTIAL_ROOF_TAGS[value] ? `tags.${RESIDENTIAL_ROOF_TAGS[value]}` : '')
    : ''
  const privatePropertyAttribute = PRIVATE_PROPERTY_FEATURE_ATTRIBUTES[key]
  const privatePropertyNative = Boolean(privatePropertyAttribute && supportsPrivatePropertyFeature(key, privatePropertyCategory))
  return {
    key, label: feature.label, value,
    property24: { delivery: property24Field ? 'native' : 'description_only', field: property24Field || null },
    privateProperty: { delivery: privatePropertyNative ? 'native' : 'description_only', field: privatePropertyNative ? privatePropertyAttribute : null },
  }
}

export function buildListingFeatureDeliveryReview({ listing = {}, publication = {}, property24Category = '' } = {}) {
  const normalized = normalizeListingPortalFeatures({ listing, publication })
  const privatePropertyCategory = resolvePrivatePropertyCategory(
    publication.property_category || publication.propertyCategory || listing.property_category || listing.propertyCategory
      || publication.property_type || publication.propertyType || listing.property_type || listing.propertyType,
  )
  const property24TypeId = resolveProperty24PropertyTypeId(
    publication.property_type || publication.propertyType || listing.property_type || listing.propertyType,
  )
  const context = { property24Category, property24TypeId, privatePropertyCategory }
  const facts = LISTING_FEATURE_CATALOG.flatMap((feature) => {
    const value = selectedValue(feature, normalized.featureFacts)
    return value === null ? [] : [reviewFact(feature, value, context)]
  })
  const catalogued = new Set(facts.map((item) => item.key))
  const legacy = normalized.selectedLabels.flatMap((label) => {
    const feature = resolveListingFeature(label)
    if (feature || !label.trim()) return []
    const key = `legacy:${label.toLowerCase()}`
    if (catalogued.has(key)) return []
    catalogued.add(key)
    return [{
      key, label, value: 'Yes',
      property24: { delivery: 'description_only', field: null },
      privateProperty: { delivery: 'description_only', field: null },
    }]
  })
  return { facts: [...facts, ...legacy], property24Category, privatePropertyCategory }
}
