import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(resolve(root, file), 'utf8')
const setup = read('src/pages/PostDashboardSetup.jsx')
const form = read('src/components/onboarding/BondOnboardingForm.jsx')
const shared = read('src/components/onboarding/CompanyOnboardingForm.jsx')
const model = read('src/components/onboarding/bondQuickStart.js')

assert.match(setup, /if \(isBondOwnerSetup && !canOpenActiveWorkspace\)/)
assert.match(setup, /return <BondOnboardingForm/)
assert.doesNotMatch(setup, /renderBondStep|BOND_SETUP_STEPS/)
assert.match(form, /businessTypes: BOND_BUSINESS_TYPES/)
assert.match(form, /workspaceType: WORKSPACE_TYPES.bondOriginator/)
assert.match(model, /value: WORKSPACE_KINDS.personalOriginator/)
assert.match(model, /value: WORKSPACE_KINDS.bondCompany/)
assert.match(model, /workspaceKind: kind/)
assert.match(model, /operatingModel: independent \? 'independent' : 'company'/)
assert.match(model, /ownerHandlesConsulting: true/)
assert.match(model, /ownerHandlesProcessing: true/)
assert.match(shared, /createWorkspaceFromIntent\(intent, authState.user, buildSubmission/)
assert.match(shared, /SIGNUP_WORKSPACE_ACTIONS.createWorkspace/)
console.log('bond originator signup phase 3 tests passed')
