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

const packageJson = JSON.parse(await read('../package.json'))
const page = await read('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-8.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase8'],
  'node scripts/document-start-phase8.test.mjs',
  'package.json should expose the document-start Phase 8 audit.',
)

for (const reference of [
  "import StartDocumentModal from '../../components/documents/StartDocumentModal'",
  'DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument',
  'const [documentLibraryStartOpen, setDocumentLibraryStartOpen] = useState(false)',
  'const documentLibraryStartHasExistingContext = Boolean',
  'const documentLibraryStartSummary = useMemo',
  'openDocumentLibraryStart',
  '<StartDocumentModal',
  'entryPoint={DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument}',
  'initialSourceMode={documentLibraryStartHasExistingContext ? DOCUMENT_START_SOURCE_MODES.saved : DOCUMENT_START_SOURCE_MODES.manual}',
  'onContinue={handleStartDocumentLibraryDocument}',
]) {
  assertIncludes(page, reference, `Document Builder should keep standalone library start wiring: ${reference}.`)
}

const startHandler = getFunctionBlock(page, 'handleStartDocumentLibraryDocument')
for (const reference of [
  'DOCUMENT_START_SOURCE_MODES.manual',
  "sourceType: useManualDetails",
  "transactionId: ''",
  "leadId: ''",
  "contactId: ''",
  "dealId: ''",
  "unitId: ''",
  'Standalone document start is ready',
  'Saved-details document start is ready',
]) {
  assertIncludes(startHandler, reference, `Document library start handler should keep ${reference}.`)
}

const runPayload = getFunctionBlock(page, 'buildDocumentRunPayload')
for (const reference of [
  'const documentStart = normalizeText(runForm.documentStart || DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument)',
  'const inferredStartSourceMode = sourceType === \'manual\'',
  'documentStart,',
  'document_start: documentStart',
  'sourceMode: documentStartSourceMode',
  'source_mode: documentStartSourceMode',
  'standaloneDocumentStart',
  'standalone_document_start',
]) {
  assertIncludes(runPayload, reference, `Document run payload should preserve standalone source context: ${reference}.`)
}

for (const reference of [
  'standalone document-library starts',
  'Create Document opens the Start Document modal',
  'documentStart=document_library_document',
  'sourceMode',
  'No new packet table',
  'No duplicate document generator',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 8 rollout note should keep ${reference}.`)
}

console.log('document-start-phase8 audit passed')
