import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ALLOWED_ORGANISATION_USER_ROLE_VALUES,
  buildFixturePlan,
  mapCanonicalBondWorkspaceRoleToLegacyOrganisationUserRole,
  prepareRowsForUpsert,
  runSeeder,
  writeFixtureMetadata,
  BOND_RUNTIME_FIXTURE_NAMESPACE,
  STAGING_PROJECT_REF,
} from './seed-bond-runtime-fixtures.mjs'
import {
  assertBondRuntimeCredentials,
  assertFixtureUserIncluded,
  buildBondRuntimeStorageState,
  resolveAuthConfig,
} from './create-bond-runtime-auth-state.mjs'
import { buildRuntimeChecklistReport } from './bond-rls-phase5h-runtime-smoke-checklist.mjs'

const DEFAULT_AUTH_STATE_PATH = '/tmp/bond-runtime-auth-state.json'

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getFixtureUserByRole(report, roleKey) {
  return (report.users || []).find((item) => item.roleKey === roleKey) || null
}

function createMockSession({ email, userId, expiresAtUnix }) {
  return {
    access_token: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${Buffer.from(
      JSON.stringify({
        sub: userId,
        email,
        exp: expiresAtUnix,
        user_metadata: { fixture_namespace: BOND_RUNTIME_FIXTURE_NAMESPACE },
      }),
    ).toString('base64url')}.`,
    refresh_token: 'bond-runtime-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAtUnix,
    user: {
      id: userId,
      email,
      user_metadata: {
        fixture_namespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
      },
    },
  }
}

function createMockApplyAdapter({ missingEmails = [] } = {}) {
  const normalizedMissingEmails = new Set(missingEmails.map((email) => String(email || '').trim().toLowerCase()))
  const writes = []

  return {
    writes,
    async getTableColumns(table) {
      if (table === 'organisations') {
        return ['id', 'name', 'display_name', 'slug', 'type', 'workspace_type', 'workspace_kind', 'metadata']
      }
      return null
    },
    async lookupUsersByEmails(emails = []) {
      return new Map(
        emails
          .map((email) => String(email || '').trim().toLowerCase())
          .filter((email) => !normalizedMissingEmails.has(email))
          .map((email, index) => [email, { id: `auth-user-${index + 1}`, email }]),
      )
    },
    async upsertRows(table, rows = []) {
      writes.push({
        table,
        rows: rows.map((row) => ({ ...row })),
      })
      return {
        data: rows.map((row) => ({ id: row.id || `${table}-id` })),
        skippedColumns: [],
      }
    },
  }
}

test('dry-run remains default and personal originator stays branchless', () => {
  const plan = buildFixturePlan({})
  assert.equal(plan.executionMode, 'dry_run')
  assert.equal(plan.dryRun, true)
  assert.equal(plan.applied, false)
  assert.equal(plan.applyReason, 'fixture_not_applied')

  const personalOriginator = plan.users.find((item) => item.roleKey === 'personal_originator_owner')
  assert.ok(personalOriginator)
  assert.equal(personalOriginator.regionId, null)
  assert.equal(personalOriginator.workspaceUnitId, null)
})

test('apply requires explicit apply flag and staging target', () => {
  assert.throws(
    () => buildFixturePlan({ BOND_RUNTIME_FIXTURE_DRY_RUN: 'false' }),
    /BOND_RUNTIME_FIXTURE_APPLY=true/,
  )
  assert.throws(
    () => buildFixturePlan({ BOND_RUNTIME_FIXTURE_APPLY: 'true', BOND_RUNTIME_FIXTURE_TARGET: 'production' }),
    /outside staging target/,
  )
})

test('apply without service role config hard-fails', async () => {
  await assert.rejects(
    () =>
      runSeeder({
        BOND_RUNTIME_FIXTURE_APPLY: 'true',
        BOND_RUNTIME_FIXTURE_TARGET: 'staging',
        SUPABASE_SERVICE_ROLE_KEY: '',
      }),
    /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required/,
  )
})

test('apply metadata reports applied true only after real write path', async () => {
  const { report } = await runSeeder(
    {
      BOND_RUNTIME_FIXTURE_APPLY: 'true',
      BOND_RUNTIME_FIXTURE_TARGET: 'staging',
      SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    },
    {
      adapter: createMockApplyAdapter(),
      applyConfig: {
        supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
        serviceRoleKey: 'service-role-placeholder',
        projectRef: STAGING_PROJECT_REF,
        target: 'staging',
      },
    },
  )

  assert.equal(report.executionMode, 'apply')
  assert.equal(report.applied, true)
  assert.equal(report.target, 'staging')
  assert.equal(report.applyReason, null)
  assert.ok(report.createdOrUpdated.organisations.rowCount >= 2)
})

test('canonical Bond workspace roles map to allowed organisation_users.role values', () => {
  const expectedMappings = {
    owner: 'admin',
    director: 'admin',
    hq_manager: 'admin',
    regional_manager: 'admin',
    branch_manager: 'branch_manager',
    team_lead: 'branch_manager',
    consultant: 'bond_originator',
    processor: 'bond_originator',
    compliance: 'bond_originator',
    admin_staff: 'admin',
  }

  for (const [workspaceRole, legacyRole] of Object.entries(expectedMappings)) {
    assert.equal(mapCanonicalBondWorkspaceRoleToLegacyOrganisationUserRole(workspaceRole), legacyRole)
    assert.ok(ALLOWED_ORGANISATION_USER_ROLE_VALUES.includes(legacyRole))
  }

  assert.equal(mapCanonicalBondWorkspaceRoleToLegacyOrganisationUserRole('bond_originator'), 'bond_originator')
  assert.equal(mapCanonicalBondWorkspaceRoleToLegacyOrganisationUserRole('admin'), 'admin')
  assert.throws(
    () => mapCanonicalBondWorkspaceRoleToLegacyOrganisationUserRole('not_a_real_role'),
    /cannot map workspace role/i,
  )
})

test('organisation_users writes only allowed legacy role values while preserving canonical role fields', async () => {
  const adapter = createMockApplyAdapter()
  const { report } = await runSeeder(
    {
      BOND_RUNTIME_FIXTURE_APPLY: 'true',
      BOND_RUNTIME_FIXTURE_TARGET: 'staging',
      SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
    },
    {
      adapter,
      applyConfig: {
        supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
        serviceRoleKey: 'service-role-placeholder',
        projectRef: STAGING_PROJECT_REF,
        target: 'staging',
      },
    },
  )

  const membershipWrite = adapter.writes.find((entry) => entry.table === 'organisation_users')
  assert.ok(membershipWrite)
  assert.equal(membershipWrite.rows.length, report.createdOrUpdated.organisationUsers.rowCount)

  for (const row of membershipWrite.rows) {
    assert.ok(ALLOWED_ORGANISATION_USER_ROLE_VALUES.includes(row.role))
    assert.ok(row.workspace_role)
    assert.equal(row.organisation_role, row.workspace_role)
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'branch_id'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'primary_branch_id'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'branch_scope'), false)
    assert.equal(typeof row.scope_metadata?.canonical_workspace_role, 'string')
    assert.equal(typeof row.scope_metadata?.legacy_membership_role, 'string')
    assert.equal(row.scope_metadata.legacy_membership_role, row.role)
    assert.equal(row.scope_metadata.organisation_branch_id, null)
    assert.equal(row.scope_metadata.organisation_branch_linked, false)
  }

  const ownerRow = membershipWrite.rows.find((row) => row.workspace_role === 'owner')
  assert.ok(ownerRow)
  assert.equal(ownerRow.role, 'admin')

  const branchManagerRow = membershipWrite.rows.find((row) => row.workspace_role === 'branch_manager')
  assert.ok(branchManagerRow)
  assert.equal(branchManagerRow.role, 'branch_manager')
  assert.ok(branchManagerRow.workspace_unit_id)
  assert.equal(Object.prototype.hasOwnProperty.call(branchManagerRow, 'branch_id'), false)

  const processorRow = membershipWrite.rows.find((row) => row.workspace_role === 'processor')
  assert.ok(processorRow)
  assert.equal(processorRow.role, 'bond_originator')
  assert.ok(processorRow.workspace_unit_id)

  const branchScopedUser = membershipWrite.rows.find((row) => row.workspace_role === 'consultant')
  assert.ok(branchScopedUser)
  assert.ok(branchScopedUser.workspace_unit_id)

  const regionalManagerRow = membershipWrite.rows.find((row) => row.workspace_role === 'regional_manager')
  assert.ok(regionalManagerRow)
  assert.ok(regionalManagerRow.region_id)
  assert.equal(regionalManagerRow.workspace_unit_id, null)

  const personalOriginatorRow = membershipWrite.rows.find((row) => row.workspace_role === 'owner' && row.organisation_id !== ownerRow.organisation_id)
  assert.ok(personalOriginatorRow)
  assert.equal(personalOriginatorRow.workspace_unit_id, null)
  assert.equal(Object.prototype.hasOwnProperty.call(personalOriginatorRow, 'branch_id'), false)
})

test('apply hard-fails before document_requests when a required fixture user is missing', async () => {
  const consultantUser = getFixtureUserByRole(buildFixturePlan({}), 'consultant')
  assert.ok(consultantUser?.email)
  const adapter = createMockApplyAdapter({
    missingEmails: [consultantUser.email],
  })

  await assert.rejects(
    () =>
      runSeeder(
        {
          BOND_RUNTIME_FIXTURE_APPLY: 'true',
          BOND_RUNTIME_FIXTURE_TARGET: 'staging',
          SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
        },
        {
          adapter,
          applyConfig: {
            supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
            serviceRoleKey: 'service-role-placeholder',
            projectRef: STAGING_PROJECT_REF,
            target: 'staging',
          },
        },
      ),
    new RegExp(`Missing required Bond runtime users:\\n- consultant: ${escapeRegExp(consultantUser.email)}`),
  )

  assert.equal(adapter.writes.some((entry) => entry.table === 'document_requests'), false)
  assert.equal(adapter.writes.length, 0)
})

test('bond company hierarchy, all roles, and all runtime scenarios are represented', () => {
  const plan = buildFixturePlan({})
  assert.equal(plan.hierarchy.region.name, 'Gauteng Region')
  assert.equal(plan.hierarchy.branch.name, 'Sandton Branch')
  assert.equal(plan.hierarchy.team.name, 'Processing Team A')

  const roleKeys = new Set(plan.users.map((item) => item.roleKey))
  for (const roleKey of [
    'personal_originator_owner',
    'owner',
    'director',
    'hq_manager',
    'regional_manager',
    'branch_manager',
    'consultant',
    'processor',
    'compliance',
    'participant_only',
    'unrelated_user',
  ]) {
    assert.ok(roleKeys.has(roleKey))
  }

  const applicationKeys = new Set(plan.applications.map((item) => item.applicationKey))
  for (const applicationKey of [
    'canonical_consultant_assigned',
    'canonical_processor_assigned',
    'canonical_compliance_assigned',
    'branch_scoped',
    'region_scoped',
    'hq_visible',
    'personal_originator_application',
    'legacy_email_only',
    'participant_only',
    'accepted_unresolved_legacy',
    'manual_review',
    'unrelated_application',
  ]) {
    assert.ok(applicationKeys.has(applicationKey))
  }
})

test('acceptedUnresolvedLegacy and manualReview rows are represented', () => {
  const plan = buildFixturePlan({})
  const exclusionTypes = new Set(plan.exclusions.map((item) => item.exclusionType))
  assert.ok(exclusionTypes.has('accepted_unresolved_legacy'))
  assert.ok(exclusionTypes.has('manual_review'))
  assert.ok(exclusionTypes.has('legacy_compatibility_required'))
})

test('organisation fixture payload does not require is_active and filters optional unknown columns', () => {
  const rows = [
    {
      id: 'org-1',
      name: 'Bond Runtime Test Company',
      display_name: 'Bond Runtime Test Company',
      metadata: { fixture: true },
      active: true,
      is_active: true,
      unknown_column: 'ignore-me',
    },
  ]

  const prepared = prepareRowsForUpsert('organisations', rows, {
    knownColumns: ['id', 'name', 'display_name', 'metadata', 'active'],
  })

  assert.deepEqual(Object.keys(prepared.rows[0]).sort(), ['active', 'display_name', 'id', 'metadata', 'name'])
  assert.ok(prepared.omittedColumns.includes('is_active'))
  assert.ok(prepared.omittedColumns.includes('unknown_column'))
})

test('required columns still hard-fail if schema introspection reports them missing', () => {
  assert.throws(
    () =>
      prepareRowsForUpsert(
        'organisations',
        [
          {
            id: 'org-1',
            name: 'Bond Runtime Test Company',
          },
        ],
        { knownColumns: ['id'] },
      ),
    /required columns are missing: name/,
  )
})

test('auth bootstrap rejects attorney fixture, missing credentials, and users not in Bond metadata', () => {
  assert.throws(
    () => assertBondRuntimeCredentials({ email: '', password: '', outputPath: DEFAULT_AUTH_STATE_PATH }),
    /BOND_RUNTIME_AUTH_EMAIL and BOND_RUNTIME_AUTH_PASSWORD are required/,
  )
  assert.throws(
    () =>
      assertBondRuntimeCredentials({
        email: 'qa.attorney+canonical@bridgenine.co.za',
        password: 'secret',
        outputPath: DEFAULT_AUTH_STATE_PATH,
      }),
    /cannot reuse the attorney canonical fixture account/,
  )

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bond-runtime-auth-meta-'))
  const metadataPath = path.join(tmpDir, 'fixtures.json')
  writeFixtureMetadata(buildFixturePlan({ BOND_RUNTIME_FIXTURE_METADATA: metadataPath }), metadataPath)
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))

  assert.throws(
    () => assertFixtureUserIncluded(metadata, 'not-in-fixture@example.test'),
    /is not present in fixture metadata/,
  )
  assert.throws(
    () =>
      resolveAuthConfig({
        SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
        VITE_SUPABASE_ANON_KEY: 'anon-placeholder',
        BOND_RUNTIME_AUTH_EMAIL: 'not-in-fixture@example.test',
        BOND_RUNTIME_AUTH_PASSWORD: 'secret',
        BOND_RUNTIME_AUTH_STATE_PATH: path.join(tmpDir, 'auth.json'),
        BOND_RUNTIME_FIXTURE_METADATA: metadataPath,
      }),
    /is not present in fixture metadata/,
  )
})

test('runtime checklist blocks dry-run metadata, fake auth, and requires applied fixture metadata', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bond-runtime-phase5h-'))
  const fixturePlan = buildFixturePlan({})
  const consultantUser = getFixtureUserByRole(fixturePlan, 'consultant')
  const participantOnlyUser = getFixtureUserByRole(fixturePlan, 'participant_only')
  const unrelatedUser = getFixtureUserByRole(fixturePlan, 'unrelated_user')
  assert.ok(consultantUser?.email)
  assert.ok(participantOnlyUser?.email)
  assert.ok(unrelatedUser?.email)
  const dryRunMetadataPath = path.join(tmpDir, 'dry-run.json')
  writeFixtureMetadata({ ...fixturePlan, metadataPath: dryRunMetadataPath }, dryRunMetadataPath)

  const dryRunReport = buildRuntimeChecklistReport({
    metadataPath: dryRunMetadataPath,
    authStatePath: path.join(tmpDir, 'missing-auth.json'),
  })
  assert.equal(dryRunReport.runtimeReady, false)
  assert.equal(dryRunReport.blocked, 'fixture_not_applied')

  const appliedMetadataPath = path.join(tmpDir, 'applied.json')
  const appliedReport = {
    ...fixturePlan,
    metadataPath: appliedMetadataPath,
    executionMode: 'apply',
    applied: true,
    applyReason: null,
    missingAuthUsers: [
      {
        role: 'participant_only',
        email: participantOnlyUser.email,
        requiredForRuntimeSmoke: true,
      },
      {
        role: 'unrelated_user',
        email: unrelatedUser.email,
        requiredForRuntimeSmoke: true,
      },
    ],
  }
  writeFixtureMetadata(appliedReport, appliedMetadataPath)

  const fakeAuthPath = path.join(tmpDir, 'fake-auth.json')
  fs.writeFileSync(
    fakeAuthPath,
    `${JSON.stringify(
      buildBondRuntimeStorageState({
        projectRef: STAGING_PROJECT_REF,
        session: createMockSession({
          email: consultantUser.email,
          userId: 'auth-user-1',
          expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
        }),
      }),
      null,
      2,
    )}\n`,
  )

  const fakeAuthReport = buildRuntimeChecklistReport({
    metadataPath: appliedMetadataPath,
    authStatePath: fakeAuthPath,
  })
  assert.equal(fakeAuthReport.runtimeReady, false)
  assert.equal(fakeAuthReport.blocked, 'missing_auth_users')

  const { report: fullyHydratedReport } = await runSeeder(
    {
      BOND_RUNTIME_FIXTURE_APPLY: 'true',
      BOND_RUNTIME_FIXTURE_TARGET: 'staging',
      SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
      BOND_RUNTIME_FIXTURE_METADATA: path.join(tmpDir, 'fully-hydrated.json'),
    },
    {
      adapter: createMockApplyAdapter(),
      applyConfig: {
        supabaseUrl: `https://${STAGING_PROJECT_REF}.supabase.co`,
        serviceRoleKey: 'service-role-placeholder',
        projectRef: STAGING_PROJECT_REF,
        target: 'staging',
      },
    },
  )
  const fullyHydratedMetadataPath = path.join(tmpDir, 'fully-hydrated.json')
  writeFixtureMetadata(fullyHydratedReport, fullyHydratedMetadataPath)
  const hydratedConsultant = getFixtureUserByRole(fullyHydratedReport, 'consultant')
  assert.ok(hydratedConsultant?.email)
  assert.ok(fullyHydratedReport.resolvedUserIds.consultant)

  const fakeAuthAgainstHydratedReport = buildRuntimeChecklistReport({
    metadataPath: fullyHydratedMetadataPath,
    authStatePath: fakeAuthPath,
  })
  assert.equal(fakeAuthAgainstHydratedReport.runtimeReady, false)
  assert.equal(fakeAuthAgainstHydratedReport.blocked, 'auth_not_real_staging')

  const realAuthPath = path.join(tmpDir, 'real-auth.json')
  fs.writeFileSync(
    realAuthPath,
    `${JSON.stringify(
      buildBondRuntimeStorageState({
        projectRef: STAGING_PROJECT_REF,
        session: createMockSession({
          email: hydratedConsultant.email,
          userId: fullyHydratedReport.resolvedUserIds.consultant,
          expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
        }),
        meta: {
          source: 'real_staging_auth_bootstrap',
          fixtureNamespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
          generatedAt: new Date().toISOString(),
          email: hydratedConsultant.email,
          stagingVerified: true,
        },
      }),
      null,
      2,
    )}\n`,
  )

  const readyReport = buildRuntimeChecklistReport({
    metadataPath: fullyHydratedMetadataPath,
    authStatePath: realAuthPath,
  })
  assert.equal(readyReport.runtimeReady, true)
  assert.equal(readyReport.blocked, null)
})
