import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceSource = await readFile(path.join(root, 'src/services/bondPartnerProfileService.js'), 'utf8')
const migrationSource = await readFile(
  path.resolve(root, '../supabase/migrations/20260608102453_fix_bond_partner_profile_accepted_status.sql'),
  'utf8',
)

assert.match(
  serviceSource,
  /const INVITE_RELATIONSHIP_PREFIX = 'partner-invite-relationship-'/,
  'bond partner profile should keep supporting accepted invite synthetic relationship URLs',
)
assert.match(
  serviceSource,
  /async function fetchRelationshipById/,
  'bond partner profile should read the real relationship row before opening a direct profile route',
)
assert.match(
  serviceSource,
  /resolveRelationshipCurrentOrganisationId\(relationship, options, currentUser\.id\)/,
  'direct relationship profile routes should resolve the current organisation from the relationship pair',
)
assert.match(
  serviceSource,
  /mapRelationshipOverview\(relationship, partnerResult\.data\)/,
  'profile overview should have a safe client fallback when the RPC rejects legacy accepted rows',
)
assert.match(
  migrationSource,
  /nullif\(v_relationship\.relationship_status, ''\),\s*nullif\(v_relationship\.status, ''\)/,
  'partner profile RPC should prefer relationship_status over legacy status',
)
assert.match(
  migrationSource,
  /v_relationship_status not in \('accepted', 'approved', 'connected'\)/,
  'partner profile RPC should treat accepted-compatible statuses as active relationships',
)

console.log('bond partner profile tests passed')
