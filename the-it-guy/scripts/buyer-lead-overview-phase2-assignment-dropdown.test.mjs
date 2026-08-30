import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const componentStart = pageSource.indexOf('function BuyerLeadAssignmentDropdown(')
const workspaceStart = pageSource.indexOf('function AgencyPipelinePage(', componentStart)

assert.notEqual(componentStart, -1, 'buyer assignment dropdown must be extracted from the workspace')
assert.notEqual(workspaceStart, -1, 'agency workspace boundary is missing')

const dropdownSource = pageSource.slice(componentStart, workspaceStart)
assert.match(dropdownSource, /const \[open, setOpen\] = useState\(false\)/, 'dropdown open state must be isolated from the workspace')
assert.match(dropdownSource, /const \[search, setSearch\] = useState\(''\)/, 'dropdown search state must be isolated from the workspace')
assert.match(dropdownSource, /triggerRef\.current\?\.contains\(event\.target\) \|\| menuRef\.current\?\.contains\(event\.target\)/, 'trigger and menu must be the only inside-click regions')
assert.match(dropdownSource, /document\.addEventListener\('pointerdown', handlePointerDown, true\)/, 'outside dismissal must cover mouse, pen and touch before click handling')
assert.match(dropdownSource, /document\.removeEventListener\('pointerdown', handlePointerDown, true\)/, 'outside dismissal listener must be cleaned up')
assert.match(dropdownSource, /event\.key !== 'Escape'/, 'Escape dismissal must remain available')
assert.match(dropdownSource, /data-testid="buyer-assignment-trigger"/, 'assignment trigger contract is missing')
assert.match(dropdownSource, /data-testid="buyer-assignment-menu"/, 'assignment menu contract is missing')
assert.match(pageSource, /isolated_dropdown_request_animation_frame/, 'isolated render timing marker is missing')
assert.match(pageSource, /<BuyerLeadAssignmentDropdown[\s\S]*onAssign=\{handleLeadReassignment\}/, 'workspace must use the isolated dropdown without changing persistence')

console.log('buyer lead overview Phase 2 assignment dropdown contracts passed')
