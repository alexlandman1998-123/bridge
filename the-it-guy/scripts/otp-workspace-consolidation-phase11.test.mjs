import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const journey = fs.readFileSync(new URL('../src/components/legal-document-workspace/OtpGovernanceJourney.jsx', import.meta.url), 'utf8')
const route = fs.readFileSync(new URL('../src/pages/settings/LegalDocumentWorkspaceRoute.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-consolidation-phase11'],
  'node scripts/otp-workspace-consolidation-phase11.test.mjs && npm run test:otp-closure-phase10',
)

for (const token of [
  'OtpGovernanceJourney',
  'Audit',
  'Notify',
  'Resolve',
  'OperationalAssurancePanel',
  'ReviewFollowUpPanel',
  'FollowUpResolutionPanel',
  'aria-pressed',
  "setSelectedStage(hasFindings ? 'notify' : 'resolve')",
  "setSelectedStage('resolve')",
]) {
  assert.ok(journey.includes(token), `Phase 11 journey should preserve ${token}`)
}

assert.match(route, /<OtpGovernanceJourney/)
assert.doesNotMatch(route, /<OperationalAssurancePanel/)
assert.doesNotMatch(route, /<ReviewFollowUpPanel/)
assert.doesNotMatch(route, /<FollowUpResolutionPanel/)

console.log('OTP Phase 11 workspace consolidation contract passed.')

