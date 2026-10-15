import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ from: vi.fn(), membershipScope: vi.fn(), profileIds: vi.fn() }))
vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: api.from } }))
import { clearOrganisationRuntimeCache, listOrganisationUsersForWorkspace } from '../settingsApi'

beforeEach(() => {
  clearOrganisationRuntimeCache()
  vi.clearAllMocks()
  api.from.mockImplementation(table => table === 'organisation_users' ? {
    select: () => ({ eq: (...args) => {
      api.membershipScope(...args)
      return { order: async () => ({ data: [{ id: 'membership', user_id: 'agent', organisation_id: 'org', email: 'agent@example.test', first_name: 'Legacy', last_name: 'Agent', status: 'active' }] }) }
    } }),
  } : {
    select: () => ({ in: async (column, values) => {
      api.profileIds(column, values)
      return { data: [{ id: 'agent', email: 'agent@example.test', full_name: 'Saved Agent', avatar_url: '/agent-photo.jpg' }] }
    } }),
  })
})

it('keeps the lightweight cache separate from saved profile photo lookups', async () => {
  const lightweight = await listOrganisationUsersForWorkspace({ organisationId: 'org' })
  expect(lightweight[0].avatarUrl).toBe('')
  expect(api.from).not.toHaveBeenCalledWith('profiles')
  const enriched = await listOrganisationUsersForWorkspace({ organisationId: 'org', includeAvatars: true })
  expect(enriched[0]).toMatchObject({ userId: 'agent', organisationId: 'org', fullName: 'Saved Agent', avatarUrl: '/agent-photo.jpg' })
  expect(api.membershipScope).toHaveBeenCalledWith('organisation_id', 'org')
  expect(api.profileIds).toHaveBeenCalledWith('id', ['agent'])
  expect(await listOrganisationUsersForWorkspace({ organisationId: 'org', includeAvatars: true })).toBe(enriched)
  expect(await listOrganisationUsersForWorkspace({ organisationId: 'org' })).toBe(lightweight)
  expect(api.membershipScope).toHaveBeenCalledTimes(2)
})

it('retains membership details when profile photos are not accessible', async () => {
  const membershipQuery = api.from.getMockImplementation()
  api.from.mockImplementation(table => table === 'profiles'
    ? { select: () => ({ in: async () => ({ error: { code: '42501', message: 'permission denied' } }) }) }
    : membershipQuery(table))
  const users = await listOrganisationUsersForWorkspace({ organisationId: 'org', includeAvatars: true })
  expect(users[0]).toMatchObject({ userId: 'agent', fullName: 'Legacy Agent', avatarUrl: '' })
})
