// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createRecruitmentIntakeLink } from '../../../services/recruitmentIntakeService'
const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { from: mocks.from } }))
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals() })
it('stores only a hash of the invitation token and scopes the link to its organisation and lead', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const query = { insert: vi.fn(), select: vi.fn(), single: vi.fn().mockResolvedValue({data:{id:'link',channel:'private_link',expires_at:'2026-10-19'},error:null}) }
  query.insert.mockReturnValue(query); query.select.mockReturnValue(query); mocks.from.mockReturnValue(query)
  const result = await createRecruitmentIntakeLink('org','private_link','lead')
  const token = result.url.split('/').pop()
  expect(token).toMatch(/^[a-f0-9]{64}$/)
  expect(query.insert.mock.calls[0][0]).toMatchObject({ organisation_id:'org',lead_id:'lead',channel:'private_link',token_hash:expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(query.insert.mock.calls[0][0].token_hash).not.toBe(token)
  expect(JSON.stringify(query.insert.mock.calls[0][0])).not.toContain(token)
  expect(new Date(query.insert.mock.calls[0][0].expires_at).getTime()-Date.now()).toBeLessThanOrEqual(14*86400000)
})
it('rejects ambiguous or cross-purpose link creation before making a write', async () => {
  await expect(createRecruitmentIntakeLink('all','website')).rejects.toThrow('Choose an organisation')
  await expect(createRecruitmentIntakeLink('org','private_link')).rejects.toThrow('valid intake')
  await expect(createRecruitmentIntakeLink('org','public_link','lead')).rejects.toThrow('valid intake')
  expect(mocks.from).not.toHaveBeenCalled()
})
