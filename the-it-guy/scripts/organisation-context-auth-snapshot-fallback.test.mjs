import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appSource = readFileSync(path.join(PROJECT_ROOT, 'src/App.jsx'), 'utf8')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __organisationContextTestUtils } = await server.ssrLoadModule('/src/context/OrganisationContext.jsx')
  const { buildImmediateOrganisationSnapshot, resolveOrganisationRenderState } = __organisationContextTestUtils

  const authState = {
    status: 'authenticated',
    user: { id: 'user-1' },
    appRole: 'agent',
    workspaceType: 'agency',
    currentMembership: {
      id: 'membership-1',
      workspaceId: 'workspace-1',
      role: 'principal',
      status: 'active',
    },
    currentWorkspace: {
      id: 'workspace-1',
      name: 'Kingstons Property',
      type: 'agency',
      logoUrl: 'https://cdn.example.test/kingstons.svg',
    },
  }

  const immediateSnapshot = buildImmediateOrganisationSnapshot(authState)
  assert.equal(immediateSnapshot.organisation.id, 'workspace-1')
  assert.equal(immediateSnapshot.branding.logoUrl, 'https://cdn.example.test/kingstons.svg')
  assert.equal(immediateSnapshot.branding.organisationLabel, 'Kingstons Property')
  assert.equal(resolveOrganisationRenderState(authState, null)?.branding?.logoUrl, immediateSnapshot.branding.logoUrl)

  assert.match(
    appSource,
    /shouldHydrateOrganisation && error && !organisationState/,
    'organisation gate should not block dashboard rendering when an auth workspace snapshot is available',
  )

  console.log('organisation context auth snapshot fallback tests passed')
} finally {
  await server.close()
}
