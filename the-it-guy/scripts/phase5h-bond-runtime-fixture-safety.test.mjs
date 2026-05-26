import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFixturePlan,
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

function createMockApplyAdapter({ includeAllUsers = false } = {}) {
  return {
    async getTableColumns(table) {
      if (table === 'organisations') {
        return ['id', 'name', 'display_name', 'slug', 'type', 'workspace_type', 'workspace_kind', 'metadata']
      }
      return null
    },
    async lookupUsersByEmails(emails = []) {
      return new Map(
        emails
          .filter((email) => includeAllUsers || (!email.includes('+participant@') && !email.includes('+unrelated@')))
          .map((email, index) => [email, { id: `auth-user-${index + 1}`, email }]),
      )
    },
    async upsertRows(_table, rows = []) {
      return {
        data: rows.map((row) => ({ id: row.id || `${_table}-id` })),
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
  const dryRunMetadataPath = path.join(tmpDir, 'dry-run.json')
  writeFixtureMetadata(buildFixturePlan({ BOND_RUNTIME_FIXTURE_METADATA: dryRunMetadataPath }), dryRunMetadataPath)

  const dryRunReport = buildRuntimeChecklistReport({
    metadataPath: dryRunMetadataPath,
    authStatePath: path.join(tmpDir, 'missing-auth.json'),
  })
  assert.equal(dryRunReport.runtimeReady, false)
  assert.equal(dryRunReport.blocked, 'fixture_not_applied')

  const { report: appliedReport } = await runSeeder(
    {
      BOND_RUNTIME_FIXTURE_APPLY: 'true',
      BOND_RUNTIME_FIXTURE_TARGET: 'staging',
      SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
      BOND_RUNTIME_FIXTURE_METADATA: path.join(tmpDir, 'applied.json'),
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
  const appliedMetadataPath = path.join(tmpDir, 'applied.json')
  writeFixtureMetadata(appliedReport, appliedMetadataPath)

  const fakeAuthPath = path.join(tmpDir, 'fake-auth.json')
  fs.writeFileSync(
    fakeAuthPath,
    `${JSON.stringify(
      buildBondRuntimeStorageState({
        projectRef: STAGING_PROJECT_REF,
        session: createMockSession({
          email: 'bond-runtime+consultant@bridgenine.co.za',
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
      adapter: createMockApplyAdapter({ includeAllUsers: true }),
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
          email: 'bond-runtime+consultant@bridgenine.co.za',
          userId: 'auth-user-1',
          expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
        }),
        meta: {
          source: 'real_staging_auth_bootstrap',
          fixtureNamespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
          generatedAt: new Date().toISOString(),
          email: 'bond-runtime+consultant@bridgenine.co.za',
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
