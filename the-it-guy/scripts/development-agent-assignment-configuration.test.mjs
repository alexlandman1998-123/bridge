import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = join(__dirname, '..')

const developmentDetailSource = readFileSync(join(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')
const apiSource = readFileSync(join(root, 'src/lib/api.js'), 'utf8')
const agentListingsSource = readFileSync(join(root, 'src/pages/AgentListings.jsx'), 'utf8')

assert.match(
  developmentDetailSource,
  /import \{ fetchOrganisationSettings, listOrganisationUsers, normalizeOrganisationDeveloperProfile \} from '\.\.\/lib\/settingsApi'/,
  'Development configuration should load organisation users for internal agent assignment.',
)

assert.match(
  developmentDetailSource,
  /Internal Agent Access/,
  'Development configuration should expose an Internal Agent Access panel.',
)

assert.match(
  developmentDetailSource,
  /function handleAgentAssignmentsSave\(event\)/,
  'Development configuration should include a dedicated agent assignment save handler.',
)

assert.match(
  developmentDetailSource,
  /stakeholderTeams:\s*\{\s*\.\.\.existingStakeholderTeams,\s*agents: normalizedAgents,/s,
  'Saving agent assignments should preserve existing stakeholder team settings and update only agents.',
)

assert.match(
  developmentDetailSource,
  /normalizeDevelopmentAgentAssignments/,
  'Assigned agents should be normalized and deduplicated before being saved.',
)

assert.match(
  apiSource,
  /syncDevelopmentParticipantsFromSettings\(client, \{\s*developmentId,\s*stakeholderTeams: normalized\.stakeholderTeams,/s,
  'Development settings updates should continue syncing stakeholder teams into development participants.',
)

assert.match(
  agentListingsSource,
  /const assignedAgents = Array\.isArray\(teams\.agents\) \? teams\.agents : \[\]/,
  'Agent development cards should continue reading assigned agents from development stakeholder teams.',
)

console.log('development-agent-assignment-configuration checks passed')
