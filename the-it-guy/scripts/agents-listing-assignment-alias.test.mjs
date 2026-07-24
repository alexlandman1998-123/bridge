import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const agentsSource = await fs.readFile(new URL('../src/pages/Agents.jsx', import.meta.url), 'utf8')

assert.match(
  agentsSource,
  /const agentIdByAssignmentId = new Map\(\)/,
  'Agents page should maintain a listing-assignment alias map.',
)
assert.match(
  agentsSource,
  /agentRecord\?\.userId/,
  'Listing assignment matching must include the auth user id alias.',
)
assert.match(
  agentsSource,
  /agentRecord\?\.organisationUserId/,
  'Listing assignment matching must include the organisation membership id alias.',
)
assert.match(
  agentsSource,
  /const agentId = agentIdByAssignmentId\.get\(key\)\s+if \(agentId\) return agentId/s,
  'Private listing assigned_agent_id values should resolve through the alias map.',
)
assert.match(
  agentsSource,
  /resolveListingAgentId\(listing, groupedByAgent, agentIdByEmail, agentIdByName, agentIdByAssignmentId\)/,
  'The private listing rollup should pass the assignment alias map into the resolver.',
)

console.log('agents listing assignment alias tests passed')
