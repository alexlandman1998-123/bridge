import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  __organisationContextRuntimeTestUtils,
  invalidateOrganisationContextRuntime,
  resolveOrganisationContextOnce,
} from '../src/lib/organisationContextRuntime.js'

const settingsSource = await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const bootstrapSource = await readFile(new URL('../src/lib/organisationBootstrapApi.js', import.meta.url), 'utf8')
const authSource = await readFile(new URL('../src/context/AuthSessionContext.jsx', import.meta.url), 'utf8')
const workspaceCacheSource = await readFile(new URL('../src/services/workspaceScopedCache.js', import.meta.url), 'utf8')
const organisationProviderSource = await readFile(new URL('../src/context/OrganisationContext.jsx', import.meta.url), 'utf8')
const principalDashboardSource = await readFile(new URL('../src/pages/PrincipalDashboard.jsx', import.meta.url), 'utf8')
const pipelineOverviewSource = await readFile(new URL('../src/pages/PipelineOverviewPage.jsx', import.meta.url), 'utf8')
const unitsSource = await readFile(new URL('../src/pages/Units.jsx', import.meta.url), 'utf8')

test.afterEach(() => {
  __organisationContextRuntimeTestUtils.reset()
})

test('concurrent organisation-context consumers share one request for the workspace session', async () => {
  let loads = 0
  const loader = async () => {
    loads += 1
    await Promise.resolve()
    return { organisation: { id: 'workspace-1' } }
  }

  const [first, second, third] = await Promise.all([
    resolveOrganisationContextOnce(loader),
    resolveOrganisationContextOnce(loader),
    resolveOrganisationContextOnce(loader),
  ])

  assert.equal(loads, 1)
  assert.strictEqual(first, second)
  assert.strictEqual(second, third)

  const cached = await resolveOrganisationContextOnce(async () => {
    loads += 1
    return { organisation: { id: 'unexpected' } }
  })
  assert.equal(loads, 1)
  assert.equal(cached.organisation.id, 'workspace-1')
})

test('workspace invalidation prevents an old in-flight result from poisoning the new context', async () => {
  let finishOldRequest
  const oldRequest = resolveOrganisationContextOnce(() => new Promise((resolve) => {
    finishOldRequest = resolve
  }))

  invalidateOrganisationContextRuntime()
  const newContext = await resolveOrganisationContextOnce(async () => ({ organisation: { id: 'workspace-2' } }))
  finishOldRequest({ organisation: { id: 'workspace-1' } })
  await oldRequest

  assert.equal(newContext.organisation.id, 'workspace-2')
  assert.equal(__organisationContextRuntimeTestUtils.getSnapshot().context.organisation.id, 'workspace-2')
})

test('settings and onboarding loaders use the same session-scoped resolver', () => {
  assert.match(settingsSource, /resolveOrganisationContextOnce\(\(\) => loadOrganisationContext\(client\)\)/)
  assert.match(settingsSource, /async function ensureOrganisationContext\(client\) \{\s+return ensureOrganisationContextCached\(client\)/)
  assert.doesNotMatch(settingsSource, /ORGANISATION_CONTEXT_CACHE_TTL_MS/)
  assert.match(bootstrapSource, /resolveOrganisationContextOnce\(\(\) => loadOrganisationContext\(client\)\)/)
  assert.doesNotMatch(bootstrapSource, /ORGANISATION_CONTEXT_CACHE_TTL_MS/)
})

test('workspace selection and logout invalidate the shared organisation context', () => {
  assert.match(authSource, /selectWorkspace[\s\S]+clearWorkspaceScopedRuntimeCaches\(\)/)
  assert.match(authSource, /const logout[\s\S]+clearWorkspaceScopedRuntimeCaches\(\)/)
  assert.match(workspaceCacheSource, /clearOrganisationRuntimeCache\(\)/)
})

test('primary routes consume the authenticated provider context instead of querying settings again', () => {
  assert.match(organisationProviderSource, /organisationId: normalizeText\(/)
  assert.match(organisationProviderSource, /workspaceId: normalizeText\(/)
  for (const source of [principalDashboardSource, pipelineOverviewSource, unitsSource]) {
    assert.match(source, /useOrganisation\(\)/)
    assert.doesNotMatch(source, /fetchOrganisationSettings/)
  }
})
