import assert from 'node:assert/strict'
import { runMvpTransactionScenario } from '../mvpScenarioSimulation.js'
import { auditMvpTransactionIntegrity } from '../mvpTransactionIntegrityAudit.js'
const result = runMvpTransactionScenario({ id: 'audit', transactionType: 'resale', financeType: 'cash', buyerEntityType: 'individual', sellerEntityType: 'individual', propertyTenure: 'freehold' })
assert.equal(auditMvpTransactionIntegrity(result).passed, true)
assert.ok(auditMvpTransactionIntegrity({}).issues.includes('launch_scope_not_supported'))
console.log('mvp transaction integrity audit tests passed')
