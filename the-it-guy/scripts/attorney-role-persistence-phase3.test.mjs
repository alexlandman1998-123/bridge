import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const repositoryRoot = path.resolve(root, '..')

function read(relativePath, base = root) {
  return readFileSync(path.join(base, relativePath), 'utf8')
}

function verifyMigrationContract() {
  const migration = read(
    'supabase/migrations/202607180037_attorney_professional_role_persistence_phase3.sql',
    repositoryRoot,
  )

  for (const column of [
    'professional_role text',
    "practice_qualifications text[] not null default '{}'::text[]",
    'organisation_user_id uuid references public.organisation_users',
    'attorney_professional_role text',
    'attorney_practice_qualifications text[]',
    'attorney_compatibility_role text',
  ]) {
    assert.ok(migration.includes(column), `Phase 3 migration is missing ${column}`)
  }

  assert.match(migration, /bridge_normalize_attorney_professional_role/)
  assert.match(migration, /bridge_normalize_attorney_practice_qualifications/)
  assert.match(migration, /bridge_attorney_professional_to_compatibility_role/)
  assert.match(migration, /when 'transfer_attorney' then 'attorney_conveyancer'/)
  assert.match(migration, /when 'bond_attorney' then 'attorney_conveyancer'/)
  assert.match(migration, /attorney_firm_members_sync_professional_profile/)
  assert.match(migration, /attorney_firm_invitations_sync_professional_profile/)
  assert.match(migration, /attorney_firm_members_sync_organisation_extension/)
  assert.match(migration, /attorney_firm_members_link_organisation_user/)
  assert.match(migration, /organisation_users_link_attorney_member_extension/)
  assert.match(migration, /update public\.attorney_firm_members[\s\S]*professional_role =/)
  assert.match(migration, /update public\.organisation_users[\s\S]*attorney_professional_role =/)
  assert.match(migration, /profiles_attorney_role_check[\s\S]*'viewer'/)
  assert.doesNotMatch(migration, /update public\.transaction_attorney_assignments/)
}

function verifyApplicationPropagation() {
  const members = read('src/services/attorneyFirmMembers.js')
  const invitations = read('src/services/attorneyFirmInvitations.js')
  const shared = read('src/services/attorneyFirmServiceShared.js')
  const settings = read('src/lib/settingsApi.js')
  const firmPage = read('src/pages/AttorneyFirmPage.jsx')

  assert.match(members, /professional_role: professionalProfile\.professionalRole/)
  assert.match(members, /practice_qualifications: professionalProfile\.practiceQualifications/)
  assert.match(invitations, /attorney_professional_role: professionalProfile\.professionalRole/)
  assert.match(invitations, /attorney_practice_qualifications: professionalProfile\.practiceQualifications/)
  assert.match(shared, /professionalRole: professionalProfile\.professionalRole/)
  assert.match(shared, /practiceQualifications: professionalProfile\.practiceQualifications/)
  assert.match(settings, /attorney_professional_role/)
  assert.match(settings, /attorney_practice_qualifications/)
  assert.match(settings, /isMissingColumnError\(usersQuery\.error, 'attorney_professional_role'\)/)
  assert.match(firmPage, /getAttorneyProfessionalRoleLabel/)
}

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const catalog = await server.ssrLoadModule('/src/constants/attorneyRoleCatalog.js')
  const {
    ATTORNEY_FIRM_ROLE_VALUES,
    ATTORNEY_PROFESSIONAL_ROLE_VALUES,
    deriveAttorneyProfessionalProfile,
    normalizeAttorneyPracticeQualifications,
    normalizeAttorneyProfessionalRole,
    resolveAttorneyCompatibilityRole,
  } = catalog

  assert.deepEqual([...ATTORNEY_PROFESSIONAL_ROLE_VALUES], [
    'firm_admin',
    'director_partner',
    'attorney_conveyancer',
    'candidate_attorney',
    'conveyancing_secretary',
    'admin_staff',
    'reception_scheduling',
    'viewer',
  ])
  assert.ok(ATTORNEY_FIRM_ROLE_VALUES.includes('viewer'))
  assert.equal(normalizeAttorneyProfessionalRole('transfer_attorney'), 'attorney_conveyancer')
  assert.equal(normalizeAttorneyProfessionalRole('bond_attorney'), 'attorney_conveyancer')
  assert.equal(normalizeAttorneyProfessionalRole('unknown'), 'viewer')
  assert.deepEqual(normalizeAttorneyPracticeQualifications(['bond', 'transfer', 'bond', 'invalid']), ['bond', 'transfer'])

  assert.deepEqual(deriveAttorneyProfessionalProfile({ role: 'transfer_attorney' }), {
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['transfer'],
  })
  assert.deepEqual(deriveAttorneyProfessionalProfile({ role: 'bond_attorney' }), {
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['bond'],
  })
  assert.deepEqual(deriveAttorneyProfessionalProfile({ role: 'not-real' }), {
    professionalRole: 'viewer',
    practiceQualifications: [],
  })
  assert.equal(resolveAttorneyCompatibilityRole({ professionalRole: 'attorney_conveyancer', practiceQualifications: ['transfer'] }), 'transfer_attorney')
  assert.equal(resolveAttorneyCompatibilityRole({ professionalRole: 'attorney_conveyancer', practiceQualifications: ['bond'] }), 'bond_attorney')
  assert.equal(resolveAttorneyCompatibilityRole({ professionalRole: 'attorney_conveyancer', practiceQualifications: [] }), 'viewer')
  assert.equal(resolveAttorneyCompatibilityRole({ professionalRole: 'viewer', practiceQualifications: ['transfer'] }), 'viewer')

  verifyMigrationContract()
  verifyApplicationPropagation()
  console.log('Attorney professional-role persistence Phase 3 verification passed.')
} finally {
  await server.close()
}
