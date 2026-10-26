import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), payload: null }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: runtime }))
import { saveEmailCampaign } from '../emailCampaignService'
beforeEach(() => {
  vi.clearAllMocks()
  const q = { select: () => q, single: async () => ({ data: runtime.payload }), eq: (key, value) => { runtime.eq(key, value); return q } }
  runtime.from.mockReturnValue({ insert: (payload) => { runtime.payload = payload; runtime.insert(payload); return q }, update: (payload) => { runtime.payload = payload; runtime.update(payload); return q } })
})
it('uses the supplied retry identity only for inserts, preserving agency and creator scope', async () => {
  await saveEmailCampaign({ organisationId: 'agency', userId: 'owner', campaign: { name: 'Just Listed', subject: 'Sunny home', clientId: 'stable-id' } })
  expect(runtime.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'stable-id', organisation_id: 'agency', created_by: 'owner' }))
  expect(runtime.update).not.toHaveBeenCalled()
})
it('continues to restrict updates to the existing draft in its agency', async () => {
  await saveEmailCampaign({ organisationId: 'agency', userId: 'owner', campaign: { id: 'existing', clientId: 'ignored', updatedAt: '2026-10-25T10:00:00Z', name: 'Edit', subject: 'Sunny home' } })
  expect(runtime.update).toHaveBeenCalled()
  expect(runtime.payload.id).toBeUndefined()
  expect(runtime.eq).toHaveBeenCalledWith('organisation_id', 'agency')
  expect(runtime.eq).toHaveBeenCalledWith('status', 'draft')
  expect(runtime.eq).toHaveBeenCalledWith('id', 'existing')
  expect(runtime.eq).toHaveBeenCalledWith('updated_at', '2026-10-25T10:00:00Z')
})
it('refuses an existing draft without a known saved revision before writing', async () => {
  for (const updatedAt of [undefined, '', 'invalid']) {
    await expect(saveEmailCampaign({ organisationId: 'agency', userId: 'owner', campaign: { id: 'existing', name: 'Unsaved changes', updatedAt } })).rejects.toMatchObject({ code: 'EMAIL_CAMPAIGN_CONFLICT' })
  }
  expect(runtime.update).not.toHaveBeenCalled()
})
it('supports database field casing and returns the new saved revision', async () => {
  const saved = { id: 'existing', updated_at: '2026-10-25T10:01:00Z' }
  runtime.from.mockImplementation(() => {
    const query = { update: () => query, eq: (key, value) => { runtime.eq(key, value); return query }, select: () => query, single: async () => ({ data: saved }) }
    return query
  })
  await expect(saveEmailCampaign({ organisationId: 'agency', userId: 'owner', campaign: { id: 'existing', name: 'Edit', updated_at: '2026-10-25T10:00:00Z' } })).resolves.toEqual(saved)
  expect(runtime.eq).toHaveBeenCalledWith('updated_at', '2026-10-25T10:00:00Z')
})
it('a second session cannot replace the first session save with its stale timestamp', async () => {
  const initialTime = '2026-10-25T10:00:00Z'
  let stored = { id: 'existing', name: 'Original', updated_at: initialTime }
  runtime.from.mockImplementation(() => {
    let payload; const filters = {}
    const query = { update: (value) => { payload = value; return query }, eq: (key, value) => { filters[key] = value; return query }, select: () => query, single: async () => {
      if (filters.updated_at !== stored.updated_at) return { data: null, error: { code: 'PGRST116' } }
      stored = { ...stored, ...payload, updated_at: '2026-10-25T10:01:00Z' }
      return { data: stored }
    } }
    return query
  })
  const first = await saveEmailCampaign({ organisationId: 'agency', userId: 'owner', campaign: { id: 'existing', name: 'First session work', updatedAt: initialTime } })
  expect(first.updated_at).toBe('2026-10-25T10:01:00Z')
  await expect(saveEmailCampaign({ organisationId: 'agency', userId: 'owner', campaign: { id: 'existing', name: 'Stale second session', updatedAt: initialTime } })).rejects.toMatchObject({ code: 'EMAIL_CAMPAIGN_CONFLICT' })
  expect(stored.name).toBe('First session work')
})
it('zero-row updates are clear conflicts while transport failures retain their original error', async () => {
  let result = { data: null }
  runtime.from.mockImplementation(() => {
    const query = { update: () => query, eq: () => query, select: () => query, single: async () => result }
    return query
  })
  const request = { organisationId: 'agency', userId: 'owner', campaign: { id: 'existing', name: 'Edit', updatedAt: '2026-10-25T10:00:00Z' } }
  await expect(saveEmailCampaign(request)).rejects.toMatchObject({ code: 'EMAIL_CAMPAIGN_CONFLICT' })
  result = { error: { code: 'NETWORK', message: 'Connection unavailable' } }
  await expect(saveEmailCampaign(request)).rejects.toEqual(result.error)
})
it('recovers one logical draft after an interrupted create and duplicate retry without overwriting it', async () => {
  const records = new Map(); let insertAttempts = 0; let recoveryReads = 0
  runtime.from.mockImplementation(() => {
    let insert; const filters = {}
    const query = {
      insert: (value) => { insert = value; return query }, select: () => query,
      eq: (key, value) => { filters[key] = value; return query },
      single: async () => {
        insertAttempts++
        if (records.has(insert.id)) return { error: { code: '23505' } }
        records.set(insert.id, { ...insert, status: 'draft', updated_at: '2026-10-25T10:00:00Z' })
        throw new Error('Response interrupted')
      },
      maybeSingle: async () => {
        recoveryReads++
        if (recoveryReads === 1) throw new Error('Recovery connection interrupted')
        expect(filters).toEqual({ organisation_id: 'agency', id: 'stable-id', created_by: 'owner' })
        return { data: records.get(filters.id) }
      },
    }
    return query
  })
  const request = { organisationId: 'agency', userId: 'owner', campaign: { clientId: 'stable-id', name: 'New listing', contentJson: { version: 1, facts: { suburb: 'Brooklyn', city: 'Pretoria' } } } }
  await expect(saveEmailCampaign(request)).rejects.toThrow('Response interrupted')
  const recovered = await saveEmailCampaign(request)
  expect(recovered.id).toBe('stable-id'); expect(recovered.updated_at).toBe('2026-10-25T10:00:00Z')
  expect(records.size).toBe(1); expect(insertAttempts).toBe(2)
  expect(runtime.update).not.toHaveBeenCalled()
})
it('a retried insert cannot recover another actor, agency, changed draft or launched campaign', async () => {
  let patch = {}; let inserted
  runtime.from.mockImplementation(() => {
    const query = {
      insert: (value) => { inserted = value; return query }, select: () => query, eq: () => query,
      single: async () => ({ error: { code: '23505' } }),
      maybeSingle: async () => ({ data: { ...inserted, status: 'draft', updated_at: '2026-10-25T10:00:00Z', ...patch } }),
    }
    return query
  })
  const request = { organisationId: 'agency', userId: 'owner', campaign: { clientId: 'stable-id', name: 'Original', audienceFilter: { area: 'Brooklyn', lead_stage: 'New' } } }
  for (patch of [{ created_by: 'other-owner' }, { organisation_id: 'other-agency' }, { name: 'Someone edited this' }, { status: 'scheduled' }]) {
    await expect(saveEmailCampaign(request)).rejects.toMatchObject({ code: '23505', message: expect.stringContaining('Reopen') })
  }
  patch = { audience_filter: { lead_stage: 'New', area: 'Brooklyn' } }
  await expect(saveEmailCampaign(request)).resolves.toMatchObject({ id: 'stable-id' })
  expect(runtime.update).not.toHaveBeenCalled()
})
