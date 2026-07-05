import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

function getFunctionBlock(source, name) {
  const declarationMatch = source.match(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`))
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
const studioConstants = await read('../src/pages/settings/contractStudioConstants.js')
const packageJson = JSON.parse(await read('../package.json'))

assert.equal(
  packageJson.scripts?.['test:addendum-template-phase8'],
  'node scripts/addendum-template-phase8.test.mjs',
  'package.json should expose the addendum template Phase 8 audit.',
)

assert.ok(
  !studioUi.includes('export function getDocumentRunReadiness'),
  'getDocumentRunReadiness should live outside the component module for React fast-refresh safety.',
)

const readinessHelper = getFunctionBlock(studioConstants, 'getDocumentRunReadiness')
for (const reference of [
  "key: 'original_document'",
  "label: 'Original document linked'",
  "key: 'change_summary'",
  "label: 'Change summary captured'",
  "key: 'guided_details'",
  "label: 'Addendum details captured'",
  'capturedDetailCount',
  'ready: items.every((item) => item.passed)',
]) {
  assertIncludes(readinessHelper, reference, `Document run readiness helper should keep ${reference}.`)
}

for (const reference of [
  'const documentRunReadiness = getDocumentRunReadiness({ documentRunForm, addendumDetailFields })',
  'const readyForGeneratedCreate = !isRelatedDocumentKind || documentRunReadiness.ready',
  'const readinessStepLabel = shouldShowAddendumDetails',
  'Ready to generate?',
  'Needs details',
  'Complete the readiness checklist above before generating',
  'disabled={creatingDocumentPacket || !selectedTemplate || hasUnsavedChanges || !readyForGeneratedCreate}',
]) {
  assertIncludes(studioUi, reference, `Create Document panel should keep readiness UI or guard ${reference}.`)
}

assertIncludes(
  page,
  'getDocumentRunReadiness,',
  'SettingsSigningTemplatesPage should import getDocumentRunReadiness from contractStudioUi.',
)

const runReadinessHelper = getFunctionBlock(page, 'getAddendumGenerationReadinessForRun')
for (const reference of [
  'getAddendumDetailConfig(runForm.addendumType)',
  'return getDocumentRunReadiness({',
  'documentRunForm: {',
  'addendumDetailFields: addendumConfig.fields',
]) {
  assertIncludes(runReadinessHelper, reference, `Run readiness helper should keep ${reference}.`)
}

const packetReadinessHelper = getFunctionBlock(page, 'getAddendumGenerationReadinessForPacket')
for (const reference of [
  'buildAddendumDocumentReviewSummary(getPacketSourceContext(packet))',
  'getAddendumDetailConfig(review.addendumType)',
  'return getDocumentRunReadiness({',
  'parentDocumentId: review.parentDocumentId',
  'documentChangeSummary: review.documentChangeSummary',
  'addendumDetails: review.manifest?.details || {}',
  'addendumDetailFields: addendumConfig.fields',
]) {
  assertIncludes(packetReadinessHelper, reference, `Packet readiness helper should keep ${reference}.`)
}

const createDocumentBlock = getFunctionBlock(page, 'handleCreateDocumentPacketFromRun')
for (const reference of [
  'const addendumReadiness = getAddendumGenerationReadinessForRun(documentRunForm)',
  'if (autoGenerate && !addendumReadiness.ready)',
  'Complete the addendum readiness checklist before generating',
  "setActiveStudioArea('documents')",
]) {
  assertIncludes(createDocumentBlock, reference, `Create-from-run generation should keep ${reference}.`)
}

const generateLibraryBlock = getFunctionBlock(page, 'handleGenerateLibraryPacket')
for (const reference of [
  'const addendumReadiness = getAddendumGenerationReadinessForPacket(packet)',
  'if (!addendumReadiness.ready)',
  'Complete the addendum readiness checklist before generating this document.',
  'setSelectedLibraryPacketId(packet.id)',
  "setActiveStudioArea('documents')",
]) {
  assertIncludes(generateLibraryBlock, reference, `Saved document generation should keep ${reference}.`)
}

console.log('addendum-template-phase8 audit passed')
