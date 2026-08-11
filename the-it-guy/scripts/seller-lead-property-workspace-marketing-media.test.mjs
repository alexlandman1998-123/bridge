import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const propertyWorkspaceStart = source.indexOf("leadWorkspaceTab === 'property'")
assert.notEqual(propertyWorkspaceStart, -1, 'Seller lead property workspace block is missing.')

const nextWorkspaceTab = source.indexOf("leadWorkspaceTab === 'mandate'", propertyWorkspaceStart)
assert.notEqual(nextWorkspaceTab, -1, 'Seller lead mandate workspace marker is missing after property block.')

const propertyWorkspace = source.slice(propertyWorkspaceStart, nextWorkspaceTab)

for (const removedCopy of [
  'Marketing Information & Media',
  'Edit Marketing Information',
  'Manage Media',
  'Published listing description',
  'Key selling points',
]) {
  assert.ok(!propertyWorkspace.includes(removedCopy), `Seller lead Property workspace should not render ${removedCopy}.`)
}

assert.ok(propertyWorkspace.includes('Property Profile'), 'Seller lead Property workspace should still render the property profile.')
assert.ok(propertyWorkspace.includes('Property Characteristics'), 'Seller lead Property workspace should still render property characteristics.')
assert.ok(propertyWorkspace.includes('Occupancy & Ownership'), 'Seller lead Property workspace should still render occupancy and ownership.')

console.log('Seller lead property workspace marketing/media removal verified.')
