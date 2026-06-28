import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(
  new URL('../src/components/location/AddressAutocomplete.tsx', import.meta.url),
  'utf8',
)

for (const requiredToken of [
  'modernAutocompleteUnavailableRef',
  'fetchLegacyPredictions',
  'Modern Places autocomplete failed; retrying with legacy Places service.',
  'fetchLegacyPredictions(suggestionError)',
  'Address suggestions are temporarily unavailable. You can keep typing manually.',
  'fetchLegacyPlaceDetails',
  'Modern place details failed; retrying with legacy Places details.',
]) {
  assert(component.includes(requiredToken), `AddressAutocomplete should include ${requiredToken}`)
}

assert(
  !component.includes('Address suggestions are unavailable (${suggestionError?.message') &&
    !component.includes('Rpc failed due to xhr error'),
  'AddressAutocomplete should not surface raw modern Places RPC errors to users.',
)

console.log('Address autocomplete modern fallback contract passed.')
