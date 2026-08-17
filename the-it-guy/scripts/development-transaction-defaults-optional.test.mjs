import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/components/AddDevelopmentModal.jsx', import.meta.url), 'utf8')

const defaultBlockMatch = source.match(/const DEFAULT_TRANSACTION_DEFAULTS = \{[\s\S]*?\n\}/)
assert.ok(defaultBlockMatch, 'AddDevelopmentModal should define transaction defaults.')

const defaultBlock = defaultBlockMatch[0]

for (const expectedBlankDefault of [
  "defaultAgentSource: 'none'",
  "defaultTransferAttorneySource: 'none'",
  "defaultBondOriginatorSource: 'none'",
]) {
  assert.match(defaultBlock, new RegExp(expectedBlankDefault.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Transaction defaults should start blank: ${expectedBlankDefault}.`)
}

assert.match(
  source,
  /Optional defaults can be left blank and refined after setup\./,
  'Transaction Defaults copy should clearly mark the setup as optional.',
)

assert.doesNotMatch(source, /Cancellation Attorney/, 'Development transaction defaults should not show a cancellation attorney.')
assert.doesNotMatch(source, /buildTransactionDefaultPatch/, 'Developer Partner defaults should not be auto-applied to transaction defaults.')
assert.doesNotMatch(
  source,
  /setTransactionDefaults\(\(previous\) => \(\{ \.\.\.previous, \.\.\.defaultPatch \}\)\)/,
  'Loading Developer Partner defaults should not mutate skipped transaction defaults.',
)

assert.doesNotMatch(
  source,
  /\['Defaults',\s*defaultsComplete\]/,
  'Development summary completion should not treat transaction defaults as required.',
)

console.log('Development transaction defaults optional contract passed.')
