import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  formatPropertyAddress,
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


const duplicateAddress = '687 Niemandt St, Andeon Agricultural Holdings, Andeon Agricultural Holdings, Pretoria, Gauteng, 0186'
const cleanAddress = '687 Niemandt St, Andeon Agricultural Holdings, Pretoria, Gauteng, 0186'
assert.equal(formatPropertyAddress({ formatted: duplicateAddress }), cleanAddress)
assert.equal(formatPropertyAddress({
  line1: '687 Niemandt St', line2: 'Andeon Agricultural Holdings',
  suburb: 'andeon agricultural holdings', city: 'Pretoria', province: 'GP', postalCode: '0186',
}), cleanAddress)
assert.equal(formatPropertyAddress({
  line1: cleanAddress, suburb: 'Andeon Agricultural Holdings', city: 'Pretoria', province: 'Gauteng', postalCode: '0186',
}), cleanAddress, 'A full address in line 1 must not accumulate the separate locality fields on each save.')
assert.equal(formatPropertyAddress({
  line1: '12 Pretoria Road', suburb: 'Andeon', city: 'Pretoria', province: 'Gauteng', postalCode: '0186',
}), '12 Pretoria Road, Andeon, Pretoria, Gauteng, 0186', 'Street-name substrings must not hide the city.')
assert.equal(formatPropertyAddress({
  line1: '687 Niemandt St', line2: 'Andeon', suburb: 'Andeon Agricultural Holdings', city: 'Pretoria',
}), '687 Niemandt St, Andeon, Andeon Agricultural Holdings, Pretoria', 'Distinct address parts must remain intact.')
assert.equal(formatPropertyAddress({ formatted: cleanAddress }), cleanAddress)

let saved = normalizePropertyAddress({ propertyAddress: duplicateAddress, suburb: 'Andeon Agricultural Holdings', city: 'Pretoria', province: 'Gauteng', postalCode: '0186' })
assert.equal(saved.formatted, cleanAddress)
saved = normalizePropertyAddress({ propertyAddress: saved.formatted, suburb: saved.suburb, city: saved.city, province: saved.province, postalCode: saved.postalCode })
assert.equal(saved.formatted, cleanAddress, 'Reopening the saved address must not reintroduce duplication.')

const agencySource = await readFile(path.join(projectRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const formatterStart = agencySource.indexOf('function buildWorkspaceFormattedAddress(')
const formatterEnd = agencySource.indexOf('\nfunction firstWorkspaceValue', formatterStart)
assert.ok(formatterStart >= 0 && formatterEnd > formatterStart)
const workspaceFormatter = new Function('formatPropertyAddress', 'normalizeText', `${agencySource.slice(formatterStart, formatterEnd)}; return buildWorkspaceFormattedAddress`)(formatPropertyAddress, value => String(value ?? '').trim())
assert.equal(workspaceFormatter(duplicateAddress, 'Andeon Agricultural Holdings', 'Pretoria', 'Gauteng', '0186'), cleanAddress)
assert.equal(workspaceFormatter('12 Pretoria Road', 'Andeon', 'Pretoria', 'Gauteng', '0186'), '12 Pretoria Road, Andeon, Pretoria, Gauteng, 0186')
console.log('Seller lead duplicate address regression checks passed')
