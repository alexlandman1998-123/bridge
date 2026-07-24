import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(repoRoot, 'src/pages/Agents.jsx'), 'utf8')
const workspaceStart = source.indexOf('function AgentWorkspace(')
const workspaceEnd = source.indexOf('export function AgentsPage()')
if (workspaceStart === -1 || workspaceEnd === -1 || workspaceEnd <= workspaceStart) {
  throw new Error('Unable to locate AgentWorkspace source block.')
}
const workspaceSource = source.slice(workspaceStart, workspaceEnd)

function assertContains(needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertWorkspaceNotContains(needle, label) {
  if (workspaceSource.includes(needle)) {
    throw new Error(`${label} should not be present in AgentWorkspace: ${needle}`)
  }
}

assertContains('AgentManagementCard title="Sales Commission Structure" actionLabel="Edit" onAction={() => openPlaceholder(\'commission\')}', 'inline commission edit card action')
assertContains('AgentManagementCard title="Profile & Permissions" actionLabel="Edit" onAction={() => openPlaceholder(\'profile\')}', 'inline profile permissions edit card action')
assertContains("? 'Edit Commission'", 'commission modal title')
assertContains("? 'Edit Permissions'", 'permissions modal title')
assertContains('handleSaveCommissionAssignment', 'commission save handler')
assertContains('assignOrganisationUserCommissionProfile', 'commission assignment persistence')
assertContains('updateCommissionTarget', 'commission target persistence')
assertContains('handleSaveProfileAssignment', 'profile permissions save handler')
assertContains('updateOrganisationUserProfile', 'profile persistence')
assertWorkspaceNotContains("onClick={() => navigate('/settings/commission-structures')}", 'commission modal navigation')
assertWorkspaceNotContains('Open Commission', 'commission page jump button')

console.log('Agent workspace inline management wiring verified.')
