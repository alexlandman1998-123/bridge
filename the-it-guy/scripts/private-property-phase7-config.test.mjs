import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_AGENCY_CONFIG_SERVICE_VERSION,
  buildPrivatePropertyAgencyConfigReadiness,
  redactPrivatePropertyAgencyConfig,
  resolvePrivatePropertyAgencyConfig,
  resolvePrivatePropertyRuntimeCredentials,
  upsertPrivatePropertyAgencyConfig,
} from '../server/services/privatePropertyAgencyConfigService.js'

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
const otherBranchId = '00000000-0000-4000-8000-000000000003'
const listingId = '00000000-0000-4000-8000-000000000004'

const defaultConfig = {
  id: '00000000-0000-4000-8000-000000000010',
  organisation_id: organisationId,
  branch_id: null,
  environment: 'sandbox',
  vendor_name: 'Arch9',
  branch_guid: '11111111-1111-4111-8111-111111111111',
  username_secret_name: 'PRIVATE_PROPERTY_SANDBOX_USERNAME',
  password_secret_name: 'PRIVATE_PROPERTY_SANDBOX_PASSWORD',
  enabled: true,
  status: 'sandbox_ready',
}
const branchConfig = {
  ...defaultConfig,
  id: '00000000-0000-4000-8000-000000000011',
  branch_id: branchId,
  branch_guid: '22222222-2222-4222-8222-222222222222',
  username_secret_name: 'PRODUKTIVE_PRIVATE_PROPERTY_USERNAME',
  password_secret_name: 'PRODUKTIVE_PRIVATE_PROPERTY_PASSWORD',
}

const resolvedBranch = await resolvePrivatePropertyAgencyConfig({
  client: createFakeClient({
    private_listings: [{ id: listingId, organisation_id: organisationId, branch_id: branchId }],
    private_property_agency_configs: [defaultConfig, branchConfig],
  }),
  listingId,
  environment: 'sandbox',
})

assert.equal(resolvedBranch.version, PRIVATE_PROPERTY_AGENCY_CONFIG_SERVICE_VERSION)
assert.equal(resolvedBranch.ready, true)
assert.equal(resolvedBranch.source, 'private_property_agency_configs.branch')
assert.equal(resolvedBranch.config.branchGuid, '22222222-2222-4222-8222-222222222222')
assert.equal(resolvedBranch.config.usernameSecretName, 'PRODUKTIVE_PRIVATE_PROPERTY_USERNAME')
assert.deepEqual(resolvedBranch.blockers, [])

const resolvedDefault = await resolvePrivatePropertyAgencyConfig({
  client: createFakeClient({
    private_listings: [{ id: listingId, organisation_id: organisationId, branch_id: otherBranchId }],
    private_property_agency_configs: [defaultConfig],
  }),
  listingId,
  environment: 'sandbox',
})

assert.equal(resolvedDefault.ready, true)
assert.equal(resolvedDefault.source, 'private_property_agency_configs.organisation_default')
assert.ok(resolvedDefault.warnings.includes('using_organisation_default_private_property_config'))

const disabledReadiness = buildPrivatePropertyAgencyConfigReadiness({
  ...defaultConfig,
  enabled: false,
  status: 'pending',
})
assert.equal(disabledReadiness.ready, false)
assert.ok(disabledReadiness.blockers.includes('private_property_config_disabled'))
assert.ok(disabledReadiness.blockers.includes('private_property_config_not_approved'))

const productionReadiness = buildPrivatePropertyAgencyConfigReadiness({
  ...defaultConfig,
  environment: 'production',
  status: 'approved',
  base_url: 'https://services.privateproperty.example/AgentImport/AgentImport.asmx',
  go_live_approved_at: '',
})
assert.equal(productionReadiness.ready, false)
assert.ok(productionReadiness.blockers.includes('private_property_production_go_live_not_approved'))

const redacted = redactPrivatePropertyAgencyConfig({
  ...branchConfig,
  password: 'never-store-this',
  username: 'also-not-returned',
})
assert.equal(Object.hasOwn(redacted, 'password'), false)
assert.equal(Object.hasOwn(redacted, 'username'), false)
assert.equal(redacted.passwordSecretName, 'PRODUKTIVE_PRIVATE_PROPERTY_PASSWORD')

