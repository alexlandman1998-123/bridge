import fs from 'node:fs'

const DEFAULT_METADATA_PATH = process.env.BOND_RUNTIME_FIXTURE_METADATA || '/tmp/bond-runtime-fixtures.json'
const DEFAULT_AUTH_STATE_PATH = process.env.BOND_RUNTIME_AUTH_STATE_PATH || '/tmp/bond-runtime-auth-state.json'
const BOND_RUNTIME_FIXTURE_NAMESPACE = 'bond_runtime_phase5h'
const ATTORNEY_FIXTURE_EMAIL = 'qa.attorney+canonical@arch9.co.za'

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
]

function safeReadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} missing at ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
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
  const originEntry = (authState.origins || []).find((item) => item.origin === 'https://app.arch9.co.za')
  const tokenEntry = originEntry?.localStorage?.find((item) => String(item.name || '').includes('auth-token'))
  if (!tokenEntry) {
    throw new Error('Bond runtime auth state is missing the Bridge auth token entry')
  }

  const session = JSON.parse(tokenEntry.value)
  const payload = decodeJwtPayload(session?.access_token)
  const email = normalizeEmail(session?.user?.email || payload?.email || '')
  const expiresAtIso = typeof session?.expires_at === 'number' ? new Date(session.expires_at * 1000).toISOString() : null

  if (!email) {
    throw new Error('Bond runtime auth state is missing the authenticated user email')
  }
  if (email === ATTORNEY_FIXTURE_EMAIL) {
    throw new Error('Bond runtime auth state cannot reuse the attorney canonical fixture account')
  }

  return {
    authState,
    session,
    email,
    expiresAtIso,
    fixtureNamespace:
      authState.__bondRuntimeMeta?.fixtureNamespace ||
      session?.user?.user_metadata?.fixture_namespace ||
      session?.user?.user_metadata?.staging_fixture_namespace ||
      payload?.user_metadata?.fixture_namespace ||
      null,
    runtimeMeta: authState.__bondRuntimeMeta || null,
  }
}

function buildBlockedReport(metadata, blocked, message, authSummary = null, metadataPath = DEFAULT_METADATA_PATH, authStatePath = DEFAULT_AUTH_STATE_PATH) {
  return {
    phase: '5H',
    generatedAt: new Date().toISOString(),
    runtimeReady: false,
    blocked,
    message,
    runtimeFixtureStatus: {
      metadataPath,
      authStatePath,
      fixtureNamespace: metadata?.fixtureNamespace || null,
      fixtureMode: metadata?.executionMode || null,
      applied: metadata?.applied || false,
      target: metadata?.target || null,
      workspaceType: metadata?.workspaceType || null,
      authStateEmail: authSummary?.email || null,
      authStateExpiresAt: authSummary?.expiresAtIso || null,
      authFixtureNamespace: authSummary?.fixtureNamespace || null,
    },
    dashboardSmoke: 'blocked',
    mutationSmoke: 'blocked',
    workspaceSwitching: 'blocked',
    legacyCompatibilityRuntime: 'blocked',
    fixtureCoverage: {
      rolesCovered: REQUIRED_ROLE_KEYS,
      applicationsCovered: REQUIRED_APPLICATION_KEYS,
      excludedRowsCovered: ['accepted_unresolved_legacy', 'manual_review', 'legacy_compatibility_required'],
    },
    checklist: REQUIRED_ROLE_KEYS.map((roleKey) => ({
      role: roleKey,
      scenario: 'staging_runtime_session',
      expected: 'real staging runtime smoke can execute',
      actual: 'blocked',
      pass: false,
      notes: message,
    })),
    blockers: [blocked],
    nextActions: ['Resolve the blocked reason before claiming live Phase 5H runtime verification.'],
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
        ? `workspaceRole=${user.workspaceRole || 'none'}; scopeLevel=${user.scopeLevel || 'none'}; authFixtureUser=${authSummary.email}`
        : 'role missing from fixture metadata',
    }
  })
}

export function buildRuntimeChecklistReport({
  metadataPath = DEFAULT_METADATA_PATH,
  authStatePath = DEFAULT_AUTH_STATE_PATH,
} = {}) {
  const metadata = readRuntimeFixtureMetadata(metadataPath)

  if (metadata.executionMode !== 'apply' || metadata.applied !== true) {
    return buildBlockedReport(
      metadata,
      'fixture_not_applied',
      'Bond runtime fixtures are still dry-run or were not actually applied.',
      null,
      metadataPath,
      authStatePath,
    )
  }

  if ((metadata.missingAuthUsers || []).some((item) => item.requiredForRuntimeSmoke)) {
    return buildBlockedReport(
      metadata,
      'missing_auth_users',
      'Bond runtime fixtures were applied, but required runtime users are still missing.',
      null,
      metadataPath,
      authStatePath,
    )
  }

  const authSummary = readRuntimeAuthState(authStatePath)
  if (!authSummary.runtimeMeta || authSummary.runtimeMeta.source !== 'real_staging_auth_bootstrap') {
    return buildBlockedReport(
      metadata,
      'auth_not_real_staging',
      'Bond runtime auth state is synthetic or local-only, not a verified real staging auth bootstrap.',
      authSummary,
      metadataPath,
      authStatePath,
    )
  }
  if (!authSummary.expiresAtIso || Date.now() > Date.parse(authSummary.expiresAtIso)) {
    return buildBlockedReport(metadata, 'auth_expired', 'Bond runtime auth state is expired.', authSummary, metadataPath, authStatePath)
  }
  if (authSummary.fixtureNamespace !== BOND_RUNTIME_FIXTURE_NAMESPACE) {
    return buildBlockedReport(
      metadata,
      'auth_wrong_fixture_namespace',
      'Bond runtime auth state is not tagged to the Bond runtime fixture namespace.',
      authSummary,
      metadataPath,
      authStatePath,
    )
  }

  const matchingUser = (metadata.users || []).find((item) => normalizeEmail(item.email) === authSummary.email)
  if (!matchingUser) {
    return buildBlockedReport(
      metadata,
      'auth_user_not_in_fixture',
      'Bond runtime auth user is not present in the applied fixture metadata.',
      authSummary,
      metadataPath,
      authStatePath,
    )
  }

  return {
    phase: '5H',
    generatedAt: new Date().toISOString(),
    runtimeReady: true,
    blocked: null,
    message: null,
    runtimeFixtureStatus: {
      metadataPath,
      authStatePath,
      fixtureNamespace: metadata.fixtureNamespace,
      fixtureMode: metadata.executionMode,
      applied: metadata.applied,
      target: metadata.target,
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
      excludedRowsCovered: ['accepted_unresolved_legacy', 'manual_review', 'legacy_compatibility_required'],
    },
    checklist: createRoleChecklist(metadata, authSummary),
    blockers: [],
    nextActions: [
      'Open a browser session with the verified Bond auth state.',
      'Execute the Phase 5H runtime dashboard and mutation smoke matrix.',
      'Record denied-action telemetry and legacy compatibility behaviour.',
    ],
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildRuntimeChecklistReport()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
