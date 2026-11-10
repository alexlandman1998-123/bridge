import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const state = { actor: 'actor-one', reads: [], override: null }
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.actor ? { user: { id: state.actor } } : null } })),
      getUser: vi.fn(async () => ({ data: { user: { id: state.actor, email: 'fixture@example.test' } } })),
    },
    from(table) {
      const filters = {}
      const query = {
        select() { return query }, eq(key, value) { filters[key] = value; return query },
        async maybeSingle() {
          state.reads.push(table)
          if (state.override) { const result = state.override(table, filters); if (result) return result }
          return { data: table === 'organisations'
            ? { id: filters.id, name: 'Fixture agency', type: 'agency' }
            : { organisation_id: filters.organisation_id, settings_json: { agencyOnboarding: { agencyInformation: { agencyName: 'Current agency' } } } }, error: null }
        },
        insert() { throw new Error('Startup must not create fixture records') },
      }
      return query
    },
  }
  return { state, client, profile: vi.fn(), resolve: vi.fn() }
})
vi.mock('../supabaseClient', () => ({ supabase: fixture.client, isSupabaseConfigured: true, clearSupabaseLocalAuthState: vi.fn(), isUserFromSubClaimMissingError: () => false }))
vi.mock('../profileApi', async actual => ({ ...await actual(), getOrCreateUserProfile: fixture.profile }))
vi.mock('../envValidation', async actual => ({ ...await actual(), isUnsafeFallbackAllowed: () => false }))
vi.mock('../../services/workspaceResolutionService', () => ({ resolveCurrentWorkspace: fixture.resolve, logUnsafeFallbackBlocked: vi.fn(), WorkspaceContextError: class extends Error {} }))
import { clearOrganisationRuntimeCache, fetchAgencyOnboardingSettings } from '../organisationBootstrapApi.js'

