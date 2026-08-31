import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const wizard = fs.readFileSync(path.join(root, 'src/components/NewTransactionWizard.jsx'), 'utf8')

assert.match(
  wizard,
  /const developerOrganisationId = String\([\s\S]*organisation\?\.id[\s\S]*currentMembership\?\.organisation_id/,
  'the transaction wizard must resolve the active developer organisation before loading developments',
)
assert.match(
  wizard,
  /isDeveloperTransactionWorkspace && !developerOrganisationId[\s\S]*setDevelopments\(\[\]\)/,
  'the developer wizard must fail closed while its organisation scope is unresolved',
)
assert.match(
  wizard,
  /fetchDevelopmentOptions\([\s\S]*isDeveloperTransactionWorkspace \? \{ organisationId: developerOrganisationId \} : \{\}/,
  'developer development options must be queried with the active organisation id',
)

console.log('Developer transaction development scope tests passed')
