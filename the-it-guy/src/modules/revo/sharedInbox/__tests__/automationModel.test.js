import assert from 'node:assert/strict'
import { buildRevoRoutingRule, isConversationOverdue, selectApplicableRoutingRule } from '../automationModel.js'

assert.equal(buildRevoRoutingRule({ organisationId: 'org', name: 'P24 sales', match: { sourceChannel: 'property24' }, action: { assignTeamId: 'sales' } }).priority, 100)
assert.throws(() => buildRevoRoutingRule({ organisationId: 'org', name: 'Invalid', action: {} }), /assignment or status/)
assert.equal(isConversationOverdue({ lastInboundAt: '2026-09-13T08:00:00Z' }, { escalationMinutes: 30 }, Date.parse('2026-09-13T09:00:00Z')), true)
assert.equal(selectApplicableRoutingRule([{ name: 'Fallback', priority: 20, action_json: {} }, { name: 'P24', priority: 10, match_json: { sourceChannel: 'property24' }, action_json: {} }], { sourceChannel: 'property24' }).name, 'P24')

console.log('Revo inbox automation model checks passed.')
