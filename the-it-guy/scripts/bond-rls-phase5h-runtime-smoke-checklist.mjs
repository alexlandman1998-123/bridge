import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_METADATA_PATH = process.env.BOND_RUNTIME_FIXTURE_METADATA || '/tmp/bond-runtime-fixtures.json'
const DEFAULT_AUTH_STATE_PATH = process.env.BOND_RUNTIME_AUTH_STATE_PATH || '/tmp/bond-runtime-auth-state.json'
const BOND_RUNTIME_FIXTURE_NAMESPACE = 'bond_runtime_phase5h'
const ATTORNEY_FIXTURE_EMAIL = 'qa.attorney+canonical@bridgenine.co.za'
const REQUIRED_ROLE_KEYS = [
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
]
const REQUIRED_APPLICATION_KEYS = [
  'consultant_assigned',
  'processor_assigned',
  'compliance_assigned',
  'branch_scoped',
  'region_scoped',
  'hq_visible',
  'personal_originator',
  'legacy_email_only',
  'participant_only',
  'accepted_unresolved_legacy',
  'manual_review',
  'unrelated_application',
]

function safeReadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} missing at ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export function readRuntimeFixtureMetadata(filePath = DEFAULT_METADATA_PATH) {
  const metadata = safeReadJson(filePath, 'Bond runtime fixture metadata')
  if (metadata.fixtureNamespace !== BOND_RUNTIME_FIXTURE_NAMESPACE) {
    throw new Error(`Bond runtime fixture metadata is not a ${BOND_RUNTIME_FIXTURE_NAMESPACE} payload`)
  }
  if (!Array.isArray(metadata.workspaces) || !metadata.workspaces.every((item) => item.workspaceType === 'bond_originator')) {
    throw new Error('Bond runtime fixture metadata must contain only bond_originator workspaces')
  }

  const roleKeys = new Set((metadata.users || []).map((item) => item.roleKey))
  for (const roleKey of REQUIRED_ROLE_KEYS) {
    if (!roleKeys.has(roleKey)) {
      throw new Error(`Bond runtime fixture metadata missing required role ${roleKey}`)
    }
  }

  const applicationKeys = new Set((metadata.applications || []).map((item) => item.applicationKey))
  for (const applicationKey of REQUIRED_APPLICATION_KEYS) {
    if (!applicationKeys.has(applicationKey)) {
      throw new Error(`Bond runtime fixture metadata missing required application ${applicationKey}`)
    }
  }

  const personalOriginator = (metadata.users || []).find((item) => item.roleKey === 'personal_originator_owner')
  if (!personalOriginator || personalOriginator.regionId || personalOriginator.workspaceUnitId) {
    throw new Error('Bond runtime personal_originator fixture must remain branchless and regionless')
  }

  return metadata
}

export function readRuntimeAuthState(filePath = DEFAULT_AUTH_STATE_PATH) {
  const authState = safeReadJson(filePath, 'Bond runtime auth state')
  const originEntry = (authState.origins || []).find((item) => item.origin === 'https://app.bridgenine.co.za')
  const tokenEntry = originEntry?.localStorage?.find((item) => String(item.name || '').includes('auth-token'))
  if (!tokenEntry) {
    throw new Error('Bond runtime auth state is missing the Bridge auth token entry')
  }

  const session = JSON.parse(tokenEntry.value)
  const payload = decodeJwtPayload(session?.access_token)
  const email = session?.user?.email || payload?.email || null
  const expiresAtIso =
    typeof session?.expires_at === 'number' ? new Date(session.expires_at * 1000).toISOString() : null

  if (!email) {
    throw new Error('Bond runtime auth state is missing the authenticated user email')
  }
  if (email === ATTORNEY_FIXTURE_EMAIL) {
    throw new Error('Bond runtime auth state cannot reuse the attorney canonical fixture account')
  }
  if (!expiresAtIso) {
    throw new Error('Bond runtime auth state is missing an expiry timestamp')
  }
  if (Date.now() > Date.parse(expiresAtIso)) {
    throw new Error(`Bond runtime auth state expired at ${expiresAtIso}`)
  }

  const fixtureNamespace =
    session?.user?.user_metadata?.fixture_namespace ||
    session?.user?.user_metadata?.staging_fixture_namespace ||
    payload?.user_metadata?.fixture_namespace ||
    null

  if (fixtureNamespace && fixtureNamespace !== BOND_RUNTIME_FIXTURE_NAMESPACE) {
    throw new Error(`Bond runtime auth state is not tagged for ${BOND_RUNTIME_FIXTURE_NAMESPACE}`)
  }

  return {
    authState,
    session,
    email,
    expiresAtIso,
    fixtureNamespace,
  }
}

function createRoleChecklist(metadata, authSummary) {
  return REQUIRED_ROLE_KEYS.map((roleKey) => {
    const user = (metadata.users || []).find((item) => item.roleKey === roleKey)
    return {
      role: roleKey,
      scenario: 'staging_runtime_session',
      expected: 'fixture user and staging auth inputs are ready for manual/browser runtime smoke',
      actual: user ? 'ready_for_runtime_smoke' : 'missing',
      pass: Boolean(user),
      notes: user
        ? `workspaceRole=${user.workspaceRole}; scopeLevel=${user.scopeLevel}; authFixtureUser=${authSummary.email}`
        : 'role missing from fixture metadata',
    }
  })
}

export function buildRuntimeChecklistReport({
  metadataPath = DEFAULT_METADATA_PATH,
  authStatePath = DEFAULT_AUTH_STATE_PATH,
} = {}) {
  const metadata = readRuntimeFixtureMetadata(metadataPath)
  const authSummary = readRuntimeAuthState(authStatePath)

  return {
    phase: '5H',
    generatedAt: new Date().toISOString(),
    runtimeReady: true,
    runtimeFixtureStatus: {
      metadataPath,
      authStatePath,
      fixtureNamespace: metadata.fixtureNamespace,
      fixtureMode: metadata.executionMode,
      workspaceType: metadata.workspaceType,
      authStateEmail: authSummary.email,
      authStateExpiresAt: authSummary.expiresAtIso,
      authFixtureNamespace: authSummary.fixtureNamespace,
    },
    dashboardSmoke: 'pending_manual_execution',
    mutationSmoke: 'pending_manual_execution',
    workspaceSwitching: 'pending_manual_execution',
    legacyCompatibilityRuntime: 'pending_manual_execution',
    deniedActionHandling: {
      clearPermissionMessagesPresent: true,
      genericPermissionTelemetryPresent: true,
      structuredBondDenialLoggingVerified: false,
    },
    fixtureCoverage: {
      rolesCovered: REQUIRED_ROLE_KEYS,
      applicationsCovered: REQUIRED_APPLICATION_KEYS,
      excludedRowsCovered: ['accepted_unresolved_legacy', 'manual_review'],
    },
    checklist: createRoleChecklist(metadata, authSummary),
    blockers: [],
    nextActions: [
      'Apply the Bond runtime fixtures to staging with explicit apply credentials.',
      'Create a fresh auth state with create-bond-runtime-auth-state.mjs for the selected Bond fixture user.',
      'Execute the manual/browser Phase 5H runtime smoke matrix against the seeded applications.',
    ],
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildRuntimeChecklistReport()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
