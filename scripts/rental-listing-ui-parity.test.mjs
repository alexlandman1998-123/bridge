import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const rentalListingsPage = fs.readFileSync(
  path.join(repoRoot, 'the-it-guy', 'src', 'pages', 'rentals', 'RentalListingsPage.jsx'),
  'utf8',
)
const rentalCreatePage = fs.readFileSync(
  path.join(repoRoot, 'the-it-guy', 'src', 'pages', 'rentals', 'RentalListingCreatePage.jsx'),
  'utf8',
)

assert.match(rentalListingsPage, /ListingCardImage/, 'rental index should use image-led listing cards')
assert.match(rentalListingsPage, /Quick Add Rental/, 'rental index should expose quick-add action in the sales listing pattern')
assert.match(rentalListingsPage, /grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4/, 'rental index should render a responsive card grid')
assert.match(rentalListingsPage, /Rental Listings/, 'rental index should keep the listing inventory section heading')
assert.match(rentalListingsPage, /Applications/, 'rental index should expose application count segmentation')
assert.doesNotMatch(rentalListingsPage, /Create rental draft/, 'rental index must not show the create draft form heading')
assert.doesNotMatch(rentalListingsPage, /summaryCard/, 'rental index should not use dashboard KPI summary cards')
assert.match(rentalCreatePage, /Create Listing/, 'rental create page should own the rental draft form')

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts['test:rental-listing-ui-parity'],
  'node scripts/rental-listing-ui-parity.test.mjs',
)

console.log('rental listing UI parity tests passed')
