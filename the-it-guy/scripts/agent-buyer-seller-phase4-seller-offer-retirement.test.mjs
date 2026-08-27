import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const portalSource = readFileSync(resolve(appRoot, 'src/pages/ClientPortal.jsx'), 'utf8')
const sellerPerformanceSource = portalSource.match(
  /function SellerListingPerformance[\s\S]*?\n}\n\nfunction SellerAgentUpdate/,
)?.[0] || ''

assert.doesNotMatch(portalSource, /import SellerOffersPage/)
assert.doesNotMatch(portalSource, /getOffersForListing/)
assert.doesNotMatch(portalSource, /<SellerOffersPage/)
assert.doesNotMatch(portalSource, /\{ key: 'offers', label: 'Offers', icon: HandCoins \}/)
assert.doesNotMatch(portalSource, /\{ key: 'offers', section: 'offers', label: 'Offers', icon: Tag \}/)
assert.doesNotMatch(portalSource, /Review offers with your agent/)
assert.doesNotMatch(portalSource, /Offers will appear here when your agent receives them/)
assert.doesNotMatch(portalSource, /View offers/)
assert.doesNotMatch(sellerPerformanceSource, /label: 'Offers'/)
assert.doesNotMatch(sellerPerformanceSource, /offer movement/)

assert.match(portalSource, /offers: false/)
assert.match(
  portalSource,
  /requestedWorkspace === 'seller' && requestedSection === 'offers'[\s\S]{0,100}\? 'progress'/,
  'Historical seller Offers links should resolve safely to Progress.',
)
assert.match(portalSource, /label: 'Signed OTP'/)
assert.match(portalSource, /Signed OTP to registration/)
assert.match(portalSource, /actionLabel: !isStarted \|\| currentKey === 'otp' \? 'View progress'/)
assert.match(portalSource, /signed_otp_received: 'finance'/)

// Bank offers remain part of the separate, existing bond-finance process.
assert.match(portalSource, /const BOND_APPLICATION_TABS = \[/)
assert.match(portalSource, /\{ key: 'offers', label: 'Offers' \}/)
assert.match(portalSource, /No bond offers have been shared yet\./)

console.log('Agent/buyer/seller Phase 4 seller offer retirement checks passed.')
