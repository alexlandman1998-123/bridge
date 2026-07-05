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
  packageJson.scripts?.['test:addendum-template-phase3'],
  'node scripts/addendum-template-phase3.test.mjs',
  'package.json should expose the addendum template Phase 3 audit.',
)

for (const reference of [
  "const OCCUPATION_ADDENDUM_TEMPLATE_FAMILY = 'occupation_addendum'",
  "const PURCHASE_PRICE_ADDENDUM_TEMPLATE_FAMILY = 'purchase_price_addendum'",
  "const SUSPENSIVE_CONDITION_ADDENDUM_TEMPLATE_FAMILY = 'suspensive_condition_addendum'",
  "const FIXTURES_EXCLUSIONS_ADDENDUM_TEMPLATE_FAMILY = 'fixtures_exclusions_addendum'",
  'occupation_terms:',
  'purchase_price_terms:',
  'suspensive_condition_terms:',
  'fixtures_exclusions_terms:',
  'const ADDENDUM_TEMPLATE_STARTERS = [',
  'Occupation Date Addendum',
  'Purchase Price Addendum',
  'Suspensive Condition Addendum',
  'Fixtures and Exclusions Addendum',
  'const ADDENDUM_TEMPLATE_STARTER_OPTIONS = ADDENDUM_TEMPLATE_STARTERS.map',
]) {
  assertIncludes(page, reference, `Phase 3 starter catalogue should keep ${reference}.`)
}

const starterSectionsBlock = getFunctionBlock(page, 'createGeneralAddendumStarterSections')
assertIncludes(
  page,
  'function createGeneralAddendumStarterSections(packetType = \'otp\', starterKind = GENERAL_ADDENDUM_TEMPLATE_FAMILY)',
  'Starter section factory should default to the General Addendum starter.',
)
for (const reference of [
  'getAddendumTemplateStarter(starterKind)',
  'sectionLabel: starter.termsSectionLabel',
  'legalText: starter.termsLegalText',
  'placeholderKeysText: starter.placeholderKeysText',
]) {
  assertIncludes(starterSectionsBlock, reference, `Starter section factory should keep ${reference}.`)
}

const createTemplateBlock = getFunctionBlock(page, 'handleCreateTemplate')
for (const reference of [
  'const addendumStarterConfig = getAddendumTemplateStarter(starterKind)',
  'const resolvedAddendumStarter = addendumStarterConfig || getAddendumTemplateStarter(GENERAL_ADDENDUM_TEMPLATE_FAMILY)',
  'createGeneralAddendumStarterSections(packetType, resolvedAddendumStarter.key)',
  '`${packetType}_${resolvedAddendumStarter.templateKeySegment}_${timestamp}`',
  '`${templateTypeConfig.shortLabel} ${resolvedAddendumStarter.templateLabel}`',
  'description: isGeneralAddendumStarter',
  'addendum_type: isGeneralAddendumStarter ? resolvedAddendumStarter.key : null',
  'addendum_label: isGeneralAddendumStarter ? resolvedAddendumStarter.label : null',
]) {
  assertIncludes(createTemplateBlock, reference, `Template creation should keep ${reference}.`)
}

const createAddendumStarterBlock = getFunctionBlock(page, 'handleCreateAddendumStarterTemplate')
assertIncludes(
  page,
  'async function handleCreateAddendumStarterTemplate(starterKind = GENERAL_ADDENDUM_TEMPLATE_FAMILY)',
  'Dedicated addendum starter action should default to the General Addendum starter.',
)
for (const reference of [
  'handleCreateGeneralAddendumTemplate()',
  'handleCreateTemplate({ starterKind })',
]) {
  assertIncludes(createAddendumStarterBlock, reference, `Dedicated addendum starter action should keep ${reference}.`)
}

const templateCreationPanelBlock = getFunctionBlock(studioUi, 'TemplateCreationPanel')
assertIncludes(
  studioUi,
  'addendumTemplateStarters = []',
  'Template creation panel should default addendum starter options safely.',
)
for (const reference of [
  'handleCreateAddendumStarterTemplate',
  "starter.key !== 'general_addendum'",
  'Common Addendums',
  'handleCreateAddendumStarterTemplate(starter.key).then(openCreatedTemplate)',
]) {
  assertIncludes(templateCreationPanelBlock, reference, `Template creation panel should keep ${reference}.`)
}

for (const reference of [
  'handleCreateAddendumStarterTemplate={handleCreateAddendumStarterTemplate}',
  'addendumTemplateStarters={ADDENDUM_TEMPLATE_STARTER_OPTIONS}',
]) {
  assertIncludes(page, reference, `Document Builder should pass ${reference}.`)
}

console.log('addendum-template-phase3 audit passed')
