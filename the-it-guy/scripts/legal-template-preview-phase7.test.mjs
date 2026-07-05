import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const page = await read('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const studioUi = await read('../src/pages/settings/contractStudioUi.jsx')
const packetService = await read('../src/core/documents/packetService.js')
const mandateValidation = await read('../src/core/documents/mandateValidation.js')
const packageJson = JSON.parse(await read('../package.json'))

const samplePreviewStart = page.indexOf('async function handleTestGenerate()')
const realRunPreviewStart = page.indexOf('async function handleTestGenerateFromRun()')
const createRunStart = page.indexOf('async function handleCreateDocumentPacketFromRun')

assert(samplePreviewStart > -1, 'SettingsSigningTemplatesPage should keep the sample preview handler.')
assert(realRunPreviewStart > samplePreviewStart, 'Real-context preview handler should still follow sample preview handler.')
assert(createRunStart > realRunPreviewStart, 'Create document handler should still follow real-context preview handler.')

const samplePreviewBlock = page.slice(samplePreviewStart, realRunPreviewStart)
const realRunPreviewBlock = page.slice(realRunPreviewStart, createRunStart)
const validatePacketStart = packetService.indexOf('export async function validatePacket')
const renderPacketPreviewStart = packetService.indexOf('export async function renderPacketPreview')

assert(validatePacketStart > -1, 'packetService should still export validatePacket.')
assert(renderPacketPreviewStart > validatePacketStart, 'renderPacketPreview should still follow validatePacket.')

const validatePacketBlock = packetService.slice(validatePacketStart, renderPacketPreviewStart)

assert.equal(
  packageJson.scripts?.['test:legal-template-preview-phase7'],
  'node scripts/legal-template-preview-phase7.test.mjs',
  'package.json should expose the legal template preview Phase 7 contract.',
)

assertIncludes(
  packetService,
  "TEMPLATE_PREVIEW_VALIDATION_ACTION = 'template_preview'",
  'packetService should define the template-preview validation action.',
)

for (const token of [
  'const isTemplatePreview = mandateValidationAction === TEMPLATE_PREVIEW_VALIDATION_ACTION',
  'const missingPlaceholderWarnings = ruleWarnings.filter',
  'const structuralRuleWarnings = ruleWarnings.filter',
  'const previewDataRequirements = isTemplatePreview',
  'dedupeValidationRequirements',
  'dataRequirements: previewDataRequirements',
  'validationAction: mandateValidationAction',
  'const criticalIssues = isTemplatePreview',
  'const warningIssues = isTemplatePreview',
  'isValidForGeneration: isTemplatePreview',
]) {
  assertIncludes(validatePacketBlock, token, `validatePacket should keep template-preview validation separated: ${token}`)
}

for (const token of [
  'mapMandateValidationIssue',
  'sellerCriticalIssues',
  'sellerWarningIssues',
  'mandateBlockingIssues',
  'mandateWarningIssues',
]) {
  assertIncludes(validatePacketBlock, token, `validatePacket should preserve generation-readiness sources as neutral requirements in template preview: ${token}`)
}

assertIncludes(
  samplePreviewBlock,
  "validationAction: 'template_preview'",
  'Sample preview should request the template-preview validation mode.',
)
assertIncludes(
  samplePreviewBlock,
  'dataRequirements: preview?.dataRequirements || []',
  'Sample preview state should store neutral data requirements from packet validation.',
)
assert.ok(
  !realRunPreviewBlock.includes("validationAction: 'template_preview'"),
  'Real-context preview should not use template-preview mode.',
)
assertIncludes(
  realRunPreviewBlock,
  'dataRequirements: []',
  'Real-context preview state should keep data requirements out of the template preview panel.',
)

for (const token of [
  "['preview', 'template_preview', 'generate', 'download', 'send_for_signing', 'upload_signed']",
  "action === 'preview' || action === 'template_preview'",
  "validation.action === 'template_preview'",
]) {
  assertIncludes(mandateValidation, token, `Mandate validation should understand template-preview mode: ${token}`)
}

for (const token of [
  'export function DataRequirementCard',
  'const dataRequirements = Array.isArray(previewState.dataRequirements) ? previewState.dataRequirements : []',
  'Data this template will collect',
  'These are not template errors. They become required only when generating a real document.',
  '<DataRequirementCard',
]) {
  assertIncludes(studioUi, token, `Sample preview support panel should show neutral data requirements: ${token}`)
}

console.log('Legal template preview Phase 7 contract passed.')
