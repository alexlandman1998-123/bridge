import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/pages/Agents.jsx'), 'utf8')

assert.equal(
  packageJson.scripts['test:agents-avatar-null-safety'],
  'node scripts/agents-avatar-null-safety.test.mjs',
  'package script should expose the agents avatar null-safety regression',
)

const helperStart = source.indexOf('function getAgentAvatarUrl(agent = {})')
const helperEnd = source.indexOf('function AgentAvatar', helperStart)
assert.notEqual(helperStart, -1, 'Agents page should keep the avatar URL helper')
assert.notEqual(helperEnd, -1, 'AgentAvatar should follow the avatar URL helper')

const helperBlock = source.slice(helperStart, helperEnd)
assert.match(helperBlock, /agent\?\.avatarUrl/, 'avatar helper should handle null agent rows')
assert.match(helperBlock, /agent\?\.avatar_url/, 'avatar helper should handle nullable snake_case avatar rows')
assert.match(source, /getAgentAvatarUrl\(directoryMatch\) \|\| getAgentAvatarUrl\(invite\) \|\| getAgentAvatarUrl\(agent\)/, 'mapped agents should safely pass nullable directory and invite matches')
assert.match(source, /modalMode === 'profile' \? \(/, 'Agent profile actions should render the real profile modal instead of the generic placeholder')
assert.match(source, /<AgentAvatar[\s\S]*agent=\{agent\}[\s\S]*getAgentInitials\(agent\)/, 'Agent profile modal should render the saved avatar or initials fallback')
assert.match(source, /<AgentManagementCard title="Contact Details">/, 'Agent profile modal should expose contact details')
assert.match(source, /Review the saved profile photo, contact details and workspace access\./, 'Agent profile modal should not use the generic staged-workflow subtitle')

console.log('agents-avatar-null-safety tests passed')
