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
  packageJson.scripts?.['test:addendum-template-phase4'],
  'node scripts/addendum-template-phase4.test.mjs',
  'package.json should expose the addendum template Phase 4 audit.',
)

for (const reference of [
  'const ADDENDUM_DOCUMENT_DETAIL_FIELD_GROUPS = {',
  'const ADDENDUM_DOCUMENT_DETAIL_OPTIONS = ADDENDUM_TEMPLATE_STARTERS.map',
  'function getAddendumDetailConfig(addendumType = GENERAL_ADDENDUM_TEMPLATE_FAMILY)',
  'Occupation Date Addendum',
  'Purchase Price Addendum',
  'Suspensive Condition Addendum',
  'Fixtures and Exclusions Addendum',
  "key: 'property_address'",
  "key: 'occupation_date'",
  "key: 'purchase_price'",
  "key: 'suspensive_conditions'",
  "key: 'annexures_list'",
]) {
  assertIncludes(page, reference, `Phase 4 guided addendum catalog should keep ${reference}.`)
}

const defaultRunBlock = getFunctionBlock(page, 'createDefaultDocumentRunForm')
for (const reference of [
  'const addendumConfig = getAddendumDetailConfig(options.addendumType',
  'addendumType: addendumConfig.key',
  'addendumDetails: {}',
]) {
  assertIncludes(defaultRunBlock, reference, `Document run defaults should keep ${reference}.`)
}

const payloadBlock = getFunctionBlock(page, 'buildDocumentRunPayload')
for (const reference of [
  'const addendumConfig = getAddendumDetailConfig(runForm.addendumType',
  'const sourceAddendumDetails = sourceContextOverrides.addendumDetails',
  'const addendumDetails = {',
  '...normalizeAddendumRunDetails(addendumConfig.key, sourceAddendumDetails)',
  '...normalizeAddendumRunDetails(addendumConfig.key, runForm.addendumDetails)',
  'addendumType: addendumConfig.key',
  'addendum_type: addendumConfig.key',
  'addendumDetails,',
  'addendum_details: addendumDetails',
  'conditions: {',
  'onboardingFormData: {',
  'mandateDraft: {',
  'mandateData: {',
  'specialConditions: addendumSpecialConditions',
  'addendumLabel: addendumConfig.label',
  'addendumType: addendumConfig.key,',
]) {
  assertIncludes(payloadBlock, reference, `Document run payload should keep ${reference}.`)
}

const packetContextBlock = getFunctionBlock(page, 'buildDocumentRunContextFromPacket')
for (const reference of [
  'const addendumType = getAddendumDetailConfig(sourceContext.addendumType || sourceContext.addendum_type).key',
  'const addendumDetails = normalizeAddendumRunDetails(addendumType',
  'addendumType,',
  'addendumLabel: getAddendumDetailConfig(addendumType).label',
  'addendumDetails,',
]) {
  assertIncludes(packetContextBlock, reference, `Saved packet context should restore ${reference}.`)
}

for (const reference of [
  'const preferredAddendumType = getTemplateAddendumType({ metadata_json: templateMetadata })',
  '{ documentKind: preferredDocumentKind, addendumType: preferredAddendumType }',
  'previous.addendumType === nextDefault.addendumType',
  'addendumDetailOptions={ADDENDUM_DOCUMENT_DETAIL_OPTIONS}',
]) {
  assertIncludes(page, reference, `Document Builder should pass guided addendum defaults through ${reference}.`)
}

const creationPanelBlock = getFunctionBlock(studioUi, 'DocumentCreationPanel')
assertIncludes(
  studioUi,
  'addendumDetailOptions = []',
  'Create Document panel should default guided addendum options safely.',
)
for (const reference of [
  'selectedAddendumDetailOption',
  'shouldShowAddendumDetails',
  'Fill the addendum details',
  'Addendum type',
  'updateAddendumType',
  'updateAddendumDetail',
  'addendumDetails',
  'These fields feed the generated document',
]) {
  assertIncludes(creationPanelBlock, reference, `Create Document panel should keep ${reference}.`)
}

console.log('addendum-template-phase4 audit passed')
