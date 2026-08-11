import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

function sourceBlock(startToken, endToken) {
  const start = source.indexOf(startToken)
  assert.notEqual(start, -1, `${startToken} block is missing`)
  const end = source.indexOf(endToken, start)
  assert.notEqual(end, -1, `${endToken} marker is missing after ${startToken}`)
  return source.slice(start, end)
}

const editSections = sourceBlock('const SELLER_PROFILE_WORKSPACE_EDIT_SECTIONS = {', 'function getSellerProfileFieldConfig')
const workspace = sourceBlock('function SellerProfileWorkspace({', 'function SellerAvatar')
const savePatch = sourceBlock('function buildSellerOnboardingSubmissionPatch({', 'function getSellerMandatePreferenceValidationErrors')

for (const token of [
  'residentialAddress',
  'sellerFirstName',
  'sellerSurname',
  'propertyAddressSearch',
  'propertyAddressLine1',
  'parkingCovered',
  'parkingOpen',
  'knownDefects',
  'propertyCondition',
]) {
  assert.ok(editSections.includes(token), `Seller profile edit sections should expose ${token}.`)
}

assert.ok(source.includes("'knownDefects',"), 'Known defects should be treated as an editable structured field.')
assert.ok(source.includes('knownDefects: formatSellerOnboardingFieldValue'), 'Known defects should initialize as a complex draft.')
assert.ok(!savePatch.includes('if (!hasValue(nextDraft?.[key])) continue'), 'Saving overrides should allow agents to clear existing field values.')
assert.ok(!workspace.includes('xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.34fr)]'), 'Seller profile workspace should not render the old right-hand column layout.')
assert.ok(workspace.includes('lg:grid-cols-3'), 'Seller profile summary containers should fit in a full-width grid.')
assert.ok(workspace.includes('model.sections.map'), 'Seller profile cards should still render all profile sections.')

console.log('Agent leads seller profile workspace regression checks passed.')
