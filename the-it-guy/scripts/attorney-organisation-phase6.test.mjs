import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const serviceSource = readFileSync(new URL('../src/services/attorneyFirms.js', import.meta.url), 'utf8')
const projectionSource = readFileSync(
  new URL('../src/core/organisations/attorneyOrganisationFirmProjection.js', import.meta.url),
  'utf8',
)
const readinessSource = readFileSync(
  new URL('./attorney-organisation-runtime-readiness.mjs', import.meta.url),
  'utf8',
)
const workspaceResolutionSource = readFileSync(
  new URL('../src/services/workspaceResolutionService.js', import.meta.url),
  'utf8',
)
const assignmentSource = readFileSync(
  new URL('../src/services/transactionAttorneyAssignments.js', import.meta.url),
  'utf8',
)

assert.match(serviceSource, /ATTORNEY_ORGANISATION_SELECT_COLUMNS/)
assert.match(serviceSource, /getCanonicalAttorneyOrganisationRows/)
assert.match(serviceSource, /hydrateAttorneyFirmRowsFromCanonicalOrganisations/)
assert.match(serviceSource, /\.from\('organisations'\)[\s\S]*?\.in\('id', organisationIds\)/)
assert.match(serviceSource, /projectCanonicalOrganisationOntoAttorneyFirm/)
assert.match(serviceSource, /updateCanonicalAttorneyOrganisation\(client, normalizedFirmId, payload, firmPayload\)/)

const canonicalWrite = serviceSource.indexOf('await updateCanonicalAttorneyOrganisation(client, normalizedFirmId, payload, firmPayload)')
const legacyWriteAfterCanonical = serviceSource
  .slice(canonicalWrite)
  .search(/\.from\('attorney_firms'\)[\s\S]*?\.update\(firmPayload\)/)
assert.ok(canonicalWrite >= 0 && legacyWriteAfterCanonical >= 0, 'Canonical organisation writes must happen before compatibility projection writes.')

assert.match(projectionSource, /organisation\.company_email/)
assert.match(projectionSource, /organisation\.logo_bucket/)
assert.match(projectionSource, /organisation\.primary_colour/)
assert.match(readinessSource, /attorneyOrganisationFirmProjection\.js/)
assert.match(readinessSource, /Required Phase 2–[67] contracts/)
assert.match(workspaceResolutionSource, /projectCanonicalOrganisationOntoAttorneyFirm/)
assert.match(workspaceResolutionSource, /organisationQuery/)
assert.match(assignmentSource, /getCurrentUserAttorneyFirms/)

const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /"test:attorney-organisation-phase6"/)

console.log('attorney organisation Phase 6 canonical runtime cutover contracts passed')
