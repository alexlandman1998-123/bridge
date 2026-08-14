import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(repoRoot, '..')

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

const agentsPage = readFile('src/pages/Agents.jsx')
const settingsApi = readFile('src/lib/settingsApi.js')
const migration = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/migrations/202607240001_agent_profile_management_rpc.sql'),
  'utf8',
)

assertContains(agentsPage, 'updateOrganisationUserProfile', 'agent modal profile save helper')
assertContains(agentsPage, 'uploadAccountAvatar', 'agent modal avatar upload helper')
assertContains(agentsPage, 'await updateOrganisationUserProfile(agent.organisationUserId, {\n        avatarUrl: nextAvatarUrl,\n      })', 'agent modal avatar upload persistence')
assertContains(agentsPage, "setActionNotice('Agent profile photo updated.')", 'agent modal avatar upload confirmation')
assertContains(agentsPage, 'handleSaveProfileAssignment', 'agent modal save handler')
assertContains(agentsPage, 'type="file"', 'agent modal profile picture input')
assertContains(agentsPage, 'Save Profile', 'agent modal save action')
assertContains(agentsPage, 'branchOptions={detailBranchOptions}', 'agent detail branch options')

assertContains(settingsApi, 'export async function updateOrganisationUserProfile', 'settings profile update export')
assertContains(settingsApi, "client.rpc('bridge_update_organisation_user_profile'", 'settings profile RPC call')
assertContains(settingsApi, 'phone_number', 'organisation user profile phone enrichment')

assertContains(migration, 'create or replace function public.bridge_update_organisation_user_profile', 'profile management migration function')
assertContains(migration, 'security definer', 'profile management migration RLS bridge')
assertContains(migration, 'grant execute on function public.bridge_update_organisation_user_profile', 'profile management migration grants')

console.log('Agent profile edit modal wiring verified.')
