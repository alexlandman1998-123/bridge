import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_AGENT_MAPPING_SERVICE_VERSION,
  buildPrivatePropertyAgentMappingPayload,
  redactPrivatePropertyAgentMapping,
  resolvePrivatePropertyAgentMapping,
  upsertPrivatePropertyAgentMapping,
} from '../server/services/privatePropertyAgentMappingService.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

class FakeQuery {
  constructor(rows = [], table = '', operations = []) {
    this.rows = rows
    this.table = table
    this.operations = operations
    this.filters = []
    this.limitCount = null
    this.write = null
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  is(column, value) {
    this.filters.push({ type: 'is', column, value })
    return this
  }

  order() {
    return this
  }

  insert(payload) {
    this.write = { type: 'insert', payload }
    this.operations.push({ table: this.table, type: 'insert', payload })
    return this
  }

  update(payload) {
    this.write = { type: 'update', payload }
    this.operations.push({ table: this.table, type: 'update', payload })
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  applyFilters() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => {
      if (filter.type === 'is') return (row[filter.column] ?? null) === filter.value
      return String(row[filter.column] ?? '') === String(filter.value ?? '')
    }))
    if (this.limitCount) rows = rows.slice(0, this.limitCount)
    return rows
  }

  maybeSingle() {
    return Promise.resolve({ data: this.applyFilters()[0] || null, error: null })
  }

  single() {
    if (!this.write) return this.maybeSingle()
    const existing = this.applyFilters()[0] || {}
    return Promise.resolve({
      data: {
        id: existing.id || '00000000-0000-4000-8000-000000000099',
        ...existing,
        ...this.write.payload,
      },
      error: null,
    })
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.applyFilters(), error: null }).then(resolve, reject)
  }
}

function createFakeClient(tables = {}) {
  const operations = []
  return {
    operations,
    from(table) {
      return new FakeQuery(tables[table] || [], table, operations)
    },
  }
}

const organisationId = '00000000-0000-4000-8000-000000000001'
const branchId = '00000000-0000-4000-8000-000000000002'
const listingId = '00000000-0000-4000-8000-000000000003'
const arch9UserId = '00000000-0000-4000-8000-000000000004'
const agencyConfigId = '00000000-0000-4000-8000-000000000010'

const agencyConfig = {
  id: agencyConfigId,
  organisation_id: organisationId,
  branch_id: branchId,
  environment: 'sandbox',
  vendor_name: 'Arch9',
  branch_guid: '22222222-2222-4222-8222-222222222222',
  username_secret_name: 'PRIVATE_PROPERTY_SANDBOX_USERNAME',
  password_secret_name: 'PRIVATE_PROPERTY_SANDBOX_PASSWORD',
  enabled: true,
  status: 'sandbox_ready',
}

const listing = {
  id: listingId,
  organisation_id: organisationId,
  branch_id: branchId,
  assigned_agent_id: arch9UserId,
  assigned_agent_email: 'agent@arch9.test',
  created_by: '00000000-0000-4000-8000-000000000009',
}

const branchDefault = {
  id: '00000000-0000-4000-8000-000000000020',
  agency_config_id: agencyConfigId,
  organisation_id: organisationId,
  branch_id: branchId,
  environment: 'sandbox',
  private_property_agent_id: 'ARCH9-SANDBOX-BRANCH-DEFAULT',
  source_reference: 'branch-default',
  is_default_for_branch: true,
  match_type: 'branch_default',
  status: 'active',
}

const userMapping = {
  id: '00000000-0000-4000-8000-000000000021',
  agency_config_id: agencyConfigId,
  organisation_id: organisationId,
  branch_id: branchId,
  arch9_user_id: arch9UserId,
  environment: 'sandbox',
  private_property_agent_id: 'ARCH9-SANDBOX-USER-1',
  source_reference: 'ARCH9-SANDBOX-USER-1',
  email_snapshot: 'agent@arch9.test',
  first_name_snapshot: 'Agent',
  last_name_snapshot: 'One',
  mobile_snapshot: '+27676125009',
  match_type: 'manual',
  status: 'active',
}

