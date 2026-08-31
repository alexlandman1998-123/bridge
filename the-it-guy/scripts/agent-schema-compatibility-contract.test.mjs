import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile('src/services/agentLeadWorkspaceService.js', 'utf8')

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  const end = nextName ? source.indexOf(`async function ${nextName}`, start + 1) : source.length
  assert.notEqual(start, -1, `${name} must exist`)
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`)
  return source.slice(start, end)
}

const transactionRead = functionSource('safeReadTransactions', 'safeReadPrivateListings')
const listingRead = functionSource('safeReadPrivateListings', 'safeReadDocumentPackets')

assert.doesNotMatch(transactionRead, /\bcurrent_stage\b/, 'Agent transaction hydration must use current_main_stage')
assert.doesNotMatch(transactionRead, /\bstatus\b/, 'Agent transaction hydration must use canonical stage/lifecycle columns')
assert.doesNotMatch(listingRead, /\bproperty_address\b/, 'Agent listing hydration must use address_line_1/formatted_address')
assert.match(listingRead, /\baddress_line_1\b/)
assert.match(listingRead, /\bformatted_address\b/)

console.log('agent schema compatibility contract passed')
