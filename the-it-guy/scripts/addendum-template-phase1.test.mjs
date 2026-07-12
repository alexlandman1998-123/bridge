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
  packageJson.scripts?.['test:addendum-template-phase1'],
  'node scripts/addendum-template-phase1.test.mjs',
  'package.json should expose the addendum template Phase 1 audit.',
)

for (const reference of [
  "const GENERAL_ADDENDUM_TEMPLATE_FAMILY = 'general_addendum'",
  'const GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT = {',
  'GENERAL ADDENDUM',
  'AGREED ADDENDUM TERMS',
  'UNCHANGED TERMS',
]) {
  assertIncludes(page, reference, `General Addendum starter should keep ${reference}.`)
}

const starterBlock = getFunctionBlock(page, 'createGeneralAddendumStarterSections')
for (const reference of [
  "sectionKey: 'addendum_cover'",
  "sectionKey: 'addendum_parties'",
  "sectionKey: 'linked_document'",
  "sectionKey: 'agreed_addendum_terms'",
  "sectionKey: 'unchanged_terms'",
  "sectionKey: 'signature_pages'",
  'GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.mandate_parties',
  'GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.otp_parties',
  'signingFields: isMandate',
]) {
  assertIncludes(starterBlock, reference, `General Addendum starter sections should keep ${reference}.`)
}

const createTemplateBlock = getFunctionBlock(page, 'handleCreateTemplate')
assert.match(
  page,
  /async function handleCreateTemplate\(\{\s*starterKind = 'standard',\s*targetPacketType = packetType,\s*\} = \{\}\)/,
  'Template creation should accept a starter kind and optional packet type while preserving the standard default.',
)
for (const reference of [
  'starterKind === GENERAL_ADDENDUM_TEMPLATE_FAMILY',
  'createGeneralAddendumStarterSections(resolvedPacketType, resolvedAddendumStarter.key)',
  "documentKindOption = getDocumentKindOption(isGeneralAddendumStarter ? 'addendum' : 'standard')",
  'document_kind: documentKindOption.key',
  'preferred_document_kind: documentKindOption.key',
  'template_family: isGeneralAddendumStarter ? GENERAL_ADDENDUM_TEMPLATE_FAMILY : null',
  '`${resolvedAddendumStarter.label} template created.`',
]) {
  assertIncludes(createTemplateBlock, reference, `Template creation should keep ${reference}.`)
}

const createGeneralAddendumBlock = getFunctionBlock(page, 'handleCreateGeneralAddendumTemplate')
assertIncludes(
  createGeneralAddendumBlock,
  'handleCreateTemplate({ ...options, starterKind: GENERAL_ADDENDUM_TEMPLATE_FAMILY })',
  'Dedicated General Addendum action should call the starter-aware template creator.',
)

const defaultRunBlock = getFunctionBlock(page, 'createDefaultDocumentRunForm')
for (const reference of [
  'getDocumentKindOption(options.documentKind || options.document_kind ||',
  '`${documentKindOption.label} - ${templateLabel}`',
  'documentKind: documentKindOption.key',
]) {
  assertIncludes(defaultRunBlock, reference, `Document run defaults should keep ${reference}.`)
}

for (const reference of [
  'handleCreateGeneralAddendumTemplate',
  'General Addendum',
  'void handleCreateGeneralAddendumTemplate().then(openCreatedTemplate)',
]) {
  assertIncludes(studioUi, reference, `Template creation panel should keep ${reference}.`)
}

console.log('addendum-template-phase1 audit passed')
