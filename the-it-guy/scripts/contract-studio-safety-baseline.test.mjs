import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

function getFunctionBlock(source, name) {
  const declarationMatch = source.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`))
  assert.ok(declarationMatch, `${name} should remain defined.`)

  const paramsStart = source.indexOf('(', declarationMatch.index)
  let paramsDepth = 0
  let paramsEnd = -1
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(') paramsDepth += 1
    if (char === ')') paramsDepth -= 1
    if (paramsDepth === 0) {
      paramsEnd = index
      break
    }
  }

  assert.notEqual(paramsEnd, -1, `${name} should have a closed parameter list.`)

  const bodyStart = source.indexOf('{', paramsEnd)
  assert.notEqual(bodyStart, -1, `${name} should have a function body.`)

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart, index + 1)
  }

  assert.fail(`${name} should have a closed function body.`)
}

function assertFunctionReferences(source, name, references) {
  const block = getFunctionBlock(source, name)
  for (const reference of references) {
    assertIncludes(block, reference, `${name} should keep using ${reference}.`)
  }
}

const page = await read('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const studioUi = await read('../src/pages/settings/contractStudioUi.jsx')
const studioConstants = await read('../src/pages/settings/contractStudioConstants.js')
const packetService = await read('../src/core/documents/packetService.js')
const documentPacketsApi = await read('../src/lib/documentPacketsApi.js')
const packageJson = JSON.parse(await read('../package.json'))

assert.equal(
  packageJson.scripts?.['test:contract-studio-safety-baseline'],
  'node scripts/contract-studio-safety-baseline.test.mjs',
  'package.json should expose the Document Builder safety baseline test.',
)

for (const importName of [
  'generateFinalSignedPacketDocument',
  'generatePacketVersion',
  'generateSigningLinks',
  'getPacketSigningSummary',
  'prepareSigningFields',
  'renderPacketPreview',
]) {
  assert.match(page, new RegExp(`\\b${importName}\\b`), `Document Builder page should still import/use ${importName}.`)
  assert.match(packetService, new RegExp(`export\\s+async\\s+function\\s+${importName}\\b`), `packetService should still export ${importName}.`)
}

for (const importName of [
  'archiveDocumentPacket',
  'createDocumentPacket',
  'createDocumentPacketTemplate',
  'deleteDocumentPacketTemplate',
  'fetchDocumentPacket',
  'fetchDocumentPacketTemplate',
  'listDocumentPackets',
  'listDocumentPacketTemplates',
  'updateDocumentPacketTemplate',
]) {
  assert.match(page, new RegExp(`\\b${importName}\\b`), `Document Builder page should still import/use ${importName}.`)
  assert.match(documentPacketsApi, new RegExp(`export\\s+async\\s+function\\s+${importName}\\b`), `documentPacketsApi should still export ${importName}.`)
}

assertFunctionReferences(page, 'handleTestGenerate', [
  'buildPreviewTemplateFromForm',
  'buildSamplePreviewContext',
  'renderPacketPreview',
  'setPreviewState',
])

assertFunctionReferences(page, 'handleTestGenerateFromRun', [
  'buildDocumentRunPayload',
  'renderPacketPreview',
  'setPreviewState',
])

assertFunctionReferences(page, 'handleCreateDocumentPacketFromRun', [
  'buildDocumentRunPayload',
  'createDocumentPacket',
  'loadDocumentLibrary',
])

assertFunctionReferences(page, 'handleGenerateLibraryPacket', [
  'generatePacketVersion',
  'loadDocumentLibrary',
  'loadLibraryPacketDetail',
])

assertFunctionReferences(page, 'handlePrepareSigningForLibraryPacket', [
  'prepareSigningFields',
  'loadLibraryPacketSigningSummary',
])

assertFunctionReferences(page, 'handleGenerateSigningLinksForLibraryPacket', [
  'generateSigningLinks',
  'setSigningLinksResult',
  'loadLibraryPacketSigningSummary',
])

assertFunctionReferences(page, 'handleGenerateFinalSignedForLibraryPacket', [
  'generateFinalSignedPacketDocument',
  'loadDocumentLibrary',
  'loadLibraryPacketDetail',
])

assert.match(
  page,
  /const loadLibraryPacketSigningSummary = useCallback\([\s\S]*getPacketSigningSummary[\s\S]*setSelectedPacketSigningSummary/,
  'Signing summary callback should keep using getPacketSigningSummary and storing the result.',
)

assert.match(
  studioConstants,
  /SIMPLE_DOCUMENT_BUILDER_FEATURE_FLAG\s*=\s*'VITE_ENABLE_SIMPLE_DOCUMENT_BUILDER'[\s\S]*isSimpleDocumentBuilderEnabled/,
  'Phase 1 simplified UI should be behind an explicit environment flag.',
)
assert.match(
  page,
  /isSimpleDocumentBuilderEnabled\(\)[\s\S]*data-simple-document-builder=\{simpleDocumentBuilderEnabled \? 'enabled' : 'off'\}/,
  'The simplified document builder flag should be wired as a dormant page marker only.',
)

assert.doesNotMatch(
  page,
  /activeStudioArea[^=]*=\s*simpleDocumentBuilderEnabled|activeTab[^=]*=\s*simpleDocumentBuilderEnabled/,
  'The simplified document builder flag must not change the current default active area or tab in Phase 0.',
)

assert.doesNotMatch(
  page,
  /function\s+DocumentCreationPanel\s*\(/,
  'DocumentCreationPanel should stay extracted so the main page is not rebuilt as inline markup.',
)
assert.match(studioUi, /export function DocumentCreationPanel/, 'DocumentCreationPanel should remain in the shared UI module.')
assert.match(studioUi, /createDefaultDocumentRunForm/, 'DocumentCreationPanel should still use the existing default document run helper.')
assert.match(studioUi, /export function DocumentBuilderActionRail/, 'Phase 2 should keep the simple action rail extracted in the shared UI module.')
assert.match(studioUi, /sm:grid-cols-2 xl:grid-cols-4[\s\S]*min-h-\[72px\][\s\S]*min-w-0/, 'DocumentBuilderActionRail should keep stable responsive dimensions to avoid overlapping labels.')
assert.match(
  page,
  /<DocumentBuilderActionRail actions=\{documentBuilderActions\} \/>/,
  'Document Builder should render the simple primary action rail.',
)
for (const actionLabel of ['Edit', 'Preview', 'Create', 'Make live']) {
  assert.match(page, new RegExp(`label: '${actionLabel}'`), `Document Builder action rail should include ${actionLabel}.`)
}
assert.match(
  page,
  /overflow-x-auto rounded-\[18px\][\s\S]*CONTRACT_STUDIO_AREAS\.map/,
  'Document Builder area switcher should stay compact and horizontally safe.',
)
assert.doesNotMatch(page, /MANDATE DOCUMENT CANVAS/, 'Phase 3 should not reintroduce the duplicate canvas label.')
assert.match(
  page,
  /aria-label="Section title"[\s\S]*placeholder=\{`Section \$\{selectedSectionIndex \+ 1\}`\}/,
  'Phase 3 should keep the section title as a compact editable header.',
)
assert.match(
  page,
  /Raw source \(advanced\)[\s\S]*Use only when the visual editor needs cleanup\./,
  'Phase 3 should keep raw source editing clearly marked as advanced.',
)
for (const simplifiedLabel of ['Show Clause When', 'Signing Fields', 'Search fields...']) {
  assert.match(page, new RegExp(simplifiedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 3 should keep simplified editor label: ${simplifiedLabel}.`)
}

