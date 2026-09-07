import assert from 'node:assert/strict'
import test from 'node:test'
import { auditDealSetupCompatibility } from '../dealSetupCompatibilityAudit.js'

test('compatibility audit identifies legacy transactions needing backfill', () => {
  const audit = auditDealSetupCompatibility({ transaction: { id: 'legacy', purchaser_type: 'individual', finance_type: 'cash' }, buyerParties: [] })
  assert.equal(audit.readyForBackfill, false)
  assert.ok(audit.issues.some((item) => item.includes('buyer')))
})
