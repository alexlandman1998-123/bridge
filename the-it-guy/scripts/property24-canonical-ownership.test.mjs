import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildProperty24AgentPayloadFromCanonicalProfile } from '../api/property24/settings/agents-create.js'
import {
  normalizeCanonicalProperty24AgentProfile,
} from '../server/property24/agentProfileService.js'
import {
  normalizeOrganisationProperty24Connection,
} from '../server/property24/organisationConnectionService.js'

const profile = normalizeCanonicalProperty24AgentProfile({
  membership: {
    id: 'membership-1',
    user_id: 'user-1',
    email: 'membership@example.com',
    first_name: 'Membership',
    last_name: 'Name',
    job_title: 'Property Practitioner',
    status: 'active',
  },
  profile: {
    id: 'user-1',
    email: 'agent@example.com',
    first_name: 'Canonical',
    last_name: 'Agent',
    phone_number: '+27 82 555 1123',
    avatar_url: 'https://cdn.example.com/agent.jpg',
  },
})

assert.equal(profile.userId, 'user-1')
assert.equal(profile.membershipId, 'membership-1')
assert.equal(profile.firstName, 'Canonical')
assert.equal(profile.lastName, 'Agent')
assert.equal(profile.email, 'agent@example.com')
assert.equal(profile.phone, '+27825551123')
assert.equal(profile.avatarUrl, 'https://cdn.example.com/agent.jpg')
assert.equal(profile.jobTitle, 'Property Practitioner')

const built = buildProperty24AgentPayloadFromCanonicalProfile({
  profile,
  body: {
    sourceReference: 'ARCH9-AGENT-001',
    agent: {
      firstName: 'Browser Override',
      email: 'browser-override@example.com',
      phone: '0111111111',
    },
  },
  connection: { agencyId: '31382' },
  env: { PROPERTY24_DEFAULT_COUNTRY_ID: '1' },
})
assert.deepEqual(built.missing, [])
assert.deepEqual(built.invalid, [])
assert.equal(built.payload.firstname, 'Canonical')
assert.equal(built.payload.lastname, 'Agent')
assert.equal(built.payload.emailAddress, 'agent@example.com')
assert.equal(built.payload.mobileNumber, '+27825551123')
assert.equal(built.payload.agencyId, 31382)

const connection = normalizeOrganisationProperty24Connection({
  property24: {
    enabled: true,
    environment: 'production',
    agencyId: '31382',
    sourceReferencePrefix: 'ARCH9',
  },
})
assert.deepEqual(connection, {
  dataOwnershipVersion: 'arch9_property24_canonical_v1',
  enabled: true,
  agencyId: '31382',
  environment: 'production',
  sourceReferencePrefix: 'ARCH9',
  configured: true,
})

const connectionServiceSource = fs.readFileSync(new URL('../server/property24/organisationConnectionService.js', import.meta.url), 'utf8')
assert.match(connectionServiceSource, /from\('property24_accounts'\)/)
assert.match(connectionServiceSource, /property24_agency_connection_mismatch/)
assert.match(connectionServiceSource, /organisation_settings_legacy/)

const publishServiceSource = fs.readFileSync(new URL('../server/property24/publishService.js', import.meta.url), 'utf8')
assert.match(publishServiceSource, /accountSettings\.agencyId && config\.explicitAgencyId/)
assert.match(publishServiceSource, /property24_agency_connection_mismatch/)
assert.match(publishServiceSource, /accountSettings\.agencyId \|\| config\.explicitAgencyId/)

const migrationSource = fs.readFileSync(new URL('../../supabase/migrations/20260831131538_property24_canonical_connection_backfill.sql', import.meta.url), 'utf8')
assert.match(migrationSource, /insert into public\.property24_accounts/)
assert.match(migrationSource, /- 'agencyId'/)
assert.match(migrationSource, /- 'enabled'/)
assert.match(migrationSource, /- 'property24Agents'/)
assert.match(migrationSource, /- 'agentMappings'/)
assert.match(migrationSource, /'property24Agents', coalesce/)
assert.match(migrationSource, /'agentMappings', coalesce/)
assert.doesNotMatch(migrationSource, /jsonb_build_object\([^;]*'email'/s)
assert.doesNotMatch(migrationSource, /jsonb_build_object\([^;]*'phone'/s)

console.log('Property24 canonical ownership contract passed')
