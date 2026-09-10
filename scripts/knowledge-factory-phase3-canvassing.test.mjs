import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const reportsUi = await readFile(new URL('../the-it-guy/src/components/canvassing/KnowledgeFactoryReportsWorkspace.jsx', import.meta.url), 'utf8')
const reportsWrapper = await readFile(new URL('../the-it-guy/src/components/canvassing/PropertyReportsWorkspace.jsx', import.meta.url), 'utf8')

assert.match(reportsUi, /No owner or contact identity has been imported/i)
assert.match(reportsUi, /createCanvassingProspect/)
assert.match(reportsUi, /createCanvassingActivity/)
assert.match(reportsUi, /Knowledge Factory report request:/)
assert.match(reportsUi, /Contact data was entered manually by the agent/i)
assert.match(reportsWrapper, /KnowledgeFactoryReportsWorkspace \{\.\.\.props\}/)

console.log('Knowledge Factory Phase 3 canvassing checks passed.')
