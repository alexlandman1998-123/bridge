import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.match(componentSource, /Collapse workflow stages/)
assert.match(componentSource, /Expand workflow stages/)
assert.match(componentSource, /before:bg-emerald-700/)
assert.match(componentSource, /phaseExceptions\.get\(phase\.key\)/)
assert.match(componentSource, /exception\?\.primary\?\.taskKey/)
assert.match(componentSource, /current === phaseKey \? '' : phaseKey/)
assert.match(componentSource, /!collapsed && expanded && phase\.tasks\?\.length/)
assert.match(componentSource, /max-h-\[52vh\]/)
assert.doesNotMatch(componentSource, /xl:min-h-\[600px\]/)

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /selectionStorageKey = ''/)
assert.match(pageSource, /window\.sessionStorage\.getItem\(selectionStorageKey\)/)
assert.match(pageSource, /window\.sessionStorage\.setItem\(selectionStorageKey, selectedTask\.key\)/)
assert.match(pageSource, /arch9:attorney-workflow-selection:\$\{transaction\.id\}:\$\{archlineActiveLegalTaskWorkflowKey\}/)

console.log('Legal task workbench UX Phase 2 checks passed.')