assert.match(
  page,
  /<details\s+defaultOpen=\{selectedSectionCondition\.enabled\}[\s\S]*Show Clause When[\s\S]*Only use this when a section should appear for certain deals\./,
  'Phase 4 should tuck conditional clause rules into an optional disclosure panel.',
)
assert.match(
  page,
  /<details\s+defaultOpen=\{Boolean\(selectedSigningFields\.length\)\}[\s\S]*Signing Fields[\s\S]*Add boxes only when this section needs a signature, date, witness, or initials\./,
  'Phase 4 should tuck signing-field planning into an optional disclosure panel.',
)
assert.match(
  page,
  /<details\s+defaultOpen[\s\S]*<h2 className="mt-2 text-base font-semibold text-\[#102033\]">Fields<\/h2>/,
  'Phase 4 should keep field insertion visible by default while still collapsible.',
)
assert.match(
  page,
  /View all fields/,
  'Phase 4 should keep helper copy in field language instead of variable jargon.',
)

assert.match(
  studioUi,
  /What are you making\?[\s\S]*<select[\s\S]*DOCUMENT_CREATION_KIND_OPTIONS\.map/,
  'Phase 5 should reduce document creation to one clear document-type chooser.',
)
assert.match(
  studioUi,
  /Step 2[\s\S]*handleCreateDocumentPacketFromRun\(\{ autoGenerate: true \}\)[\s\S]*Create Document/,
  'Phase 5 should keep one primary create action that uses the existing auto-generate handler.',
)
assert.match(
  studioUi,
  /<span>More options<\/span>[\s\S]*Preview[\s\S]*Save Draft/,
  'Phase 5 should tuck preview and draft-only actions into More options.',
)
assert.doesNotMatch(
  studioUi,
  /Create & Generate|Preview Document|Save Draft Document/,
  'Phase 5 should not reintroduce the old three-button create decision stack.',
)

assert.match(
  page,
  /label: 'Text'[\s\S]*handleInsertDocumentBlock\('paragraph'\)[\s\S]*label: 'Table'[\s\S]*label: 'Signature'/,
  'Phase 6 should keep the canvas toolbar focused on the three common insert actions.',
)
assert.match(
  page,
  /<span>More inserts<\/span>[\s\S]*Heading[\s\S]*Page break[\s\S]*Initials[\s\S]*Witness[\s\S]*Raw source/,
  'Phase 6 should tuck advanced insert actions and raw source into More inserts.',
)
assert.doesNotMatch(
  page,
  /label: 'Paragraph'[\s\S]*label: 'Heading'[\s\S]*label: 'Table'[\s\S]*label: 'Page break'[\s\S]*label: 'Signature'[\s\S]*label: 'Initials'[\s\S]*label: 'Witness'/,
  'Phase 6 should not reintroduce the old seven-button insert strip.',
)

