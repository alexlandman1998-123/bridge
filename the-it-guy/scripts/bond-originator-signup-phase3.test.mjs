import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const setupSource = readFileSync(resolve(root, 'src/pages/PostDashboardSetup.jsx'), 'utf8')

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

assertIncludes(setupSource, "value: WORKSPACE_KINDS.personalOriginator", 'independent originator option')
assertIncludes(setupSource, "value: WORKSPACE_KINDS.bondCompany", 'bond company option')
assertIncludes(setupSource, "{ key: 'type', label: 'Type' }", 'originator type setup step')
assertIncludes(setupSource, 'updateBondWorkspaceKind', 'workspace kind selection handler')
assertIncludes(setupSource, "operatingModel: isPersonalOriginator ? 'independent' : 'company'", 'operating model in submission')
assertIncludes(setupSource, 'workspaceKind,', 'workspace kind submitted to onboarding')
assertIncludes(setupSource, 'if (isPersonalOriginator) return', 'solo originator team validation relaxation')
assertIncludes(setupSource, "isPersonalBondOriginator ? 'Originator profile' : 'Business profile'", 'independent business copy')
assertIncludes(setupSource, "isPersonalBondOriginator ? 'Create independent workspace' : 'Create bond business workspace'", 'workspace-kind-specific CTA')
assertIncludes(setupSource, "title: 'I operate as an individual originator'", 'independent choice label')
assertIncludes(setupSource, "title: 'I represent a bond originator company'", 'company choice label')

console.log('bond originator signup phase 3 tests passed')

