import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  isPlaceholderPropertyAddressText,
  normalizePropertyAddress,
} from '../src/lib/sellerPropertyAddress.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const onboardingSource = await readFile(path.join(projectRoot, 'src/pages/SellerOnboarding.jsx'), 'utf8')

assert.equal(
  isPlaceholderPropertyAddressText('Unnamed Lead'),
  true,
  'Unnamed Lead should be treated as a placeholder, not a property address',
)

assert.equal(
  normalizePropertyAddress({ propertyAddress: 'Unnamed Lead' }).line1,
  '',
  'flat placeholder propertyAddress should not become address line 1',
)

assert.equal(
  normalizePropertyAddress({}, { propertyAddress: 'Unnamed Lead', listingTitle: 'Unnamed Lead' }).line1,
  '',
  'listing placeholder propertyAddress should not become address line 1',
)

assert.equal(
  normalizePropertyAddress({ propertyAddressDetails: { query: '12 Main ' } }).query,
  '12 Main ',
  'search query should preserve a trailing typed space',
)

assert.equal(
  normalizePropertyAddress({ propertyAddressSearch: '12 Main Road ' }).query,
  '12 Main Road ',
  'flat search query should preserve a trailing typed space',
)

assert.match(
  onboardingSource,
  /value=\{propertyAddressDetails\.query \|\| ''\}/,
  'search input should not fall back to formatted address text',
)

const queryHandlerMatch = onboardingSource.match(
  /function handlePropertyAddressQueryChange\(value\) \{[\s\S]*?\n  \}/,
)

assert.ok(queryHandlerMatch, 'seller onboarding query handler should exist')
assert.doesNotMatch(
  queryHandlerMatch[0],
  /parsePropertyAddressQuery\(value,\s*current\)/,
  'typing in search should not parse and rewrite address details on every keypress',
)

console.log('Seller onboarding property address input checks passed')
