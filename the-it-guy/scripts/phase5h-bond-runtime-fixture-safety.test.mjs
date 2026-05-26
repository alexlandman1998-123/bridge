import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFixturePlan,
  writeFixtureMetadata,
  BOND_RUNTIME_FIXTURE_NAMESPACE,
} from './seed-bond-runtime-fixtures.mjs'
import {
  assertBondRuntimeCredentials,
  buildBondRuntimeStorageState,
} from './create-bond-runtime-auth-state.mjs'
import { buildRuntimeChecklistReport } from './bond-rls-phase5h-runtime-smoke-checklist.mjs'

const DEFAULT_METADATA_PATH = '/tmp/bond-runtime-fixtures.json'
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

test('fixture seeder defaults to dry-run and represents required workspace coverage', () => {
  const plan = buildFixturePlan({})
  assert.equal(plan.executionMode, 'dry_run')
  assert.equal(plan.dryRun, true)
  assert.equal(plan.applyRequested, false)
  assert.equal(plan.workspaceType, 'bond_originator')

  const personalOriginator = plan.users.find((item) => item.roleKey === 'personal_originator_owner')
  assert.ok(personalOriginator)
  assert.equal(personalOriginator.regionId, null)
  assert.equal(personalOriginator.workspaceUnitId, null)

  assert.equal(plan.hierarchy.region.name, 'Gauteng Region')
  assert.equal(plan.hierarchy.branch.name, 'Sandton Branch')
  assert.equal(plan.hierarchy.team.name, 'Processing Team A')

  const roleKeys = new Set(plan.users.map((item) => item.roleKey))
  for (const roleKey of [
    'personal_originator_owner',
    'consultant',
    'processor',
    'compliance',
    'branch_manager',
    'regional_manager',
    'hq_manager',
    'owner',
    'director',
    'participant_only',
    'unrelated_user',
  ]) {
    assert.ok(roleKeys.has(roleKey))
  }

  const applicationKeys = new Set(plan.applications.map((item) => item.applicationKey))
  assert.ok(applicationKeys.has('accepted_unresolved_legacy'))
  assert.ok(applicationKeys.has('manual_review'))
})

test('fixture writes require explicit apply flag', () => {
  assert.throws(
    () => buildFixturePlan({ BOND_RUNTIME_FIXTURE_DRY_RUN: 'false' }),
    /BOND_RUNTIME_FIXTURE_APPLY=true/,
  )
})

test('auth bootstrap guards against attorney reuse and missing credentials', () => {
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
})

test('runtime checklist hard-fails on missing or expired auth state and passes with valid Bond fixture inputs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bond-runtime-phase5h-'))
  const metadataPath = path.join(tmpDir, 'fixtures.json')
  const missingAuthPath = path.join(tmpDir, 'missing-auth.json')

  const plan = buildFixturePlan({ BOND_RUNTIME_FIXTURE_METADATA: metadataPath })
  writeFixtureMetadata(plan, metadataPath)

  assert.throws(
    () => buildRuntimeChecklistReport({ metadataPath, authStatePath: missingAuthPath }),
    /Bond runtime auth state missing/,
  )

  const expiredAuthPath = path.join(tmpDir, 'expired-auth.json')
  const expiredStorageState = buildBondRuntimeStorageState({
    projectRef: 'isdowlnollckzvltkasn',
    session: createMockSession({
      email: 'bond-runtime+consultant@bridgenine.co.za',
      userId: 'b0bd5000-0000-4000-8000-000000000106',
      expiresAtUnix: Math.floor(Date.now() / 1000) - 60,
    }),
  })
  fs.writeFileSync(expiredAuthPath, `${JSON.stringify(expiredStorageState, null, 2)}\n`)

  assert.throws(
    () => buildRuntimeChecklistReport({ metadataPath, authStatePath: expiredAuthPath }),
    /Bond runtime auth state expired/,
  )

  const readyAuthPath = path.join(tmpDir, 'ready-auth.json')
  const readyStorageState = buildBondRuntimeStorageState({
    projectRef: 'isdowlnollckzvltkasn',
    session: createMockSession({
      email: 'bond-runtime+consultant@bridgenine.co.za',
      userId: 'b0bd5000-0000-4000-8000-000000000106',
      expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
    }),
  })
  fs.writeFileSync(readyAuthPath, `${JSON.stringify(readyStorageState, null, 2)}\n`)

  const report = buildRuntimeChecklistReport({ metadataPath, authStatePath: readyAuthPath })
  assert.equal(report.runtimeReady, true)
  assert.equal(report.dashboardSmoke, 'pending_manual_execution')
  assert.equal(report.runtimeFixtureStatus.fixtureNamespace, BOND_RUNTIME_FIXTURE_NAMESPACE)
})

test('safety test prepares default temp inputs for checklist validation command', () => {
  const plan = buildFixturePlan({ BOND_RUNTIME_FIXTURE_METADATA: DEFAULT_METADATA_PATH })
  writeFixtureMetadata(plan, DEFAULT_METADATA_PATH)

  const readyStorageState = buildBondRuntimeStorageState({
    projectRef: 'isdowlnollckzvltkasn',
    session: createMockSession({
      email: 'bond-runtime+consultant@bridgenine.co.za',
      userId: 'b0bd5000-0000-4000-8000-000000000106',
      expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
    }),
  })
  fs.writeFileSync(DEFAULT_AUTH_STATE_PATH, `${JSON.stringify(readyStorageState, null, 2)}\n`)

  const report = buildRuntimeChecklistReport({
    metadataPath: DEFAULT_METADATA_PATH,
    authStatePath: DEFAULT_AUTH_STATE_PATH,
  })
  assert.equal(report.runtimeReady, true)
  assert.equal(report.runtimeFixtureStatus.authStateEmail, 'bond-runtime+consultant@bridgenine.co.za')
})
