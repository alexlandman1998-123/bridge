import assert from 'node:assert/strict'
import { buildMvpTransactionControlBoard } from '../mvpTransactionControlBoard.js'
const board = buildMvpTransactionControlBoard({ transactionId: 'tx-1', stage: { key: 'FIN', rank: 2 }, readiness: { status: 'blocked', financeGateSatisfied: false }, blockers: [{ type: 'finance', key: 'document:proof_of_funds' }] })
assert.equal(board.gates.find((gate) => gate.key === 'finance').blockers.length, 1)
assert.equal(board.status, 'blocked')
console.log('mvp transaction control board tests passed')