const resolvedUser = await resolvePrivatePropertyAgentMapping({
  client: createFakeClient({
    private_listings: [listing],
    private_property_agency_configs: [agencyConfig],
    private_property_agent_mappings: [branchDefault, userMapping],
  }),
  listingId,
  environment: 'sandbox',
})

assert.equal(resolvedUser.version, PRIVATE_PROPERTY_AGENT_MAPPING_SERVICE_VERSION)
assert.equal(resolvedUser.ready, true)
assert.equal(resolvedUser.source, 'arch9_user')
assert.equal(resolvedUser.agencyConfig.branchGuid, '22222222-2222-4222-8222-222222222222')
assert.equal(resolvedUser.mapping.privatePropertyAgentId, 'ARCH9-SANDBOX-USER-1')
assert.equal(resolvedUser.agentMapping.agentIds, 'ARCH9-SANDBOX-USER-1')
assert.deepEqual(resolvedUser.blockers, [])

const emailResolved = await resolvePrivatePropertyAgentMapping({
  client: createFakeClient({
    private_listings: [{ ...listing, assigned_agent_id: '00000000-0000-4000-8000-000000000088' }],
    private_property_agency_configs: [agencyConfig],
    private_property_agent_mappings: [userMapping],
  }),
  listingId,
  environment: 'sandbox',
})
assert.equal(emailResolved.ready, true)
assert.equal(emailResolved.source, 'email')
assert.ok(emailResolved.warnings.includes('using_email_matched_private_property_agent'))

const branchDefaultResolved = await resolvePrivatePropertyAgentMapping({
  client: createFakeClient({
    private_listings: [{ ...listing, assigned_agent_id: '00000000-0000-4000-8000-000000000088', assigned_agent_email: '' }],
    private_property_agency_configs: [agencyConfig],
    private_property_agent_mappings: [branchDefault],
  }),
  listingId,
  environment: 'sandbox',
})
assert.equal(branchDefaultResolved.ready, true)
assert.equal(branchDefaultResolved.source, 'branch_default')
assert.ok(branchDefaultResolved.warnings.includes('using_branch_default_private_property_agent'))

const blocked = await resolvePrivatePropertyAgentMapping({
  client: createFakeClient({
    private_listings: [listing],
    private_property_agency_configs: [agencyConfig],
    private_property_agent_mappings: [],
  }),
  listingId,
  environment: 'sandbox',
})
assert.equal(blocked.ready, false)
assert.ok(blocked.blockers.includes('missing_private_property_agent_mapping'))

const payload = buildPrivatePropertyAgentMappingPayload({
  agencyConfigId,
  organisationId,
  branchId,
  arch9UserId,
  privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1',
  email: 'AGENT@ARCH9.TEST',
  firstName: 'Agent',
  lastName: 'One',
  mobile: '+27676125009',
})
assert.deepEqual(payload.missing, [])
assert.equal(payload.payload.email_snapshot, 'agent@arch9.test')
assert.equal(payload.payload.source_reference, arch9UserId)

const badPayload = buildPrivatePropertyAgentMappingPayload({
  agencyConfigId,
  organisationId,
  privatePropertyAgentId: 'ARCH9-SANDBOX-NO-SCOPE',
})
assert.ok(badPayload.missing.includes('arch9_user_id_or_default_scope'))

const redacted = redactPrivatePropertyAgentMapping({
  ...userMapping,
  password: 'never-store-this',
  username: 'never-return-this',
})
assert.equal(Object.hasOwn(redacted, 'password'), false)
assert.equal(Object.hasOwn(redacted, 'username'), false)
assert.equal(redacted.privatePropertyAgentId, 'ARCH9-SANDBOX-USER-1')

const insertClient = createFakeClient({ private_property_agent_mappings: [] })
const inserted = await upsertPrivatePropertyAgentMapping({
  client: insertClient,
  agencyConfigId,
  organisationId,
  branchId,
  arch9UserId,
  privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1',
  sourceReference: 'ARCH9-SANDBOX-USER-1',
  email: 'agent@arch9.test',
})
assert.equal(inserted.action, 'inserted')
assert.equal(inserted.mapping.privatePropertyAgentId, 'ARCH9-SANDBOX-USER-1')
assert.ok(insertClient.operations.some((operation) => operation.table === 'private_property_agent_mappings' && operation.type === 'insert'))

