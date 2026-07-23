import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dashboardSource = fs.readFileSync(path.join(projectRoot, 'src', 'pages', 'Dashboard.jsx'), 'utf8')
const principalDashboardSource = fs.readFileSync(path.join(projectRoot, 'src', 'pages', 'PrincipalDashboard.jsx'), 'utf8')

assert.match(
  dashboardSource,
  /<PrincipalDashboard\s+agencyId=\{currentOrganisationId\}\s+canViewAllTransactions=\{isPrincipalAgentView\}/,
  'Principal dashboard should receive the resolved organisation directly.',
)
assert.doesNotMatch(
  dashboardSource,
  /workspaceId=\{workspace\.id\}/,
  'An agency workspace id must not be passed as the Principal branch scope.',
)
assert.match(
  principalDashboardSource,
  /useState\(\(\) => String\(workspaceId \|\| 'all'\)\.trim\(\) \|\| 'all'\)/,
  'Principal dashboard should default its initial scope to All Branches.',
)

const server = await createServer({
  root: projectRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { resolveAgentDashboardViewMode } = await server.ssrLoadModule('/src/lib/dashboardRoleView.js')

  assert.deepEqual(
    resolveAgentDashboardViewMode({
      appRole: 'agent',
      hydratedMembershipRole: 'principal',
      fallbackMembershipRole: 'viewer',
    }),
    { membershipRole: 'principal', mode: 'principal' },
    'The hydrated principal role must win before the mirrored local role catches up.',
  )
  assert.deepEqual(
    resolveAgentDashboardViewMode({
      appRole: 'agent',
      hydratedMembershipRole: '',
      fallbackMembershipRole: 'principal',
    }),
    { membershipRole: 'principal', mode: 'principal' },
    'The local role remains a safe fallback while hydration is unavailable.',
  )
  assert.deepEqual(
    resolveAgentDashboardViewMode({
      appRole: 'agent',
      hydratedMembershipRole: 'viewer',
      fallbackMembershipRole: 'principal',
    }),
    { membershipRole: 'viewer', mode: 'agent' },
    'A hydrated non-principal role must not inherit stale principal access.',
  )
} finally {
  await server.close()
}

console.log('dashboard load orchestration Phase 1 checks passed')
