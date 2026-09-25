import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const websiteSource = readFileSync(new URL('../src/components/listings/WebsiteListingPublicationPanel.jsx', import.meta.url), 'utf8')

assert.match(detailSource, /normalizeListingChannelPublicUrl/, 'Portal channel links must be normalized before rendering.')
assert.match(detailSource, /View listing/, 'Portal rows must expose an explicit View listing link.')
assert.match(detailSource, /Reference & public link/, 'Listing channels must have a dedicated reference/link column.')
assert.doesNotMatch(detailSource, /reference \? \(\s*<span className="mt-1 inline-flex/, 'References must not remain badges under the channel name.')
assert.match(websiteSource, /View listing/, 'The agency website row must use the same explicit public-link action.')
assert.match(websiteSource, /Reference/, 'The agency website row must use the same reference column.')

console.log('Listing marketing phase 3 channel presentation contract passed')
