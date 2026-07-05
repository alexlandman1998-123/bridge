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
  packageJson.scripts?.['test:addendum-template-phase7'],
  'node scripts/addendum-template-phase7.test.mjs',
  'package.json should expose the addendum template Phase 7 audit.',
)

const relationshipMapBlock = getFunctionBlock(page, 'buildDocumentPacketRelationshipMap')
for (const reference of [
  'const relationshipMap = new Map()',
  'review: buildAddendumDocumentReviewSummary(getPacketSourceContext(packet))',
  'parentPacketId',
  'parentPacket',
  'relatedAddendums: []',
  'parentRelationship.relatedAddendums.push({',
]) {
  assertIncludes(relationshipMapBlock, reference, `Relationship map should keep ${reference}.`)
}

for (const reference of [
  'const documentPacketRelationshipMap = useMemo',
  'buildDocumentPacketRelationshipMap(documentPackets)',
  'const selectedLibraryPacketRelationship = useMemo',
  'documentPacketRelationshipMap.get(normalizeText(selectedLibraryPacket?.id))',
  'relatedAddendums: (selectedLibraryPacketRelationship?.relatedAddendums || []).map',
]) {
  assertIncludes(page, reference, `Document relationship state should keep ${reference}.`)
}

for (const reference of [
  'const packetRelationship = documentPacketRelationshipMap.get(normalizeText(packet.id))',
  'const linkedAddendumCount = packetRelationship?.relatedAddendums?.length || 0',
  'linkedAddendumCount ?',
  'addendum{linkedAddendumCount === 1 ?',
]) {
  assertIncludes(page, reference, `Document cards should keep linked addendum indicators ${reference}.`)
}

for (const reference of [
  'Document Chain',
  'Jump between the original document and addendums linked to it.',
  'selectedLibraryPacketRelationship?.parentPacket',
  'Original document',
  'selectedLibraryPacketRelationship?.relatedAddendums',
  'setSelectedLibraryPacketId(selectedLibraryPacketRelationship.parentPacket.id)',
  'setSelectedLibraryPacketId(packet.id)',
]) {
  assertIncludes(page, reference, `Document chain panel should keep ${reference}.`)
}

console.log('addendum-template-phase7 audit passed')
