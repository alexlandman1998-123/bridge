#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('sql/phase24-production-attorney-assignment-remediation.sql', 'utf8')

assert.match(sql, /^begin;/)
assert.match(sql, /candidate_count <> 43 or distinct_transaction_count <> 43/)
assert.match(sql, /professional_role = 'firm_admin'/)
assert.match(sql, /for update/)
assert.match(sql, /attorney_user_id = '85a49e81-92a9-43bc-906d-d9ad93f4c12c'/)
assert.match(sql, /remediationRunId', '4ae12168-79f3-4f83-b5a8-18a424ceb59c'/)
assert.match(sql, /audit_count <> 43 or blocking_count <> 0/)
assert.match(sql, /certify_attorney_role_release_phase9/)
assert.match(sql, /commit;\s*$/)

console.log('Phase 24 production attorney remediation contract passed.')
