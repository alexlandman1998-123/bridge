import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
const portal = fs.readFileSync('src/pages/BondApplicationPortal.jsx', 'utf8')
const clientApi = fs.readFileSync('src/lib/clientPortalApi.js', 'utf8')

assert.match(app, /const BondApplicationPortal = lazy/)
assert.match(app, /path="\/client\/:token\/bond-application"[\s\S]*<BondApplicationPortal \/>/)
assert.match(portal, /data-bond-application-portal="phase1-shell"/)
assert.match(portal, /fetchClientPortalNormalizedBondApplication/)
assert.match(portal, /Document actions,[\s\S]*submissions, and reminders move in later phases/)
assert.doesNotMatch(portal, /import\s*\{[^}]*saveClientPortalOnboardingDraft/)
assert.doesNotMatch(portal, /prepareClientPortalBondApplicationSubmission/)
assert.match(clientApi, /fetchClientPortalNormalizedBondApplication/)

console.log('bond application portal Phase 1 shell contract tests passed')
