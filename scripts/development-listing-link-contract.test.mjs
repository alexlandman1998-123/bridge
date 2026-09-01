import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const listingWorkspace = readFileSync(resolve(repositoryRoot, 'the-it-guy/src/pages/AgentListingDetail.jsx'), 'utf8')
const leadIngestion = readFileSync(resolve(repositoryRoot, 'the-it-guy/src/services/leadIngestionService.js'), 'utf8')
const developmentWorkspace = readFileSync(resolve(repositoryRoot, 'the-it-guy/src/pages/DevelopmentDetail.jsx'), 'utf8')

assert.match(listingWorkspace, /Link listing to a development/, 'Agents can intentionally manage the listing-development association')
assert.match(listingWorkspace, /This keeps the listing as a normal private-property listing/, 'Linking does not reclassify the private-property listing')
assert.match(listingWorkspace, /updatePrivateListing\([\s\S]*developmentId: selectedDevelopmentLinkId/, 'The link persists through the canonical private-listing update path')
assert.match(listingWorkspace, /activityType: selectedDevelopmentLinkId \? 'development_linked' : 'development_unlinked'/, 'Link changes are auditable in listing activity')
assert.match(leadIngestion, /development_id, assigned_agent_id/, 'Listing lookup reads an existing development association')
assert.match(leadIngestion, /linked_listing_development_id/, 'Inbound listing enquiries inherit the linked development')
assert.match(leadIngestion, /developmentMatch: resolvedDevelopmentMatch/, 'The development lead mirror uses the resolved listing association')
assert.match(developmentWorkspace, /Agent and Direct Listings/, 'Developer workspace presents linked agency and direct listings')

console.log('development listing link contract checks passed')
