import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agentListingsSource = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

for (const requiredLocationFallback of [
  'resolveDevelopmentLocation',
  'source?.formatted_address',
  'source?.street_address',
  "[source?.suburb, source?.city].filter(Boolean).join(', ')",
]) {
  assert.match(
    agentListingsSource,
    new RegExp(requiredLocationFallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `Development cards should resolve location from ${requiredLocationFallback}.`,
  )
}

assert.match(
  agentListingsSource,
  /location:\s*resolveDevelopmentLocation\(option\)/,
  'Assigned development cards should use the shared location resolver.',
)
assert.match(
  agentListingsSource,
  /location:\s*resolveDevelopmentLocation\(row\?\.development,\s*row\?\.transaction\)/,
  'Transaction-derived development cards should fall back through transaction location fields.',
)
assert.match(
  agentListingsSource,
  /relative h-\[170px\][^"]*bg-white/,
  'Development workspace card header should use a white container.',
)
assert.doesNotMatch(
  agentListingsSource,
  /bg-\[linear-gradient\(135deg,#113350_0%,#1f4f78_38%,#6e9fc6_100%\)\]/,
  'Development workspace card header should not use the dark blue gradient.',
)

assert.match(
  apiSource,
  /select\('id, organisation_id, name, planned_units, total_units_expected, location, address, formatted_address, street_address, suburb, city, province, developer_company, status'\)/,
  'fetchDevelopmentOptions should select location/address fields for development cards.',
)
assert.match(
  apiSource,
  /export function invalidateDevelopmentOptionsCache\(\)/,
  'Development options cache invalidation should remain available.',
)
assert.match(
  apiSource,
  /invalidateDevelopmentOptionsCache\(\)\s*\n\s*return true/,
  'Saving development details should invalidate the development options cache.',
)

console.log('Agent development card location and style contract passed.')
