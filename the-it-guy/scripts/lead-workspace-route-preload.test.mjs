import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [routeLoader, listRoute] = await Promise.all([
  readFile('src/routes/leadsRouteLoader.js', 'utf8'),
  readFile('src/pages/agency/AgencyLeadListRoutePage.jsx', 'utf8'),
])

assert.match(routeLoader, /import \{ preloadAgencyLeadWorkspace \} from '\.\.\/pages\/agency\/agencyLeadWorkspaceLoader'/)
assert.match(routeLoader, /Promise\.all\(\[\s*import\('\.\.\/pages\/agency\/AgencyLeadWorkspaceRoutePage'\),\s*preloadAgencyLeadWorkspace\(\),/)
assert.match(routeLoader, /export function preloadAgencyLeadWorkspaceRoute/)
assert.match(listRoute, /preloadAgencyLeadWorkspaceRoute\(\{ organisationId, leadId \}\)/)

console.log('Lead workspace route preload checks passed.')
