import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const migrationSource = readFileSync(resolve(appRoot, 'sql/20260823_transaction_sale_route_split.sql'), 'utf8')
const apiSource = readDomainApiSource()
const handoffSource = readFileSync(
  resolve(appRoot, 'src/core/developerLeads/developerLeadTransactionHandoff.js'),
  'utf8',
)

for (const token of [
  'add column if not exists sale_route text',
  'add column if not exists sale_channel text',
  'add column if not exists seller_party_type text',
  'add column if not exists lead_owner text',
  'add column if not exists ownership_model text',
  'add column if not exists source_agency_org_id uuid',
  'external_agency_sale',
  'developer_assigned_sale',
  'internal_developer_sale',
  'private_property_sale',
  'transactions_sale_route_check',
  'transactions_source_agency_org_id_idx',
]) {
  assert.match(migrationSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'sale_route: saleProfile.saleRoute',
  'lead_owner: normalizeNullableText(sourceContext.leadOwner || sourceContext.lead_owner)',
  'ownership_model: normalizeNullableText(sourceContext.ownershipModel || sourceContext.ownership_model)',
  'source_agency_org_id: normalizeNullableUuid(',

]) {
  assert.match(apiSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(apiSource, /retryMutationWithoutReportedMissingColumns/)
assert.doesNotMatch(apiSource, /delete fallbackPayload\.(sale_route|lead_owner|ownership_model|source_agency_org_id)/)

for (const token of [
  'leadOwner: normalizeText(lead.leadOwner)',
  'ownershipModel: normalizeText(lead.ownershipModel)',
  'sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId)',
  'sourceAgentUserId: normalizeText(lead.sourceAgentUserId)',
]) {
  assert.match(handoffSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

console.log('transaction sale route phase 6 persistence checks passed')
