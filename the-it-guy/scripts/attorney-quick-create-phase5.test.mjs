import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8')
const resolverStart = source.indexOf('function getAttorneyQuickCreateOrder')
const resolverEnd = source.indexOf('const BOND_ORIGINATOR_QUICK_CREATE_GROUPS')
const resolver = source.slice(resolverStart, resolverEnd)

assert.ok(resolverStart >= 0, 'Attorney contextual quick-create resolver should exist')
assert.match(resolver, /\/attorney\/scheduling/)
assert.match(resolver, /\['attorney-appointment', 'attorney-matter', 'attorney-lead'\]/)
assert.match(resolver, /\/attorney\/leads/)
assert.match(resolver, /\/attorney\/pipeline/)
assert.match(resolver, /\/attorney\/matters\/active/)
assert.match(resolver, /\['attorney-lead', 'attorney-matter', 'attorney-appointment'\]/)
assert.match(source, /ATTORNEY_QUICK_CREATE_DEFAULT_ORDER[\s\S]*?'attorney-matter'[\s\S]*?'attorney-lead'[\s\S]*?'attorney-appointment'/)
assert.match(source, /const contextualOrder = getAttorneyQuickCreateOrder\(location\.pathname\)/)
assert.match(source, /\.sort\(\(left, right\) => contextualOrder\.indexOf\(left\.type\) - contextualOrder\.indexOf\(right\.type\)\)/)
assert.match(source, /<span className="hidden sm:inline">Create<\/span>/)

console.log('Attorney quick-create Phase 5 checks passed.')
