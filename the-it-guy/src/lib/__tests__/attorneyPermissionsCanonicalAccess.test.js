import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: null,
}))

vi.mock('../../services/attorneyFirmServiceShared', () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    id: '4975bf70-b92c-46c8-8b35-5244823e5a59',
  })),
  isMissingTableError: vi.fn(() => false),
  normalizeText: (value = '') => String(value || '').trim(),
  requireClient: () => mocks.client,
}))

import { canAccessAttorneyMatter, clearAttorneyMembershipCache, getAttorneyLaneAccessContext } from '../attorneyPermissions.js'
import { assertCanPublishVisibility, resolveAttorneyActionPermissions } from '../../services/permissions/attorneyPermissionService.js'
import { buildAttorneyMatterScope } from '../../core/transactions/attorneyMatterScope.js'

beforeEach(() => {
  clearAttorneyMembershipCache()
  mocks.client = {
    rpc: vi.fn(async () => ({ data: true, error: null })),
    from: vi.fn(() => {
      throw new Error('Known-firm access should not fall through to browser-side membership queries.')
    }),
  }
})

describe('attorney editing across the matter workflows', () => {
  const actorId = '4975bf70-b92c-46c8-8b35-5244823e5a59'
  const firmId = '37f3adfa-5f63-45af-95cf-9acb5037b38e'
  const transactionId = 'matter-fixture'
  const transferAssignment = {
    id: 'instruction', transaction_id: transactionId, firm_id: firmId,
    assignment_type: 'transfer', attorney_role: 'transfer_attorney',
    assignment_status: 'pending', status: 'pending', can_update_workflow_lane: true,
  }
  const membership = { isActive: true, professionalRole: 'firm_admin' }

  beforeEach(() => {
    mocks.client = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from(table) {
        const filters = {}
        const memberRow = {
          id: 'membership', firm_id: firmId, user_id: actorId, role: 'firm_admin',
          professional_role: 'firm_admin', status: 'active',
        }
        const result = () => ({ data: table === 'transaction_attorney_assignments' ? [transferAssignment]
          : table === 'attorney_firm_members' ? [memberRow] : [], error: null })
        return {
          select() { return this },
          eq(key, value) { filters[key] = value; return this },
          in() { return this },
          neq() { return this },
          async maybeSingle() {
            if (table === 'attorney_firm_members') return { data: { ...memberRow, ...filters }, error: null }
            if (table === 'attorney_firms') return { data: { allow_management_lane_override: false }, error: null }
            return result()
          },
          then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
        }
      },
    }
  })

  it.each(['transfer', 'bond', 'cancellation'])('enables %s tasks from authenticated matter workflow access', async (lane) => {
    const access = await getAttorneyLaneAccessContext({ transactionId, attorneyRole: lane })
    expect(access.matterWorkflowEligible).toBe(true)
    expect(access.canUpdateLane).toBe(true)
    expect(access.firmId).toBe(firmId)
    expect(mocks.client.rpc).toHaveBeenCalledWith('bridge_can_mutate_attorney_lane', {
      p_transaction_id: transactionId, p_attorney_role: `${lane}_attorney`, p_capability: 'workflow',
    })
    const permissions = resolveAttorneyActionPermissions({
      appRole: 'attorney', membership, attorneyRole: `${lane}_attorney`,
      attorneyAccess: access, canViewAsAttorney: true,
    })
    expect(permissions.canUpdateLane).toBe(true)
    if (lane !== 'transfer') {
      expect(access.assignment).toBeNull()
      expect(permissions.canReviewDocuments).toBe(false)
      expect(permissions.canAddInternalNote).toBe(false)
    }
  })

  it('keeps editable bond and cancellation lanes visible for an allocated attorney', () => {
    const scope = buildAttorneyMatterScope({ laneAccessContexts: {
      transfer: { canUpdateLane: true },
      bond: { isAssignedAttorney: true, canUpdateLane: true },
      cancellation: { canUpdateLane: true },
    } })
    expect([...scope.visibleLaneKeys].sort()).toEqual(['bond', 'cancellation', 'transfer'])
    expect([...scope.editableLaneKeys]).toEqual(['transfer', 'bond', 'cancellation'])
  })

  it('honours a database denial even if an older assignment check grants editing', async () => {
    mocks.client.rpc.mockImplementation(async (name) => ({ data: name !== 'bridge_can_mutate_attorney_lane', error: null }))
    const access = await getAttorneyLaneAccessContext({ transactionId, attorneyRole: 'transfer' })
    expect(access.teamWorkflowEligible).toBe(true)
    expect(access.workflowPermissionResolved).toBe(true)
    expect(access.canUpdateLane).toBe(false)
    expect(resolveAttorneyActionPermissions({
      appRole: 'attorney', membership, attorneyAccess: access, canViewAsAttorney: true,
    }).canUpdateLane).toBe(false)
  })

  it('keeps cross-lane editing closed when the permission RPC is unavailable', async () => {
    mocks.client.rpc.mockImplementation(async (name) => name === 'bridge_can_mutate_attorney_lane'
      ? { data: null, error: { code: 'PGRST202' } } : { data: true, error: null })
    const access = await getAttorneyLaneAccessContext({ transactionId, attorneyRole: 'bond' })
    expect(access.canUpdateLane).toBe(false)
  })

  it('allows task outcome audit updates without granting standalone notes or client publishing', () => {
    const context = { canUpdateLane: true, canAddInternalNote: false, canAddSharedUpdate: false, canPublishClientVisibleUpdate: false }
    for (const visibility of ['internal', 'professional_shared']) {
      expect(() => assertCanPublishVisibility(context, visibility, { workflowMutation: true })).not.toThrow()
      expect(() => assertCanPublishVisibility(context, visibility)).toThrow(/permission/)
    }
    expect(() => assertCanPublishVisibility(context, 'client_visible', { workflowMutation: true })).toThrow(/permission/)
  })
})

describe('attorney matter team access', () => {
  it('opens the matter when the database grants assigned-firm team access', async () => {
    await expect(canAccessAttorneyMatter(
      '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
      '37f3adfa-5f63-45af-95cf-9acb5037b38e',
      null,
      { membership: null },
    )).resolves.toBe(true)

    expect(mocks.client.rpc).toHaveBeenCalledWith('bridge_attorney_matter_team_access', {
      p_transaction_id: '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
      p_firm_id: '37f3adfa-5f63-45af-95cf-9acb5037b38e',
      p_capability: 'view',
    })
  })

  it('hides an allocated matter from a firm member outside its team', async () => {
    mocks.client.rpc.mockResolvedValue({ data: false, error: null })
    await expect(canAccessAttorneyMatter(
      '3b53b01f-9f89-4e0c-9912-77bce2ac7f69',
      '37f3adfa-5f63-45af-95cf-9acb5037b38e',
    )).resolves.toBe(false)
  })
})
