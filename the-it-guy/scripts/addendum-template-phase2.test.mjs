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

const page = await read('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const studioUi = await read('../src/pages/settings/contractStudioUi.jsx')
const packageJson = JSON.parse(await read('../package.json'))

assert.equal(
  packageJson.scripts?.['test:addendum-template-phase2'],
  'node scripts/addendum-template-phase2.test.mjs',
  'package.json should expose the addendum template Phase 2 audit.',
)

const defaultRunBlock = getFunctionBlock(page, 'createDefaultDocumentRunForm')
for (const reference of [
  "parentDocumentId: ''",
  "parentDocumentReference: ''",
  "documentChangeSummary: ''",
]) {
  assertIncludes(defaultRunBlock, reference, `Document run defaults should include ${reference}.`)
}

const payloadBlock = getFunctionBlock(page, 'buildDocumentRunPayload')
for (const reference of [
  'const parentDocumentId = normalizeRunReference(runForm.parentDocumentId)',
  'const parentDocumentReference = normalizeText(runForm.parentDocumentReference)',
  'const documentChangeSummary = normalizeText(runForm.documentChangeSummary)',
  'parentDocumentId: parentDocumentId || sourceContextOverrides.parentDocumentId',
  'linkedDocumentId: parentDocumentId || sourceContextOverrides.linkedDocumentId',
  'parentDocumentReference: parentDocumentReference || sourceContextOverrides.parentDocumentReference',
  'documentChangeSummary: documentChangeSummary || sourceContextOverrides.documentChangeSummary',
  "documentRelationship: documentKind === 'standard' ? 'primary' : documentKind",
  'parentDocumentReference,',
  'documentChangeSummary,',
]) {
  assertIncludes(payloadBlock, reference, `Document run payload should keep ${reference}.`)
}

const packetContextBlock = getFunctionBlock(page, 'buildDocumentRunContextFromPacket')
for (const reference of [
  'const documentKind = getDocumentKindOption(sourceContext.documentKind || sourceContext.document_kind).key',
  'const parentDocumentId = normalizeText(sourceContext.parentDocumentId',
  'const parentDocumentReference = normalizeText(sourceContext.parentDocumentReference',
  'const documentChangeSummary = normalizeText(sourceContext.documentChangeSummary',
  'documentKind,',
  'documentKindLabel,',
  'parentDocumentId,',
  'parentDocumentReference,',
  'documentChangeSummary,',
]) {
  assertIncludes(packetContextBlock, reference, `Saved packet context should restore ${reference}.`)
}

const creationPanelBlock = getFunctionBlock(studioUi, 'DocumentCreationPanel')
for (const reference of [
  "const isRelatedDocumentKind = !['standard', 'custom'].includes(selectedDocumentKind)",
  'Original document packet ID',
  'Original document reference',
  'What changed?',
  'parentDocumentId',
  'parentDocumentReference',
  'documentChangeSummary',
  'Create ${selectedDocumentKindOption.label}',
  'Save ${selectedDocumentKindOption.label} Draft',
  'Link the original document',
]) {
  assertIncludes(creationPanelBlock, reference, `Create Document panel should keep ${reference}.`)
}

console.log('addendum-template-phase2 audit passed')
