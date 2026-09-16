import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchOrganisationProperty24Credentials, saveOrganisationProperty24Credentials } from '../server/property24/organisationCredentialService.js'

const calls = []
const supabase = {
  rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === 'get_property24_account_credentials') {
      return { data: [{ username: 'kingdom-user', password: 'kingdom-password', user_group_id: '39227' }], error: null }
    }
    return { data: [{ credentials_configured: true, credentials_updated_at: '2026-09-16T12:00:00.000Z' }], error: null }
  },
}

const credentials = await fetchOrganisationProperty24Credentials({
  supabase,
  organisationId: '13c6b79f-1d8b-4886-aabf-42ea49565ef5',
  environment: 'production',
})
assert.deepEqual(credentials, {
  username: 'kingdom-user',
  password: 'kingdom-password',
  userGroupId: '39227',
  source: 'organisation_vault',
})

const saved = await saveOrganisationProperty24Credentials({
  supabase,
  organisationId: '13c6b79f-1d8b-4886-aabf-42ea49565ef5',
  environment: 'production',
  username: 'kingdom-user',
  password: 'kingdom-password',
  userGroupId: '39227',
})
assert.equal(saved.configured, true)
assert.equal(calls[1].name, 'set_property24_account_credentials')
assert.equal(calls[1].args.p_password, 'kingdom-password')

const migration = readFileSync(new URL('../../supabase/migrations/20260916150000_property24_organisation_credentials.sql', import.meta.url), 'utf8')
assert.match(migration, /vault\.create_secret/)
assert.match(migration, /vault\.decrypted_secrets/)
assert.match(migration, /revoke all on function public\.get_property24_account_credentials[\s\S]+from public, anon, authenticated/)
assert.match(migration, /grant execute on function public\.get_property24_account_credentials[\s\S]+to service_role/)

console.log('Property24 organisation credential contract passed')
