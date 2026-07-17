import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8')

assert.match(source, /const triggerRef = useRef\(null\)/)
assert.match(source, /const menuRef = useRef\(null\)/)
assert.match(source, /menuRef\.current\?\.querySelector\('\[role="menuitem"\]'\)\?\.focus\(\)/)
assert.match(source, /event\.key === 'ArrowDown'/)
assert.match(source, /event\.key === 'ArrowUp'/)
assert.match(source, /event\.key === 'Home'/)
assert.match(source, /event\.key === 'End'/)
assert.match(source, /triggerRef\.current\?\.focus\(\)/)
assert.match(source, /aria-controls=\{open \? 'quick-create-menu' : undefined\}/)
assert.match(source, /aria-label=\{role === 'attorney' \? 'Create attorney record' : 'Create record'\}/)
assert.match(source, /Recommended here/)

assert.match(source, /eventName: 'attorney_quick_create_opened'/)
assert.match(source, /eventName: 'attorney_quick_create_action_selected'/)
assert.match(source, /metadata: \{ actionType: item\.type \}/)
assert.match(source, /availableActionCount: quickCreateGroups\.flatMap/)
assert.doesNotMatch(source, /metadata: \{[^}]*?(email|phone|name):/i)

console.log('Attorney quick-create Phase 6 checks passed.')
