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
  packageJson.scripts?.['test:addendum-template-phase5'],
  'node scripts/addendum-template-phase5.test.mjs',
  'package.json should expose the addendum template Phase 5 audit.',
)

const reviewSummaryBlock = getFunctionBlock(page, 'buildAddendumDocumentReviewSummary')
for (const reference of [
  'hasRelatedDocumentContext',
  'getAddendumDetailConfig(source.addendumType || source.addendum_type)',
  'normalizeAddendumRunDetails(addendumConfig.key',
  'parentDocumentId',
  'parentDocumentReference',
  'documentChangeSummary',
  'referenceLabel',
  'detailItems',
  'manifest: {',
]) {
  assertIncludes(reviewSummaryBlock, reference, `Addendum review summary should keep ${reference}.`)
}

for (const reference of [
  'const selectedLibraryPacketAddendumReview = useMemo',
  'buildAddendumDocumentReviewSummary(selectedLibraryPacketSourceContext)',
  'relatedDocument: selectedLibraryPacketAddendumReview.manifest',
]) {
  assertIncludes(page, reference, `Selected document workspace should keep ${reference}.`)
}

for (const reference of [
  'const addendumReview = buildAddendumDocumentReviewSummary(sourceContext)',
  'addendumReview.label',
  'Original: {addendumReview.referenceLabel}',
  'addendumReview.documentChangeSummary',
  'captured detail',
]) {
  assertIncludes(page, reference, `Document library cards should keep ${reference}.`)
}

for (const reference of [
  'Related Document',
  'selectedLibraryPacketAddendumReview.label',
  'selectedLibraryPacketAddendumReview.referenceLabel',
  'Original reference',
  'Change summary',
  'selectedLibraryPacketAddendumReview.detailItems.map',
  'No guided addendum values were captured for this document.',
]) {
  assertIncludes(page, reference, `Document workspace review panel should keep ${reference}.`)
}

console.log('addendum-template-phase5 audit passed')
