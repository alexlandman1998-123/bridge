import { beforeEach, expect, it, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc } }))
import { getDevelopmentManagementAccess } from '../developmentManagementAccessService'
beforeEach(() => rpc.mockReset())
it('uses authoritative edit permission rather than the profile display role', async () => {
  rpc.mockResolvedValue({ data: true })
  expect(await getDevelopmentManagementAccess('development')).toBe(true)
  expect(rpc).toHaveBeenCalledWith('bridge_can_manage_development_record', { target_development_id: 'development' })
  rpc.mockResolvedValue({ data: false })
  expect(await getDevelopmentManagementAccess('development')).toBe(false)
})
it('fails closed and explains an access-check error without blocking lead access', async () => {
  rpc.mockResolvedValue({ error: { message: 'network' } })
  await expect(getDevelopmentManagementAccess('development')).rejects.toThrow('your leads remain available')
})