const credentials = resolvePrivatePropertyRuntimeCredentials(branchConfig, {
  PRODUKTIVE_PRIVATE_PROPERTY_USERNAME: 'PrivatePropertyUser',
  PRODUKTIVE_PRIVATE_PROPERTY_PASSWORD: 'private-password-value',
})
assert.equal(credentials.username, 'PrivatePropertyUser')
assert.equal(credentials.password, 'private-password-value')
assert.deepEqual(credentials.missingSecrets, [])
assert.equal(credentials.redacted.usernamePresent, true)
assert.equal(credentials.redacted.passwordPresent, true)

const missingCredentials = resolvePrivatePropertyRuntimeCredentials(branchConfig, {})
assert.deepEqual(missingCredentials.missingSecrets, [
  'PRODUKTIVE_PRIVATE_PROPERTY_USERNAME',
  'PRODUKTIVE_PRIVATE_PROPERTY_PASSWORD',
])

const insertClient = createFakeClient({ private_property_agency_configs: [] })
const inserted = await upsertPrivatePropertyAgencyConfig({
  client: insertClient,
  organisationId,
  branchId,
  environment: 'sandbox',
  branchGuid: '33333333-3333-4333-8333-333333333333',
  usernameSecretName: 'PRODUKTIVE_PRIVATE_PROPERTY_USERNAME',
  passwordSecretName: 'PRODUKTIVE_PRIVATE_PROPERTY_PASSWORD',
  enabled: 'true',
  status: 'sandbox_ready',
})
assert.equal(inserted.action, 'inserted')
assert.equal(inserted.config.enabled, true)
assert.equal(inserted.config.branchGuid, '33333333-3333-4333-8333-333333333333')
assert.ok(insertClient.operations.some((operation) => operation.type === 'insert'))

const updateClient = createFakeClient({ private_property_agency_configs: [branchConfig] })
const updated = await upsertPrivatePropertyAgencyConfig({
  client: updateClient,
  organisationId,
  branchId,
  environment: 'sandbox',
  branchGuid: '44444444-4444-4444-8444-444444444444',
  usernameSecretName: 'PRODUKTIVE_PRIVATE_PROPERTY_USERNAME',
  passwordSecretName: 'PRODUKTIVE_PRIVATE_PROPERTY_PASSWORD',
  enabled: 'false',
  status: 'disabled',
})
assert.equal(updated.action, 'updated')
assert.equal(updated.config.enabled, false)
assert.equal(updated.config.branchGuid, '44444444-4444-4444-8444-444444444444')
assert.ok(updateClient.operations.some((operation) => operation.type === 'update'))

const sql = read('sql/20260825_private_property_agency_configs.sql')
assert.match(sql, /create table if not exists public\.private_property_agency_configs/)
assert.match(sql, /organisation_id uuid not null references public\.organisations\(id\) on delete cascade/)
assert.match(sql, /branch_id uuid references public\.organisation_branches\(id\) on delete cascade/)
assert.match(sql, /branch_guid uuid not null/)
assert.match(sql, /username_secret_name text not null/)
assert.match(sql, /password_secret_name text not null/)
assert.match(sql, /environment in \('sandbox', 'production'\)/)
assert.match(sql, /alter table public\.private_property_agency_configs enable row level security/)
assert.match(sql, /revoke all on public\.private_property_agency_configs from public, anon, authenticated/)
assert.match(sql, /grant select, insert, update, delete on public\.private_property_agency_configs to service_role/)
assert.match(sql, /revoke all on function public\.private_property_agency_configs_set_updated_at\(\) from public, anon, authenticated/)
assert.match(sql, /set search_path = public/)
assert.doesNotMatch(sql, /\bpassword text\b|\busername text\b|create policy/i)

const migration = fs.readFileSync(new URL('../../supabase/migrations/20260825201001_private_property_agency_configs.sql', import.meta.url), 'utf8')
assert.equal(migration, sql)

const packageJson = JSON.parse(read('package.json'))
assert.equal(packageJson.scripts['test:private-property-go-live-phase1-config'], 'node scripts/private-property-phase7-config.test.mjs')
assert.equal(packageJson.scripts['private-property:upsert-agency-config'], 'node scripts/private-property-upsert-agency-config.mjs')

console.log('Private Property go-live phase 1 config contract passed')
