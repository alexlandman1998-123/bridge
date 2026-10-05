import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: vi.fn() }, invokeEdgeFunction: vi.fn() }))
vi.mock('../inviteService', () => ({ createInvite: vi.fn(), INVITE_TYPES: { transaction: 'transaction_invite' } }))
import { supabase, invokeEdgeFunction } from '../../lib/supabaseClient'
import { acceptTransactionPartnerInvitation, declineTransactionPartnerInvitation, getTransactionPartnerInvitationByToken } from '../transactionPartnerInvitationService'
import { getPartnerHandoffPathFromIntent, readPendingPartnerInvitePath } from '../../lib/pendingPartnerInvite'
beforeEach(() => { vi.resetAllMocks(); invokeEdgeFunction.mockResolvedValue({ data: { queued: true }, error: null }) })
describe('partner handoff server routing', () => {
  it('restores the matter return path from saved signup intent without browser storage', () => {
    const intent = { source: 'invite_link', workspace_action: 'create_workspace', invite_token: 'canonical-token' }
    expect(getPartnerHandoffPathFromIntent(intent)).toBe('/transaction-invite/canonical-token')
    expect(readPendingPartnerInvitePath(intent)).toBe('/transaction-invite/canonical-token')
    expect(getPartnerHandoffPathFromIntent({ ...intent, workspace_action: 'accept_invite' })).toBe('')
    expect(getPartnerHandoffPathFromIntent({ ...intent, source: 'public_signup' })).toBe('')
  })
  it('uses the guarded preview for canonical and legacy tokens', async () => {
    const data = { ok: true, bindingState: 'accepted_unbound', organisations: [] }
    supabase.rpc.mockResolvedValue({ data, error: null })
    expect(await getTransactionPartnerInvitationByToken(' canonical-token ')).toEqual(data)
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('bridge_get_partner_handoff_invitation', { p_token: 'canonical-token' })
  })
  it('falls back for an absent migration but never for an access or network failure', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: { code: 'PGRST202' } }).mockResolvedValueOnce({ data: { ok: true } })
    expect((await getTransactionPartnerInvitationByToken('legacy')).ok).toBe(true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('bridge_get_transaction_partner_invitation', { p_token: 'legacy' })
    supabase.rpc.mockReset().mockResolvedValue({ error: { code: '42501', message: 'Permission denied' } })
    await expect(getTransactionPartnerInvitationByToken('legacy')).rejects.toEqual({ code: '42501', message: 'Permission denied' })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
  it('passes the selected organisation and makes a stale nomination visible', async () => {
    supabase.rpc.mockResolvedValue({ data: { success: false, code: 'nomination_changed' } })
    await expect(acceptTransactionPartnerInvitation({ token: 'canonical', organisationId: 'org' })).rejects.toThrow('The nominated partner has changed')
    expect(supabase.rpc).toHaveBeenCalledWith('bridge_accept_transaction_partner_invitation', expect.objectContaining({ p_token: 'canonical', p_organisation_id: 'org' }))
    expect(invokeEdgeFunction).not.toHaveBeenCalled()
  })
  it('declines through the guarded canonical path and preserves an existing unsupported role path', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { success: true, transactionId: 'matter' } })
    expect((await declineTransactionPartnerInvitation('canonical')).success).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('bridge_decline_partner_handoff_invitation', { p_token: 'canonical' })
    supabase.rpc.mockReset().mockResolvedValueOnce({ data: { success: false, code: 'unsupported_role' } }).mockResolvedValueOnce({ data: { success: true } })
    expect((await declineTransactionPartnerInvitation('developer')).success).toBe(true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('bridge_decline_transaction_partner_invitation', { p_token: 'developer' })
  })
})
