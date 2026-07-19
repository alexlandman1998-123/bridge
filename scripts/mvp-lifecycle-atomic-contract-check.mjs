import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(path.join(repoRoot, 'the-it-guy/src/lib/transactionLifecycleService.js'), 'utf8')
const start = source.indexOf('export async function createTransactionFromLeadOverride')
const end = source.indexOf('export async function ', start + 1)
assert.notEqual(start, -1, 'The lead conversion entry point must exist.')
const implementation = source.slice(start, end === -1 ? source.length : end)

assert.match(implementation, /prepareMvpTransactionCreationCommand\(/)
assert.match(implementation, /buildMvpTransactionParticipantBootstrap\(/)
assert.match(implementation, /buildMvpTransactionDocumentBootstrap\(/)
assert.match(implementation, /buildMvpTransactionWorkflowBootstrap\(/)
assert.match(implementation, /\.rpc\('bridge_create_mvp_transaction'/)
assert.doesNotMatch(implementation, /\.from\('transactions'\)\s*\.insert\(/)

console.log('MVP lifecycle atomic creation contract passed.')
