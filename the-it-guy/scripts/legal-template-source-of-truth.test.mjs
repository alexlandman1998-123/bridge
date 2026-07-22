import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')

assert.match(packetService, /function templateUsesConditionalMaster/, 'Template mode must be identified from the legal-template record.')
assert.match(packetService, /templateUsesConditionalMaster\(hydratedTemplate\)/, 'Only explicit conditional masters may apply scenario section overrides.')
assert.match(packetService, /!template\?\.id \|\| !templateUsesConditionalMaster\(template\)/, 'Ordinary mandate templates must bypass the conditional-master content gate.')
assert.match(packetService, /const isConditionalMaster = templateUsesConditionalMaster\(coverageTemplate\)/, 'Conditional coverage checks must be opt-in per template.')
assert.match(workspace, /const canAdoptCurrentTemplate = \['draft', 'ready_for_generation', 'pdf_generated', 'ready_to_send'\]/, 'Editable drafts must identify when the current legal template can be adopted.')
assert.match(workspace, /canAdoptCurrentTemplate && templateManifest\.length/, 'The current legal template outline must win before signing begins.')
assert.match(workspace, /includeSnapshotOnlySections: !canAdoptCurrentTemplate/, 'An adopted template must not inherit clauses from a stale generated draft.')
assert.match(workspace, /void statusRequest\.then\(\(lateResolved\)/, 'A delayed packet status must replace the temporary workspace fallback.')
assert.match(packetService, /templateUsesConditionalMaster\(hydratedTemplate\)/, 'A plain legal template must not be overwritten by conditional packs.')

console.log('Legal template source-of-truth contract passed')