const updateClient = createFakeClient({ private_property_agent_mappings: [userMapping] })
const updated = await upsertPrivatePropertyAgentMapping({
  client: updateClient,
  agencyConfigId,
  organisationId,
  branchId,
  arch9UserId,
  privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1B',
  sourceReference: 'ARCH9-SANDBOX-USER-1',
  email: 'agent@arch9.test',
})
assert.equal(updated.action, 'updated')
assert.equal(updated.mapping.privatePropertyAgentId, 'ARCH9-SANDBOX-USER-1B')
assert.ok(updateClient.operations.some((operation) => operation.table === 'private_property_agent_mappings' && operation.type === 'update'))

const sql = read('sql/20260825_private_property_agent_mappings.sql')
assert.match(sql, /create table if not exists public\.private_property_agent_mappings/)
assert.match(sql, /agency_config_id uuid not null references public\.private_property_agency_configs\(id\) on delete cascade/)
assert.match(sql, /organisation_id uuid not null references public\.organisations\(id\) on delete cascade/)
assert.match(sql, /arch9_user_id uuid references public\.profiles\(id\) on delete set null/)
assert.match(sql, /private_property_agent_id text not null/)
assert.match(sql, /source_reference text not null/)
assert.match(sql, /environment in \('sandbox', 'production'\)/)
assert.match(sql, /create unique index if not exists private_property_agent_mappings_arch9_user_uidx/)
assert.match(sql, /create unique index if not exists private_property_agent_mappings_branch_default_uidx/)
assert.match(sql, /alter table public\.private_property_agent_mappings enable row level security/)
assert.match(sql, /revoke all on public\.private_property_agent_mappings from public, anon, authenticated/)
assert.match(sql, /grant select, insert, update, delete on public\.private_property_agent_mappings to service_role/)
assert.match(sql, /revoke all on function public\.private_property_agent_mappings_set_updated_at\(\) from public, anon, authenticated/)
assert.match(sql, /set search_path = public/)
assert.doesNotMatch(sql, /\bpassword text\b|\busername text\b|create policy/i)

const migration = fs.readFileSync(new URL('../../supabase/migrations/20260825201932_private_property_agent_mappings.sql', import.meta.url), 'utf8')
assert.equal(migration, sql)

const serviceSource = read('server/services/privatePropertyAgentMappingService.js')
assert.match(serviceSource, /resolvePrivatePropertyAgencyConfig/)
assert.match(serviceSource, /assigned_agent_id/)
assert.match(serviceSource, /assigned_agent_email/)
assert.match(serviceSource, /branch_default/)
assert.match(serviceSource, /organisation_default/)

const previewScript = read('scripts/private-property-preview-listing.mjs')
assert.match(previewScript, /resolvePrivatePropertyAgentMapping/)
assert.match(previewScript, /config\.branchGuid = config\.branchGuid \|\| resolvedMapping\.agencyConfig\?\.branchGuid/)
assert.match(previewScript, /config\.agentIds = config\.agentIds \|\| resolvedMapping\.agentMapping\?\.agentIds/)

const publishScript = read('scripts/private-property-publish-listing.mjs')
assert.match(publishScript, /resolvePrivatePropertyAgentMapping/)
assert.match(publishScript, /preview\.mappingResolution = resolvedMapping/)

const cliSource = read('scripts/private-property-upsert-agent-mapping.mjs')
assert.match(cliSource, /rawCredentialsStored: false/)
assert.match(cliSource, /upsertPrivatePropertyAgentMapping/)
assert.doesNotMatch(cliSource, /PRIVATE_PROPERTY_PASSWORD/)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['private-property:upsert-agent-mapping'], 'node scripts/private-property-upsert-agent-mapping.mjs')
assert.equal(packageJson.scripts['test:private-property-go-live-phase2-agent-mapping'], 'node scripts/private-property-phase8-agent-mapping.test.mjs')

console.log('Private Property go-live phase 2 agent mapping contract passed')
