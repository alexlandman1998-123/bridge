import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const service = await readFile(new URL('../the-it-guy/src/services/propertyIntelligence/knowledgeFactoryOperationsService.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../the-it-guy/src/components/canvassing/KnowledgeFactoryOperationsWorkspace.jsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../the-it-guy/src/pages/PipelineCanvassingPage.jsx', import.meta.url), 'utf8')

assert.match(service, /knowledge_factory_audit_log/)
assert.match(service, /credits/)
assert.match(workspace, /Knowledge Factory operations/)
assert.match(workspace, /Emergency suspension remains an explicit administrator change/i)
assert.match(page, /KnowledgeFactoryOperationsWorkspace/)
console.log('Knowledge Factory Phase 6 operations checks passed.')
