import assert from 'node:assert/strict'
import { assessRentalFoundationSqlSafetyReview } from '../rentalFoundationSqlSafetyReview.js'

const safe = assessRentalFoundationSqlSafetyReview({
  sourceLock: { authoringAllowed: true },
  sources: [{ path: 'safe.sql', sql: 'begin;\ncreate table example (id uuid);\ncommit;' }],
})
assert.equal(safe.authoringAllowed, true)
assert.equal(safe.applyAllowed, false)

const privileged = assessRentalFoundationSqlSafetyReview({
  sourceLock: { authoringAllowed: true },
  sources: [{ path: 'privileged.sql', sql: 'begin;\ncreate function x() returns void language plpgsql security definer as $$ begin end; $$;\ncommit;' }],
})
assert.equal(privileged.authoringAllowed, false)
assert.deepEqual(privileged.securityDefinerFiles, ['privileged.sql'])

const destructive = assessRentalFoundationSqlSafetyReview({
  sourceLock: { authoringAllowed: true },
  sources: [{ path: 'unsafe.sql', sql: 'begin;\ndrop table example;\ncommit;' }],
})
assert.equal(destructive.authoringAllowed, false)
assert.equal(destructive.destructiveOperations.length, 1)

console.log('Rental foundation SQL safety-review Phase 7 contract passed.')
