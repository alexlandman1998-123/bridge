import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const listingDetail = read('src/pages/AgentListingDetail.jsx')
const apiSource = read('server/property24/api.js')
const packageJson = JSON.parse(read('package.json'))
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

assert.match(listingDetail, /property24LeadImport/)
assert.match(listingDetail, /getProperty24LeadImportCounts/)
assert.match(listingDetail, /pullProperty24ListingLeads/)
assert.match(listingDetail, /applyLeads: false/)
assert.match(listingDetail, /applyLeads: true/)
assert.match(listingDetail, /Check Leads/)
assert.match(listingDetail, /Import Leads/)
assert.match(listingDetail, /Already In Arch9/)
assert.match(listingDetail, /refreshInterestedLeads\(\)/)
assert.match(listingDetail, /itg:agency-crm-updated/)
assert.match(listingDetail, /Authorization: `Bearer \$\{accessToken\}`/)
assert.doesNotMatch(listingDetail, /PROPERTY24_API_INTERNAL_TOKEN/)

assert.match(apiSource, /listingLeads/)
assert.match(apiSource, /apiToken: !canUseBrowserProperty24ListingAuth/)
assert.match(apiSource, /authenticateBrowserProperty24ListingRequest\(\{ supabase, headers, config \}\)/)
assert.match(apiSource, /importProperty24ListingLeadPayload/)

assert.equal(packageJson.scripts['test:property24-phase8-lead-import-ui'], 'node scripts/property24-phase8-lead-import-ui.test.mjs')
assert.equal(rootPackageJson.scripts['test:property24-phase8-lead-import-ui'], 'npm --prefix the-it-guy run test:property24-phase8-lead-import-ui --')

console.log('Property24 phase 8 lead import UI contract passed')