function context(actor = 'actor-one', workspace = 'org-one') {
  const membership = { id: `membership-${actor}-${workspace}`, workspaceId: workspace, source: 'organisation_users', status: 'active', workspaceRole: 'principal', raw: { organisation_id: workspace, user_id: actor, role: 'principal', status: 'active' } }
  return { status: 'authenticated', user: { id: actor }, profile: { id: actor, role: 'principal', onboardingCompleted: true }, currentWorkspace: { id: workspace }, currentMembership: membership, activeMemberships: [membership] }
}
beforeEach(() => {
  clearOrganisationRuntimeCache()
  vi.clearAllMocks()
  fixture.state.actor = 'actor-one'; fixture.state.reads = []; fixture.state.override = null
  fixture.profile.mockImplementation(async () => context(fixture.state.actor).profile)
  fixture.resolve.mockImplementation(async () => context(fixture.state.actor))
})
it('avoids repeated profile/workspace setup while keeping the organisation/settings reads under RLS', async () => {
  const result = await fetchAgencyOnboardingSettings({ authContext: context() })
  expect(result.organisation.id).toBe('org-one')
  expect(fixture.client.auth.getUser).toHaveBeenCalledOnce()
  expect(fixture.profile).not.toHaveBeenCalled()
  expect(fixture.resolve).not.toHaveBeenCalled()
  expect(fixture.state.reads).toEqual(['organisations', 'organisation_settings'])
})
it('retains profile defaults from raw consolidated startup fields', async () => {
  const authContext = context()
  Object.assign(authContext.profile, { company_name: 'Profile agency', phone_number: '0215550100', avatar_url: 'https://example.test/avatar.png' })
  fixture.state.override = table => table === 'organisation_settings' ? { data: { settings_json: {} }, error: null } : null
  const result = await fetchAgencyOnboardingSettings({ authContext })
  expect(result.onboarding.agencyInformation.agencyName).toBe('Profile agency')
  expect(result.onboarding.agencyInformation.mainOfficeNumber).toBe('0215550100')
  expect(fixture.profile).not.toHaveBeenCalled()
})
it.each(['actor', 'membership actor', 'workspace', 'inactive', 'unconfirmed', 'degraded', 'setup pending'])('does a fresh resolution for an unsuitable %s snapshot', async mode => {
  const authContext = context()
  if (mode === 'actor') authContext.user.id = 'other-actor'
  if (mode === 'membership actor') authContext.currentMembership.raw.user_id = 'other-actor'
  if (mode === 'workspace') authContext.currentWorkspace.id = 'other-org'
  if (mode === 'inactive') authContext.currentMembership.status = 'suspended'
  if (mode === 'unconfirmed') authContext.activeMemberships = []
  if (mode === 'degraded') authContext.workspaceAccessDegraded = true
  if (mode === 'setup pending') authContext.onboardingRequiredReason = 'profile_required'
  await fetchAgencyOnboardingSettings({ authContext })
  expect(fixture.resolve).toHaveBeenCalledOnce()
  expect(fixture.profile).toHaveBeenCalledOnce()
})
it('does not serve a warmed cache for a subsequently invalid snapshot', async () => {
  await fetchAgencyOnboardingSettings({ authContext: context() })
  const invalid = context()
  invalid.user.id = 'other-actor'
  await fetchAgencyOnboardingSettings({ authContext: invalid })
  expect(fixture.resolve).toHaveBeenCalledOnce()
})
it('shares identical startup work and partitions the result by actor and workspace', async () => {
  await Promise.all([fetchAgencyOnboardingSettings({ authContext: context() }), fetchAgencyOnboardingSettings({ authContext: context() })])
  expect(fixture.client.auth.getUser).toHaveBeenCalledOnce()
  expect((await fetchAgencyOnboardingSettings({ authContext: context('actor-one', 'org-two') })).organisation.id).toBe('org-two')
  fixture.state.actor = 'actor-two'
  expect((await fetchAgencyOnboardingSettings({ authContext: context('actor-two') })).organisation.id).toBe('org-one')
  expect(fixture.client.auth.getUser).toHaveBeenCalledTimes(3)
})
it('forces a fresh profile/membership check on explicit refresh', async () => {
  await fetchAgencyOnboardingSettings({ authContext: context() })
  await fetchAgencyOnboardingSettings({ authContext: context(), forceRefresh: true })
  expect(fixture.resolve).toHaveBeenCalledOnce()
  expect(fixture.profile).toHaveBeenCalledOnce()
})
it('does not serve the cached organisation after sign-out', async () => {
  await fetchAgencyOnboardingSettings({ authContext: context() })
  fixture.state.actor = null
  await expect(fetchAgencyOnboardingSettings({ authContext: context() })).rejects.toThrow('Authenticated user is required')
})
it('does not hide an organisation RLS denial behind the sign-in snapshot', async () => {
  fixture.state.override = table => table === 'organisations' ? { data: null, error: { code: '42501', message: 'permission denied' } } : null
  await expect(fetchAgencyOnboardingSettings({ authContext: context() })).rejects.toThrow('workspace_context_missing')
})
it('does not let a retired pending request overwrite the refreshed cache', async () => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  let first = true
  fixture.state.override = table => {
    if (table !== 'organisation_settings' || !first) return null
    first = false; return pending
  }
  const old = fetchAgencyOnboardingSettings({ authContext: context() })
  await vi.waitFor(() => expect(fixture.state.reads).toContain('organisation_settings'))
  clearOrganisationRuntimeCache()
  const current = await fetchAgencyOnboardingSettings({ authContext: context() })
  finish({ data: { settings_json: { agencyOnboarding: { agencyInformation: { agencyName: 'Retired agency' } } } }, error: null })
  await old
  const cached = await fetchAgencyOnboardingSettings({ authContext: context() })
  expect(cached.organisationSettings).toEqual(current.organisationSettings)
  expect(fixture.client.auth.getUser).toHaveBeenCalledTimes(2)
})
