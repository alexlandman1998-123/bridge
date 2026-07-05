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
const packageJson = JSON.parse(await read('../package.json'))

assert.equal(
  packageJson.scripts?.['test:addendum-template-phase6'],
  'node scripts/addendum-template-phase6.test.mjs',
  'package.json should expose the addendum template Phase 6 audit.',
)

const preferredTemplateBlock = getFunctionBlock(page, 'getPreferredAddendumTemplateForType')
for (const reference of [
  'getTemplatePreferredDocumentKind(template) === \'addendum\'',
  'getTemplateAddendumType(template) === preferredAddendumType',
  'getTemplateAddendumType(template) === GENERAL_ADDENDUM_TEMPLATE_FAMILY',
]) {
  assertIncludes(preferredTemplateBlock, reference, `Preferred addendum template helper should keep ${reference}.`)
}

const runFormFromPacketBlock = getFunctionBlock(page, 'buildAddendumRunFormFromPacket')
for (const reference of [
  'sourceContext.contractStudioPreviewContext',
  'previewContext.sourceContext',
  'normalizeAddendumRunDetails(resolvedAddendumType',
  'parentDocumentId',
  'parentDocumentReference',
  'documentKind: \'addendum\'',
  'sourceType: transactionId ? \'transaction\' : leadId ? \'lead\' : \'manual\'',
  'title: `Addendum - ${parentDocumentReference}`',
]) {
  assertIncludes(runFormFromPacketBlock, reference, `Packet-to-addendum seed helper should keep ${reference}.`)
}

const startAddendumBlock = getFunctionBlock(page, 'handleStartAddendumFromLibraryPacket')
for (const reference of [
  'const preferredTemplate = getPreferredAddendumTemplateForType(selectedList, addendumType)',
  'Create a General Addendum template first',
  'setSelectedTemplateId(preferredTemplate.id)',
  'setSelectedLibraryPacketId(sourcePacket.id)',
  'setDocumentRunForm(buildAddendumRunFormFromPacket({',
  'setActiveStudioArea(\'documents\')',
  'Addendum details are prefilled from the selected document',
]) {
  assertIncludes(startAddendumBlock, reference, `Start-addendum handler should keep ${reference}.`)
}

for (const reference of [
  'const defaultAddendumTemplate = useMemo',
  'const shouldPreserveExistingRun = previous.sourceType',
  'normalizeText(previous.parentDocumentId || previous.parentDocumentReference)',
  'handleStartAddendumFromLibraryPacket(packet)',
  'handleStartAddendumFromLibraryPacket(selectedLibraryPacket)',
  'Start an addendum from this document',
  'Add Addendum',
  '<CopyPlus size={14} />',
]) {
  assertIncludes(page, reference, `Document Builder should keep one-click addendum wiring ${reference}.`)
}

console.log('addendum-template-phase6 audit passed')
