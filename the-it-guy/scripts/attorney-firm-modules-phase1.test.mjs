import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ATTORNEY_FIRM_MODULE_KEYS,
  getAttorneyFirmModuleDefinition,
} from '../src/constants/attorneyFirmModules.js'
import {
  buildDefaultAttorneyFirmModules,
  getAttorneyFirmModules,
  resolveAttorneyFirmModuleCapabilities,
  setAttorneyFirmModuleStatus,
} from '../src/services/attorneyFirmModulesService.js'

const migrationSource = readFileSync(
  new URL('../../supabase/migrations/202607170009_attorney_firm_modules_phase1_foundation.sql', import.meta.url),
  'utf8',
)

assert.deepEqual(ATTORNEY_FIRM_MODULE_KEYS, ['transfer', 'bond', 'cancellation'])
assert.equal(getAttorneyFirmModuleDefinition('bond')?.label, 'Bond Registrations')

const defaults = buildDefaultAttorneyFirmModules('firm-1')
assert.equal(defaults.length, 3)
assert.ok(defaults.every((module) => module.status === 'active'))

const capabilities = resolveAttorneyFirmModuleCapabilities([
  { firm_id: 'firm-1', module_key: 'transfer', status: 'active' },
  { firm_id: 'firm-1', module_key: 'bond', status: 'winding_down' },
  { firm_id: 'firm-1', module_key: 'cancellation', status: 'inactive', deactivated_at: '2026-07-17T00:00:00Z' },
])

assert.deepEqual(capabilities.activeModules, ['transfer'])
assert.deepEqual(capabilities.operationalModules, ['transfer', 'bond'])
assert.deepEqual(capabilities.inactiveModules, ['cancellation'])
assert.equal(capabilities.canAcceptNewWork('transfer'), true)
assert.equal(capabilities.canAcceptNewWork('bond'), false)
assert.equal(capabilities.isOperational.bond, true)
assert.equal(capabilities.isOperational.cancellation, false)

const rpcCalls = []
const client = {
  async rpc(name, payload) {
    rpcCalls.push({ name, payload })
    if (name === 'get_attorney_firm_modules') {
      return { data: [{ firm_id: 'firm-1', module_key: 'transfer', status: 'active' }], error: null }
    }
    return {
      data: { firm_id: 'firm-1', module_key: payload.p_module_key, status: payload.p_status },
      error: null,
    }
  },
}

assert.equal((await getAttorneyFirmModules('firm-1', { client }))[0].moduleKey, 'transfer')
assert.equal((await setAttorneyFirmModuleStatus('firm-1', 'bond', 'winding_down', { client })).status, 'winding_down')
assert.deepEqual(rpcCalls.map((call) => call.name), [
  'get_attorney_firm_modules',
  'set_attorney_firm_module_status',
])

const fallbackModules = await getAttorneyFirmModules('firm-legacy', {
  client: {
    async rpc() {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function get_attorney_firm_modules' } }
    },
  },
})
assert.equal(fallbackModules.length, 3)
assert.ok(fallbackModules.every((module) => module.status === 'active'))

assert.match(migrationSource, /create table if not exists public\.attorney_firm_modules/)
assert.match(migrationSource, /check \(module_key in \('transfer', 'bond', 'cancellation'\)\)/)
assert.match(migrationSource, /check \(status in \('active', 'winding_down', 'inactive'\)\)/)
assert.match(migrationSource, /create trigger trg_attorney_firms_seed_modules/)
assert.match(migrationSource, /cross join \([\s\S]*values \('transfer'\), \('bond'\), \('cancellation'\)/)
assert.match(migrationSource, /create or replace function public\.get_attorney_firm_modules/)
assert.match(migrationSource, /create or replace function public\.set_attorney_firm_module_status/)
assert.match(migrationSource, /An attorney firm must retain at least one operational module/)
assert.match(migrationSource, /create or replace function public\.attorney_firm_module_accepts_new_work/)
assert.match(migrationSource, /grant select on public\.attorney_firm_modules to authenticated/)
assert.doesNotMatch(migrationSource, /grant select, insert, update, delete on public\.attorney_firm_modules to authenticated/)

console.log('attorney firm modules Phase 1 foundation tests passed')
