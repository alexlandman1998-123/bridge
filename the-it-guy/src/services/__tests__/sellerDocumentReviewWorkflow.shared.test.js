import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: null }))
import { reviewSellerDocument } from '../sellerDocumentReviewWorkflowService.js'

it('recovers an uncertain shared review with the same command and blocks a different decision', async () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const requirementId = '00000000-0000-4000-8000-000000000001'
  const contextId = '00000000-0000-4000-8000-000000000002'
  const document = { id: '00000000-0000-4000-8000-000000000003', canonical_requirement_instance_id: requirementId, is_current_evidence: true }
  const item = { sharedRequirement: true, canonicalRequirementInstanceId: requirementId, original: { requirement: {
    id: requirementId, context_type: 'private_listing', context_id: contextId, command_revision: 4,
  } } }
  let committed, attempts = 0
  const rpc = vi.fn(async (_name, args) => {
    attempts++
    if (!committed) committed = { saved: true, commandId: args.p_command_id, requirement: { id: requirementId, status: 'approved' }, uploadId: document.id }
    if (attempts === 1) throw new Error('Response lost after commit')
    expect(args.p_command_id).toBe(committed.commandId)
    expect(args.p_expected_revision).toBe(4)
    return { data: committed }
  })
  const client = { supabaseUrl: 'https://test.invalid', rpc, auth: { getUser: async () => ({ data: { user: { id: 'reviewer' } } }) } }
  const decide = action => reviewSellerDocument({ item, document, action, client, storage, reason: action === 'reject' ? 'Wrong statement' : '' })
  await expect(decide('approve')).rejects.toThrow(/could not be confirmed/)
  expect(values.size).toBe(1)
  await expect(decide('reject')).rejects.toThrow(/unfinished review/)
  expect(rpc).toHaveBeenCalledTimes(1)
  await expect(decide('approve')).resolves.toEqual(committed)
  expect(values.size).toBe(0)
  await expect(reviewSellerDocument({ item, document: { ...document, canonical_requirement_instance_id: 'other' }, action: 'approve', client, storage })).rejects.toThrow(/current saved file/)
})
