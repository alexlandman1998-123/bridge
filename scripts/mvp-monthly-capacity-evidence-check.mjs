import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
if (!inputArg) throw new Error('Use --input=<production-rollout-evidence.json>.')
const input = JSON.parse(readFileSync(path.resolve(repoRoot, inputArg.slice('--input='.length)), 'utf8'))

assert.equal(input.environment, 'production', 'Monthly capacity evidence must be marked production.')
assert.ok(/^\d{4}-(0[1-9]|1[0-2])$/.test(String(input.reportingMonth || '')), 'reportingMonth must use YYYY-MM.')
assert.ok(String(input.recordedAt || '').trim(), 'recordedAt is required.')
assert.equal(Number.isNaN(Date.parse(input.recordedAt)), false, 'recordedAt must be an ISO-compatible timestamp.')
assert.equal([10, 25, 50, 100].includes(Number(input.currentCapacity)), true, 'currentCapacity must be an MVP capacity level.')
assert.equal(Array.isArray(input.monthlyTransactionReferences), true, 'monthlyTransactionReferences is required.')
const references = input.monthlyTransactionReferences.map((value) => String(value).trim())
assert.equal(references.every(Boolean), true, 'Each monthly transaction reference is required.')
assert.equal(new Set(references).size, references.length, 'Monthly transaction references must be unique.')
assert.equal(input.monthlyTransactionCount, references.length, 'monthlyTransactionCount must match the reference ledger.')
assert.ok(references.length <= Number(input.currentCapacity), 'Monthly transaction count exceeds the approved capacity level.')
assert.ok(references.length <= 100, 'Monthly transaction count exceeds the MVP limit of 100.')
const transactionIds = (input.transactions || []).map((transaction) => String(transaction.transactionId || transaction.id || '').trim()).filter(Boolean)
assert.equal(transactionIds.every((id) => references.includes(id)), true, 'Every transaction in rollout evidence must appear in the monthly reference ledger.')
assert.equal(input.productionCredentialsUsed, false, 'Monthly capacity evidence must not use production credentials.')

console.log(JSON.stringify({
  version: 'arch9_mvp_monthly_capacity_evidence_v1',
  passed: true,
  reportingMonth: input.reportingMonth,
  currentCapacity: Number(input.currentCapacity),
  monthlyTransactionCount: references.length,
  remainingCapacity: Number(input.currentCapacity) - references.length,
  safety: 'This validates non-secret monthly capacity evidence only; it does not read or modify production data.',
}, null, 2))
