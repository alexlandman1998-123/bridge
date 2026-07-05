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
const settingsPage = await read('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const studioUi = await read('../src/pages/settings/contractStudioUi.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-9.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase9'],
  'node scripts/document-start-phase9.test.mjs',
  'package.json should expose the document-start Phase 9 audit.',
)

for (const reference of [
  "import MandateDraftIntakePanel from '../../components/documents/MandateDraftIntakePanel'",
  "import OtpDraftIntakePanel from '../../components/documents/OtpDraftIntakePanel'",
  "import { DOCUMENT_START_SOURCE_MODES } from '../../core/documents/documentStartRules'",
  'const showManualDraftIntake = selectedDocumentKind === \'standard\'',
  '<MandateDraftIntakePanel',
  '<OtpDraftIntakePanel',
  'updateManualDraftField',
  'resetManualDraftFields',
  'manualDraftType: normalizedPacketType',
]) {
  assertIncludes(studioUi, reference, `DocumentCreationPanel should keep the simple manual intake wiring: ${reference}.`)
}

const defaultDraft = getFunctionBlock(settingsPage, 'createDefaultManualDocumentDraft')
for (const reference of [
  "sellerEntityType: 'individual'",
  "commissionPercent: '7.5'",
  "buyerEntityType: 'individual'",
  "financeType: 'cash'",
  'purchasePrice',
]) {
  assertIncludes(defaultDraft, reference, `Manual document defaults should keep ${reference}.`)
}

const runPayload = getFunctionBlock(settingsPage, 'buildDocumentRunPayload')
for (const reference of [
  'const manualDraft = runForm.manualDraft && typeof runForm.manualDraft === \'object\'',
  'const usesManualDraftContext = documentKind === \'standard\'',
  'buildManualDocumentRunContext',
  'manualDocumentContext.transaction',
  'manualDocumentContext.lead',
  'manualDocumentContext.buyer',
  'manualDocumentContext.sellerDetails',
  'manualDocumentContext.mandateDraft',
  'manualDocumentContext.otpDraft',
  'manualDraftCaptured: Boolean(usesManualDraftContext)',
]) {
  assertIncludes(runPayload, reference, `Document run payload should keep manual draft context mapping: ${reference}.`)
}

for (const reference of [
  'simple manual details form',
  'Manual OTP values are stored as `otpDraft`',
  'Manual mandate values are stored as `mandateDraft`',
  'Extra details JSON stays available only as an advanced override',
  'No new packet table',
  'No duplicate document generator',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 9 rollout note should keep ${reference}.`)
}

console.log('document-start-phase9 audit passed')
