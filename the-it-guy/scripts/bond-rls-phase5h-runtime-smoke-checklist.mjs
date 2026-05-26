import fs from 'node:fs'
import path from 'node:path'

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const authStatePath = path.join(appRoot, 'playwright', '.auth', 'staging-internal.json')
const canonicalFixtureScriptPath = path.join(appRoot, 'scripts', 'setup-canonical-documents-staging-pilot-fixture.mjs')
const stagingExportScriptPath = path.join(appRoot, 'scripts', 'export-bond-assignment-staging.mjs')
const apiPath = path.join(appRoot, 'src', 'lib', 'api.js')
const monitoringPath = path.join(appRoot, 'src', 'services', 'observability', 'monitoring.js')

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
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

function loadAuthFixture() {
  const source = safeRead(authStatePath)
  if (!source) {
    return {
      present: false,
      email: null,
      fixture: null,
      expiresAt: null,
      expired: null,
    }
  }

  const authState = JSON.parse(source)
  const originState =
    authState.origins?.find((entry) => entry.origin === 'https://app.bridgenine.co.za') || null
  const tokenStorage =
    originState?.localStorage?.find((entry) => entry.name.includes('auth-token')) || null
  const session = tokenStorage ? JSON.parse(tokenStorage.value) : null
  const payload = decodeJwtPayload(session?.access_token)
  const expiresAtIso =
    typeof session?.expires_at === 'number' ? new Date(session.expires_at * 1000).toISOString() : null

  return {
    present: true,
    email: session?.user?.email || payload?.email || null,
    fixture: session?.user?.user_metadata?.fixture || null,
    expiresAt: expiresAtIso,
    expired: expiresAtIso ? Date.now() > Date.parse(expiresAtIso) : null,
  }
}

function detectCanonicalFixtureEvidence() {
  const source = safeRead(canonicalFixtureScriptPath)
  const emailMatch = source.match(/DEFAULT_EMAIL\s*=\s*'([^']+)'/)
  return {
    canonicalFixtureEmail: emailMatch ? emailMatch[1] : null,
    canonicalFixtureScriptPresent: Boolean(source),
  }
}

function detectLiveBondCoverageEvidence() {
  const source = safeRead(stagingExportScriptPath)
  return {
    noLiveBondOrganisationsWarningPresent: source.includes(
      'No live bond organisations were found in staging export. Synthetic fixtures were used for Phase 4D smoke coverage.',
    ),
    liveRegionUnitCoverageWarningPresent: source.includes(
      'Branch/regional smoke cannot be completed from live data alone.',
    ),
  }
}

function detectDeniedActionHandling() {
  const apiSource = safeRead(apiPath)
  const monitoringSource = safeRead(monitoringPath)

  return {
    clearPermissionMessagesPresent:
      apiSource.includes('You do not have permission to request additional documents for this transaction.') &&
      apiSource.includes('You do not have permission to manage transaction ownership or access level.'),
    genericPermissionTelemetryPresent:
      monitoringSource.includes('trackPermissionMetric') && monitoringSource.includes('trackTelemetryEvent'),
    structuredBondDenialLoggingVerified: false,
  }
}

function createRoleChecklist(status, notes) {
  return [
    'personal_originator',
    'consultant',
    'processor',
    'compliance',
    'branch_manager',
    'regional_manager',
    'hq_owner_director',
    'participant_only',
    'unrelated_user',
  ].map((role) => ({
    role,
    scenario: 'staging_runtime_session',
    expected: 'real user session available for dashboard and mutation smoke',
    actual: status,
    pass: status === 'pass',
    notes,
  }))
}

const authFixture = loadAuthFixture()
const canonicalFixtureEvidence = detectCanonicalFixtureEvidence()
const liveBondCoverageEvidence = detectLiveBondCoverageEvidence()
const deniedActionHandling = detectDeniedActionHandling()

const runtimeBlocked =
  authFixture.expired === true ||
  authFixture.email === canonicalFixtureEvidence.canonicalFixtureEmail ||
  liveBondCoverageEvidence.noLiveBondOrganisationsWarningPresent

const blockedReasonParts = [
  authFixture.expired ? `staging auth state expired at ${authFixture.expiresAt}` : null,
  authFixture.email === canonicalFixtureEvidence.canonicalFixtureEmail
    ? `saved staging fixture is canonical-doc QA account (${authFixture.email})`
    : null,
  liveBondCoverageEvidence.noLiveBondOrganisationsWarningPresent
    ? 'repo export script reports no live Bond organisations in staging and synthetic fixtures for prior smoke'
    : null,
].filter(Boolean)

const report = {
  phase: '5H',
  generatedAt: new Date().toISOString(),
  runtimeReady: !runtimeBlocked,
  runtimeFixtureStatus: {
    authStatePresent: authFixture.present,
    authStateEmail: authFixture.email,
    authStateFixture: authFixture.fixture,
    authStateExpiresAt: authFixture.expiresAt,
    authStateExpired: authFixture.expired,
    canonicalFixtureEmail: canonicalFixtureEvidence.canonicalFixtureEmail,
    noLiveBondOrganisationsWarningPresent: liveBondCoverageEvidence.noLiveBondOrganisationsWarningPresent,
    liveRegionUnitCoverageWarningPresent: liveBondCoverageEvidence.liveRegionUnitCoverageWarningPresent,
  },
  dashboardSmoke: runtimeBlocked ? 'blocked' : 'pending_manual_execution',
  mutationSmoke: runtimeBlocked ? 'blocked' : 'pending_manual_execution',
  workspaceSwitching: runtimeBlocked ? 'blocked' : 'pending_manual_execution',
  legacyCompatibilityRuntime: runtimeBlocked ? 'blocked' : 'pending_manual_execution',
  deniedActionHandling,
  checklist: createRoleChecklist(
    runtimeBlocked ? 'blocked' : 'pending',
    blockedReasonParts.join('; ') || 'runtime fixture status unknown',
  ),
  blockers: runtimeBlocked ? blockedReasonParts : [],
  nextActions: runtimeBlocked
    ? [
        'Provision live Bond staging users for each required role.',
        'Create or identify canonical-ready and excluded Bond staging applications.',
        'Refresh the staging auth bootstrap so it can establish a valid Bond session in browser/runtime verification.',
      ]
    : ['Execute manual/browser runtime smoke and record results into the checklist.'],
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
