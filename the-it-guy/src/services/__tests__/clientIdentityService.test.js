import { beforeEach, expect, test, vi } from 'vitest'
import { loadClientIdentities, mergeClientIdentities, saveClientIdentity } from '../clientIdentityService'
const transport = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: transport }))
beforeEach(() => { vi.clearAllMocks(); transport.rpc.mockResolvedValue({ data: true, error: null }) })
const tableRows = (rows, error = null) => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query)
  query.range.mockImplementation((start, end) => Promise.resolve({ data: rows.slice(start, end + 1), error }))
  return query
}

test('identity reads paginate and scope all tables to the selected agency', async () => {
  const profiles=tableRows(Array.from({ length: 1001 }, (_, index) => ({ id: `client-${index}` })))
  const aliases=tableRows([]), links=tableRows([]), tags=tableRows([{ organisation_id: 'agency-a', client_id: 'client-0', tag: 'lyle' }])
  transport.from.mockImplementation((name) => ({ agency_client_profiles: profiles, agency_client_identifiers: aliases, agency_client_links: links, agency_client_tags: tags })[name])
  const result = await loadClientIdentities('agency-a')
  expect(result.profiles).toHaveLength(1001)
  expect(result.canManage).toBe(true)
  expect(profiles.range.mock.calls).toEqual([[0,499],[500,999],[1000,1499]])
  expect(result.tags).toEqual([{ organisation_id: 'agency-a', client_id: 'client-0', tag: 'lyle' }])
  for (const query of [profiles,aliases,links,tags]) expect(query.eq).toHaveBeenCalledWith('organisation_id','agency-a')
})

test('missing tables degrade visibly but permission failures do not silently fall back', async () => {
  transport.from.mockReturnValue(tableRows([], { code: '42P01', message: 'missing table' }))
  expect((await loadClientIdentities('agency-a')).available).toBe(false)
  transport.from.mockReturnValue(tableRows([], { code: '42501', message: 'permission denied' }))
  await expect(loadClientIdentities('agency-a')).rejects.toMatchObject({ code: '42501' })
})

test('saving normalises aliases and sends an expected version; invalid input never reaches the database', async () => {
  const client={ identityId:'client-a',identityVersion:3 }
  await saveClientIdentity(client,{ name:' Alex ',emails:[' A@example.test '],phones:['0821234567'] })
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_update',{ p_client_id:'client-a',p_expected_version:3,p_name:'Alex',p_emails:['a@example.test'],p_phones:['27821234567'] })
  transport.rpc.mockClear()
  await expect(saveClientIdentity(client,{ name:'Alex',emails:['bad-email'] })).rejects.toThrow('valid email')
  expect(transport.rpc).not.toHaveBeenCalled()
})

test('merge sends both reviewed versions and propagates conflicts without retries', async () => {
  transport.rpc.mockResolvedValue({ error:{code:'40001',message:'Reload profiles'} })
  await expect(mergeClientIdentities({identityId:'a',identityVersion:1},{identityId:'b',identityVersion:2},' Verified both emails ')).rejects.toMatchObject({code:'40001'})
  expect(transport.rpc).toHaveBeenCalledOnce()
  expect(transport.rpc).toHaveBeenCalledWith('agency_client_merge',{p_primary_id:'a',p_secondary_id:'b',p_primary_version:1,p_secondary_version:2,p_reason:'Verified both emails'})
})


test('a tag-read failure preserves core clients and carries an explicit retry warning', async () => {
  transport.from.mockImplementation(name => name === 'agency_client_tags'
    ? tableRows([], { code: '42501', message: 'Tag access denied' })
    : tableRows(name === 'agency_client_profiles' ? [{ id: 'person', organisation_id: 'agency-a' }] : []))
  const result = await loadClientIdentities('agency-a')
  expect(result.available).toBe(true)
  expect(result.profiles).toHaveLength(1)
  expect(result.tagsAvailable).toBe(false)
  expect(result.tagWarning).toContain('Tag access denied')
})
