import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __organisationContextTestUtils } = await server.ssrLoadModule('/src/context/OrganisationContext.jsx')
  const { buildImmediateOrganisationSnapshot, resolveOrganisationRenderState } = __organisationContextTestUtils

  const authState = {
    status: 'authenticated',
    user: { id: 'user-1' },
    appRole: 'attorney',
    workspaceType: 'attorney_firm',
    currentWorkspace: {
      id: 'young-law',
      name: 'Young Law Inc',
      type: 'attorney_firm',
      logoUrl: 'https://example.test/young-law-logo.png',
    },
    currentMembership: {
      id: 'attorney-membership',
      source: 'attorney_firm_members',
      workspaceId: 'young-law',
      workspaceRole: 'attorney',
      status: 'active',
    },
  }

  const initialSnapshot = buildImmediateOrganisationSnapshot(authState)
  assert.equal(initialSnapshot.organisation.id, 'young-law')
  assert.equal(initialSnapshot.branding.logoUrl, 'https://example.test/young-law-logo.png')
  assert.equal(initialSnapshot.branding.hasCustomLogo, true)

  assert.equal(
    resolveOrganisationRenderState(authState, null).branding.logoUrl,
    'https://example.test/young-law-logo.png',
    'the first authenticated attorney render must already contain canonical workspace branding',
  )

  const staleHydratedState = {
    organisation: { id: 'previous-firm', workspaceId: 'previous-firm' },
    branding: { logoUrl: 'https://example.test/previous-logo.png' },
  }
  assert.equal(
    resolveOrganisationRenderState(authState, staleHydratedState).branding.logoUrl,
    'https://example.test/young-law-logo.png',
    'a previous workspace logo must never replace the active canonical workspace logo',
  )

  const unbrandedAuthState = {
    ...authState,
    currentWorkspace: {
      ...authState.currentWorkspace,
      logoUrl: '',
      logo_url: null,
    },
  }
  const unbrandedSnapshot = resolveOrganisationRenderState(unbrandedAuthState, staleHydratedState)
  assert.equal(unbrandedSnapshot.organisation.id, 'young-law')
  assert.equal(unbrandedSnapshot.branding.logoUrl, '')
  assert.equal(unbrandedSnapshot.branding.hasCustomLogo, false)

  assert.equal(
    resolveOrganisationRenderState({ status: 'unauthenticated', user: null }, staleHydratedState),
    null,
    'sign-out must clear the previous workspace brand synchronously',
  )

  const [sidebarSource, stylesheetSource] = await Promise.all([
    readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ])
  assert.match(sidebarSource, /currentLogoLoadStatus[\s\S]*logoLoaded/)
  assert.match(sidebarSource, /ui-sidebar-brand-logo-placeholder[\s\S]*ui-sidebar-brand-logo-pending/)
  assert.match(sidebarSource, /onLoad=\{\(\) => setLogoLoadState\(\{ url: branding\.logoUrl, status: 'loaded' \}\)\}/)
  assert.match(sidebarSource, /onError=\{handleLogoLoadFailure\}/)
  assert.match(stylesheetSource, /\.ui-sidebar-brand-logo-pending\s*\{\s*opacity:\s*0;/)
  assert.match(stylesheetSource, /\.ui-sidebar-brand-logo-loaded\s*\{\s*opacity:\s*1;/)

  console.log('workspace branding hydration tests passed')
} finally {
  await server.close()
}
