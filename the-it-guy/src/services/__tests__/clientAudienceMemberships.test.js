import { beforeEach, expect, test, vi } from 'vitest'
import { getClientAudienceMemberships } from '../emailCampaignService'
import { supabase } from '../../lib/supabaseClient'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }))
const organisationId = 'agency'
const marketingContact = { id: 'contact', organisation_id: organisationId, role_type: 'buyer', tags: ['launch'], area: 'Cape Town' }
const audience = (id, filter_json, extra = {}) => ({ id, organisation_id: organisationId, filter_json, ...extra })
beforeEach(() => { vi.resetAllMocks() })

test('uses the canonical matcher for the exact persisted contact and excludes archived or other-agency audiences', async () => {
  const filter = { operator: 'OR', rules: [{ field: 'tags', operator: 'in', value: ['launch'] }, { field: 'contact_type', operator: 'in', value: ['seller'] }] }
  supabase.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null })
  const included = audience('included', filter)
  const result = await getClientAudienceMemberships({ organisationId, marketingContact, savedAudiences: [included, audience('excluded', filter), audience('archived', filter, { archived_at: '2026-10-10' }), audience('other', filter, { organisation_id: 'other' })] })
  expect(result).toEqual([included])
  expect(supabase.rpc).toHaveBeenCalledTimes(2)
  expect(supabase.rpc).toHaveBeenCalledWith('email_audience_rule_matches', { p_contact: marketingContact, p_rule: filter })
})

test('honours legacy filters and explicit contact lists without sampling audience previews', async () => {
  const included = audience('included', { role_type: 'buyer', tag: 'launch', area: 'Cape Town', contact_ids: ['contact'] })
  const result = await getClientAudienceMemberships({ organisationId, marketingContact, savedAudiences: [included, audience('seller', { role_type: 'seller' }), audience('untagged', { tag: 'show-day' }), audience('other-contact', { contact_ids: ['another'] }), audience('other-branch', { branch_id: 'branch' })] })
  expect(result).toEqual([included])
  expect(supabase.rpc).not.toHaveBeenCalled()
})

test('does not match a missing contact or a contact from another organisation', async () => {
  expect(await getClientAudienceMemberships({ organisationId, savedAudiences: [audience('all', {})] })).toEqual([])
  expect(await getClientAudienceMemberships({ organisationId, marketingContact: { ...marketingContact, organisation_id: 'other' }, savedAudiences: [audience('all', {})] })).toEqual([])
  expect(supabase.rpc).not.toHaveBeenCalled()
})

test('propagates lookup failures instead of reporting an empty membership list', async () => {
  supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('Unavailable') })
  await expect(getClientAudienceMemberships({ organisationId, marketingContact, savedAudiences: [audience('rules', { rules: [] })] })).rejects.toThrow('Unavailable')
})
