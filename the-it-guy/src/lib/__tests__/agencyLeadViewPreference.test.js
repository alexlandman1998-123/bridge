import assert from 'node:assert/strict'
import {
  getAgencyLeadViewPreference,
  normalizeAgencyLeadViewPreference,
  saveAgencyLeadViewPreference,
} from '../agencyLeadViewPreference.js'

const previousWindow = globalThis.window
const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
  },
}

try {
  const scope = { userId: 'user-1', workspaceId: 'agency-1' }
  assert.equal(normalizeAgencyLeadViewPreference('KANBAN'), 'kanban')
  assert.equal(normalizeAgencyLeadViewPreference('anything else'), 'table')
  assert.equal(getAgencyLeadViewPreference(scope), 'table')
  assert.equal(saveAgencyLeadViewPreference(scope, 'kanban'), 'kanban')
  assert.equal(getAgencyLeadViewPreference(scope), 'kanban')
  assert.equal(getAgencyLeadViewPreference({ userId: 'user-2', workspaceId: 'agency-1' }), 'table')
  console.log('agency lead view preference tests passed')
} finally {
  globalThis.window = previousWindow
}