assert.match(
  page,
  /Document actions[\s\S]*Save Draft[\s\S]*Preview[\s\S]*Make live/,
  'Phase 7 should keep the editor footer as a compact action bar.',
)
assert.match(
  page,
  /disabled=\{makeLiveDisabled\}[\s\S]*<span>Make live<\/span>/,
  'Phase 7 should reuse the shared make-live disabled state in the footer action.',
)
assert.doesNotMatch(
  page,
  /Need help\?|Saving will create your agency draft|View guide or contact support/,
  'Phase 7 should not reintroduce the old help and explanatory cards in the editor footer.',
)

assert.match(
  page,
  /xl:grid-cols-\[220px_minmax\(0,1fr\)_minmax\(260px,300px\)\]\s+2xl:grid-cols-\[260px_minmax\(0,1fr\)_minmax\(280px,320px\)\]/,
  'Phase 8 should keep the expanded outline layout bounded while giving the editor more room on xl screens.',
)
assert.match(
  page,
  /xl:grid-cols-\[64px_minmax\(0,1fr\)_minmax\(260px,300px\)\]\s+2xl:grid-cols-\[64px_minmax\(0,1fr\)_minmax\(280px,320px\)\]/,
  'Phase 8 should keep collapsed outline mode bounded with minmax(0,1fr).',
)
assert.match(
  page,
  /<main className="min-w-0 overflow-hidden[\s\S]*<aside className="min-w-0 max-w-full space-y-4 overflow-x-hidden/,
  'Phase 8 should keep the editor canvas and right rail from creating page-level horizontal overflow.',
)
assert.match(
  page,
  /min-h-\[560px\][\s\S]*sm:min-h-\[680px\][\s\S]*sm:px-8[\s\S]*lg:px-10/,
  'Phase 8 should give the document canvas mobile-safe padding and desktop breathing room.',
)
assert.match(
  page,
  /block truncate text-sm font-semibold[\s\S]*block break-all font-mono/,
  'Phase 8 should prevent long field labels and raw merge keys from widening the right rail.',
)

assertFunctionReferences(page, 'resolveSigningFieldPlanCollisions', [
  'placed.some',
  'rect.xPosition',
  'rect.yPosition',
  'guard < 20',
])
assertFunctionReferences(page, 'setSelectedSectionSigningFields', [
  'resolveSigningFieldPlanCollisions',
  'planned_fields',
  'signing_fields',
])

assert.match(
  page,
  /const documentBuilderModeLabel[\s\S]*activeStudioArea === 'templates'[\s\S]*activeDocumentTypeConfig[\s\S]*activeTemplateTabConfig/,
  'Phase 9 should summarize the current Document Builder mode in plain language.',
)
assert.match(
  page,
  /const guidedNextAction = \(\(\) => \{[\s\S]*Start with a template[\s\S]*Make an editable copy[\s\S]*Save your draft[\s\S]*Check the layout[\s\S]*Ready to make live[\s\S]*Template is live/,
  'Phase 9 should keep one guided next action for the main document lifecycle states.',
)
assert.match(
  page,
  /Current workspace[\s\S]*Next best action[\s\S]*guidedNextAction\.title[\s\S]*guidedNextAction\.description/,
  'Phase 9 should render a calm first-viewport guidance card.',
)
assert.match(
  page,
  /handleCreateTemplate\(\)[\s\S]*handleSaveDraftAction\(event\)[\s\S]*openTemplatePreview\(\)[\s\S]*openPublishDialog[\s\S]*setActiveStudioArea\('documents'\)/,
  'Phase 9 guidance should reuse existing template, save, preview, publish, and document actions.',
)
assert.match(
  page,
  /<GuidedNextIcon size=\{14\} \/>[\s\S]*<span>\{guidedNextAction\.label\}<\/span>/,
  'Phase 9 should keep the guided action compact with an icon and label.',
)

assert.match(
  page,
  /<details className="group rounded-\[18px\][\s\S]*Switch document type or view[\s\S]*\{documentBuilderModeLabel\}[\s\S]*CONTRACT_STUDIO_AREAS\.map[\s\S]*simpleDocumentTabs\.map[\s\S]*Template status[\s\S]*CONTRACT_STUDIO_TABS\.map/,
  'Phase 10 should tuck secondary workspace, document-type, and tab navigation into one calm disclosure.',
)
assert.match(
  page,
  /selectedIsOrgOwned \? 'Agency draft' : 'Standard template'/,
  'Phase 10 should keep template status short and scannable.',
)
assert.doesNotMatch(
  page,
  /You are editing your agency draft\.|This is the standard Arch9 document\. Saving creates your agency draft\./,
  'Phase 10 should not reintroduce the old long header status copy.',
)

assertFunctionReferences(page, 'getSigningFieldPreviewLayout', [
  'placed.some',
  'rect.previewX',
  'rect.previewY',
  'guard < 20',
])

console.log('contract-studio-safety-baseline tests passed')
