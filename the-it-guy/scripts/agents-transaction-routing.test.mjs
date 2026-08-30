import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/Agents.jsx', import.meta.url), 'utf8')
const openTransactionBlock = source.match(/function openTransaction\(row\) \{[\s\S]*?\n  \}/)?.[0] || ''

assert.match(
  openTransactionBlock,
  /const transactionId = transaction\.id[\s\S]*?navigate\(`\/transactions\/\$\{transactionId\}`/,
  'Agents transaction rows should open the canonical transaction workspace when a transaction ID exists.',
)
assert.match(
  openTransactionBlock,
  /state: \{[\s\S]*?matterPreview: \{[\s\S]*?matterId: transactionId/,
  'Agents transaction navigation should carry a lightweight preview for the destination shell.',
)
assert.match(
  openTransactionBlock,
  /const unitId =[\s\S]*?navigate\(unitId \? `\/units\/\$\{unitId\}` : '\/transactions'\)/,
  'Unit detail should remain a fallback only for rows that do not have a transaction ID.',
)
assert.doesNotMatch(
  openTransactionBlock,
  /const unitId =[\s\S]*?if \(unitId\)[\s\S]*?navigate\(`\/units\/\$\{unitId\}`\)/,
  'The legacy unit workspace must not take priority over a transaction ID.',
)

console.log('agents transaction routing contract ok')
