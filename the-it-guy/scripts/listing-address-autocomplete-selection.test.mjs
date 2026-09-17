import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const listingSource = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const addressSource = await readFile(new URL('../src/components/location/AddressAutocomplete.tsx', import.meta.url), 'utf8')

assert.doesNotMatch(listingSource, /label="Property address \*"/, 'the shared address field should add its own required marker')
assert.match(listingSource, /label="Property address"[\s\S]{0,450}required/, 'new-listing address fields must remain required')
assert.match(addressSource, /hasSelectedAddressRef\.current = true/, 'selecting a Google address should mark it as selected')
assert.match(addressSource, /hasSelectedAddressRef\.current = false/, 'typing or clearing should allow a new address search')
assert.match(addressSource, /!hasSelectedAddressRef\.current && \(predictions\.length \|\| inputValue\.trim\(\)\.length >= 3\)/, 'refocusing a selected address must not reopen Google suggestions')

console.log('listing address autocomplete selection contract passed')
