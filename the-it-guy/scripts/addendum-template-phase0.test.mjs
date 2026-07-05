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

function getConstBlock(source, name, nextMarker) {
  const start = source.indexOf(`const ${name}`)
  assert.notEqual(start, -1, `${name} should remain defined.`)
  const end = source.indexOf(nextMarker, start)
  assert.notEqual(end, -1, `${name} should end before ${nextMarker}.`)
  return source.slice(start, end)
}

const page = await read('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const studioUi = await read('../src/pages/settings/contractStudioUi.jsx')
const studioConstants = await read('../src/pages/settings/contractStudioConstants.js')
const packageJson = JSON.parse(await read('../package.json'))

assert.equal(
  packageJson.scripts?.['test:addendum-template-phase0'],
  'node scripts/addendum-template-phase0.test.mjs',
  'package.json should expose the addendum template Phase 0 audit.',
)

assert.match(
  studioConstants,
  /DOCUMENT_CREATION_KIND_OPTIONS[\s\S]*key: 'addendum'[\s\S]*label: 'Addendum'[\s\S]*linked to an existing deal or mandate/,
  'Addendum should remain available as a document creation kind.',
)

const supportedPacketTypesBlock = getConstBlock(page, 'SUPPORTED_PACKET_TYPES', 'const DEFAULT_ALLOWED_PACKET_TYPES')
for (const packetType of ['otp', 'mandate']) {
  assert.match(
    supportedPacketTypesBlock,
    new RegExp(`key: '${packetType}'`),
    `Existing ${packetType} packet type should remain supported.`,
  )
}
assert.doesNotMatch(
  supportedPacketTypesBlock,
  /addendum/i,
  'Phase 0 should not introduce addendum as a separate packet type.',
)

assert.match(
  studioUi,
  /What are you making\?[\s\S]*<select[\s\S]*DOCUMENT_CREATION_KIND_OPTIONS\.map/,
  'Create Document should keep using the shared document-kind options.',
)

const updateDocumentKindBlock = getFunctionBlock(studioUi, 'updateDocumentKind')
for (const reference of [
  "const generatedTitle = option.key === 'standard'",
  '`${option.label} - ${templateLabel}`',
  'documentKind: option.key',
  'title: shouldReplaceTitle ? generatedTitle : previous.title',
]) {
  assertIncludes(updateDocumentKindBlock, reference, `Changing the document kind should keep ${reference}.`)
}
assert.match(
  studioUi,
  /handleCreateDocumentPacketFromRun\(\{ autoGenerate: true \}\)/,
  'Create Document should still use the existing generated packet flow.',
)

const buildPayloadBlock = getFunctionBlock(page, 'buildDocumentRunPayload')
for (const reference of [
  'const documentKind = getDocumentKindOption(runForm.documentKind).key',
  'const documentKindLabel = getDocumentKindOption(documentKind).label',
  'documentKind,',
  'document_kind: documentKind',
  'documentKindLabel,',
  'document_kind_label: documentKindLabel',
  'contractStudioRun:',
  'documentRun:',
  'createdFromStudio: true',
]) {
  assertIncludes(buildPayloadBlock, reference, `Document run payload should keep ${reference}.`)
}

const createPacketBlock = getFunctionBlock(page, 'handleCreateDocumentPacketFromRun')
for (const reference of [
  'buildDocumentRunPayload',
  'createDocumentPacket',
  'packetType,',
  'sourceContextJson: {',
  'contractStudioPreviewContext: runPayload.context',
  'documentKind: runPayload.documentKind',
  'documentKindLabel: runPayload.documentKindLabel',
  'generatePacketVersion',
  'loadDocumentLibrary',
]) {
  assertIncludes(createPacketBlock, reference, `Create Document flow should keep ${reference}.`)
}

const packetContextBlock = getFunctionBlock(page, 'buildDocumentRunContextFromPacket')
for (const reference of [
  'getPacketSourceContext(packet)',
  'contractStudioPreviewContext',
  'sourceContext: nestedSource',
  'documentRun:',
  'createdFromStudio: Boolean(sourceContext.contractStudioRun || sourceContext.contractStudioPreviewContext)',
]) {
  assertIncludes(packetContextBlock, reference, `Saved packet preview context should keep ${reference}.`)
}

console.log('addendum-template-phase0 audit passed')
