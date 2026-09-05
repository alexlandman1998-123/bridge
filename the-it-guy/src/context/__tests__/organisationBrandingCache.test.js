import assert from 'node:assert/strict'
import test from 'node:test'
import {
  __organisationBrandingCacheTestUtils,
  applyLastGoodOrganisationBranding,
  readLastGoodOrganisationBranding,
  writeLastGoodOrganisationBranding,
} from '../organisationBrandingCache.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

function createAuthState({ userId = 'user-1', workspaceId = 'workspace-1' } = {}) {
  return {
    user: { id: userId },
    currentWorkspace: { id: workspaceId },
  }
}

test('last-good branding is available only to the exact user and workspace', () => {
  const storage = createStorage()
  const authState = createAuthState()
  const capturedAt = 1_800_000_000_000

  assert.equal(writeLastGoodOrganisationBranding(authState, {
    logoUrl: 'https://cdn.example.test/home-seekers.svg',
    organisationLabel: 'Home Seekers',
  }, storage, capturedAt), true)

  assert.equal(
    readLastGoodOrganisationBranding(authState, storage, capturedAt + 1_000)?.logoUrl,
    'https://cdn.example.test/home-seekers.svg',
  )
  assert.equal(readLastGoodOrganisationBranding(createAuthState({ userId: 'user-2' }), storage, capturedAt + 1_000), null)
  assert.equal(readLastGoodOrganisationBranding(createAuthState({ workspaceId: 'workspace-2' }), storage, capturedAt + 1_000), null)
})

test('last-good branding retains independent entries when a user switches workspaces', () => {
  const storage = createStorage()
  const capturedAt = 1_800_000_000_000
  const firstWorkspace = createAuthState({ workspaceId: 'workspace-1' })
  const secondWorkspace = createAuthState({ workspaceId: 'workspace-2' })

  assert.equal(writeLastGoodOrganisationBranding(firstWorkspace, {
    logoUrl: 'https://cdn.example.test/first.svg',
  }, storage, capturedAt), true)
  assert.equal(writeLastGoodOrganisationBranding(secondWorkspace, {
    logoUrl: 'https://cdn.example.test/second.svg',
  }, storage, capturedAt + 1_000), true)

  assert.equal(
    readLastGoodOrganisationBranding(firstWorkspace, storage, capturedAt + 2_000)?.logoUrl,
    'https://cdn.example.test/first.svg',
  )
  assert.equal(
    readLastGoodOrganisationBranding(secondWorkspace, storage, capturedAt + 2_000)?.logoUrl,
    'https://cdn.example.test/second.svg',
  )
})

test('expired, blob and oversized branding URLs are not restored', () => {
  const storage = createStorage()
  const authState = createAuthState()
  const capturedAt = 1_800_000_000_000

  assert.equal(writeLastGoodOrganisationBranding(authState, { logoUrl: 'blob:temporary-logo' }, storage, capturedAt), false)
  assert.equal(writeLastGoodOrganisationBranding(authState, { logoUrl: `https://cdn.test/${'x'.repeat(13_000)}` }, storage, capturedAt), false)
  assert.equal(writeLastGoodOrganisationBranding(authState, { logoUrl: 'https://cdn.test/logo.svg' }, storage, capturedAt), true)
  assert.equal(
    readLastGoodOrganisationBranding(
      authState,
      storage,
      capturedAt + __organisationBrandingCacheTestUtils.CACHE_MAX_AGE_MS + 1,
    ),
    null,
  )
})

test('cached branding fills an empty immediate snapshot without replacing live branding', () => {
  const cachedBranding = {
    logoUrl: 'https://cdn.test/cached.svg',
    logoIconUrl: 'https://cdn.test/cached-icon.svg',
    organisationLabel: 'Cached Agency',
  }
  const emptySnapshot = {
    organisation: { id: 'workspace-1', logoUrl: '' },
    branding: { logoUrl: '', organisationLabel: 'Current Agency', hasCustomLogo: false },
  }
  const merged = applyLastGoodOrganisationBranding(emptySnapshot, cachedBranding)
  assert.equal(merged.branding.logoUrl, cachedBranding.logoUrl)
  assert.equal(merged.branding.organisationLabel, 'Current Agency')
  assert.equal(merged.organisation.logo_url, cachedBranding.logoUrl)

  const liveSnapshot = {
    ...emptySnapshot,
    branding: { logoUrl: 'https://cdn.test/live.svg', hasCustomLogo: true },
  }
  assert.equal(applyLastGoodOrganisationBranding(liveSnapshot, cachedBranding), liveSnapshot)
})
