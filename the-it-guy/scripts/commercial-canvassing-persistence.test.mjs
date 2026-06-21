import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const serviceSource = await fs.readFile(new URL('../src/modules/commercial/services/commercialCanvassingApi.js', import.meta.url), 'utf8')
const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606210005_commercial_canvassing_foundation.sql', import.meta.url), 'utf8')

assert.doesNotMatch(
  serviceSource,
  /return\s+createCommercialCanvassingProspect\(orgId,\s*payload\)/,
  'commercial prospect create must not recurse on schema errors',
)

assert.doesNotMatch(
  serviceSource,
  /return\s+updateCommercialCanvassingProspect\(orgId,\s*prospectId,\s*payload\)/,
  'commercial prospect update must not recurse on schema errors',
)

assert.doesNotMatch(
  serviceSource,
  /return\s+createCommercialCanvassingActivity\(orgId,\s*payload\)/,
  'commercial canvassing activity create must not recurse on schema errors',
)

for (const requiredToken of [
  'create table if not exists public.commercial_canvassing_prospects',
  'create table if not exists public.commercial_canvassing_activities',
  'prospect_role text',
  'deal_type text',
  'property_category text',
  'metadata_json jsonb',
  'commercial_canvassing_prospects_brokerage_insert',
  'commercial_canvassing_activities_brokerage_insert',
]) {
  assert.match(migrationSource, new RegExp(requiredToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `migration should include ${requiredToken}`)
}

console.log('commercial canvassing persistence checks passed')
