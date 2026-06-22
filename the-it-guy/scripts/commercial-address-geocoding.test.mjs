import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildListingPayload, createInitialValues } from '../src/modules/commercial/components/commercialListingWizardModel.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const configSource = read('src/modules/commercial/commercialCrudConfig.js')
const formModalSource = read('src/modules/commercial/components/CommercialFormModal.jsx')
const vacancyModalSource = read('src/modules/commercial/components/CommercialVacancyCreateModal.jsx')
const canvassingSource = read('src/modules/commercial/pages/CommercialCanvassingPage.jsx')

assert.match(formModalSource, /CommercialAddressField/, 'commercial form modal should render the shared address autocomplete wrapper')
assert.match(configSource, /name: 'address'[\s\S]*label: 'Property address'[\s\S]*type: 'address'/, 'commercial property create/edit should use address autocomplete')

const selectedPlace = {
  formattedAddress: '10 Oxford Road, Rosebank, Johannesburg, 2196, South Africa',
  streetNumber: '10',
  route: 'Oxford Road',
  streetName: 'Oxford Road',
  streetAddress: '10 Oxford Road',
  suburb: 'Rosebank',
  city: 'Johannesburg',
  province: 'Gauteng',
  postalCode: '2196',
  country: 'South Africa',
  latitude: -26.145,
  longitude: 28.041,
  placeId: 'place-rosebank-10',
  googlePlaceId: 'place-rosebank-10',
  geocodingStatus: 'google_place',
}

const payload = buildListingPayload({
  ...createInitialValues({ brokers: [{ value: 'broker-1', label: 'Broker One' }] }),
  listing_intent: 'sale',
  property_category: 'retail',
  property_link_mode: 'new',
  new_property_name: 'Rosebank Retail',
  new_property_address: selectedPlace.formattedAddress,
  new_property_suburb: selectedPlace.suburb,
  new_property_city: selectedPlace.city,
  new_property_province: selectedPlace.province,
  new_property_country: selectedPlace.country,
  new_property_address_value: selectedPlace,
  broker_id: 'broker-1',
  title: 'Rosebank Retail For Sale',
  listing_status: 'available',
}, {})

assert.equal(payload.new_property_formatted_address, selectedPlace.formattedAddress)
assert.equal(payload.new_property_google_place_id, selectedPlace.placeId)
assert.equal(payload.new_property_latitude, selectedPlace.latitude)
assert.equal(payload.new_property_longitude, selectedPlace.longitude)

assert.match(vacancyModalSource, /buildCommercialAddressValue\(property/, 'vacancy create should derive address data from the selected property')
assert.match(vacancyModalSource, /serializeCommercialAddressValue\(addressValue\)/, 'vacancy create should persist structured inherited or override address data')

assert.match(canvassingSource, /propertyAddressDetails/, 'commercial prospect payload should store selected property address details')
assert.match(canvassingSource, /preferredAreaAddress/, 'commercial prospect payload should store selected preferred-area details')
assert.match(canvassingSource, /\.\.\.requirementAddressPayload/, 'converted commercial requirements should receive structured address payloads')

console.log('commercial address geocoding tests passed')
