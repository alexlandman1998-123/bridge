import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
const clientPortal = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8')
const buyerDemo = fs.readFileSync('src/pages/ProspectBuyerDemo.jsx', 'utf8')
const developerPortal = fs.readFileSync('src/pages/DeveloperDocumentPortalPage.jsx', 'utf8')
const agentListing = fs.readFileSync('src/pages/AgentListingDetail.jsx', 'utf8')
const uploadButton = fs.readFileSync('src/components/client-portal/documents/ClientDocumentUploadButton.jsx', 'utf8')
const rehearsal = fs.readFileSync('docs/portal-release-rehearsal-phase4.md', 'utf8')

for (const heading of ['Buyer', 'Seller', 'Agency', 'Developer']) {
  assert.match(rehearsal, new RegExp(`\\| ${heading} \\|`), `${heading} must have a release walkthrough.`)
}
for (const requirement of ['390px width', 'selected file', 'expired seller sessions', 'Refresh each role']) {
  assert.match(rehearsal, new RegExp(requirement), `Release rehearsal must cover ${requirement}.`)
}

assert.match(app, /path="\/developer\/document-portal\/:token"/, 'Developer document portal must have a guarded route.')
assert.match(app, /path="\/demo\/:token\/buyer\/:section"/, 'Buyer portal demo must retain section-level mobile/desktop coverage.')
assert.match(clientPortal, /useTransactionLiveRefresh/, 'Buyer and seller portals must refresh transaction updates.')
assert.match(clientPortal, /SellerPortalPasswordGate/, 'Seller portal must retain its session/password gate.')
assert.match(clientPortal, /isSellerPortalSessionExpiredError/, 'Seller session expiry must have a safe recovery branch.')
assert.match(clientPortal, /handleUploadRequiredDocument/, 'Portal uploads must use the shared upload result flow.')
assert.match(uploadButton, /Uploading securely — please keep this page open\./, 'Release rehearsal requires an honest upload state.')
assert.match(uploadButton, /Received and awaiting review by your transaction team\./, 'Release rehearsal requires a clear upload receipt.')
assert.match(uploadButton, /Try again/, 'Release rehearsal requires retryable upload failures.')
assert.match(buyerDemo, /aria-label=\{menuOpen \? 'Close menu' : 'Open menu'\}/, 'Buyer mobile navigation must be operable.')
assert.match(buyerDemo, /MobileMessages/, 'Buyer mobile messages must remain reachable.')
assert.match(developerPortal, /document/i, 'Developer portal must render a document experience.')
assert.match(agentListing, /getSellerPortalAccessState/, 'Agency workflow must expose seller portal access state.')

console.log('portal release rehearsal phase 4 checks passed')
