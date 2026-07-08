import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const migrationPath = resolve(root, '..', 'supabase/migrations/202607080004_developer_partner_invite_bind_partner_org.sql')
const apiPath = resolve(root, 'src/lib/api.js')
const pagePath = resolve(root, 'src/pages/DeveloperPartnerInvitePage.jsx')
const appPath = resolve(root, 'src/App.jsx')
const pendingPath = resolve(root, 'src/lib/pendingPartnerInvite.js')

const migration = readFileSync(migrationPath, 'utf8')
const api = readFileSync(apiPath, 'utf8')
const page = readFileSync(pagePath, 'utf8')
const app = readFileSync(appPath, 'utf8')
const pending = readFileSync(pendingPath, 'utf8')

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message)
  }
}

assertIncludes(
  migration,
  'drop function if exists public.bridge_accept_developer_partner_invitation(text, text, text);',
  'migration should replace the anonymous three-argument accept RPC',
)
assertIncludes(
  migration,
  'p_partner_organisation_id uuid default null',
  'accept RPC must accept the partner organisation id',
)
assertIncludes(
  migration,
  'auth.uid() is null',
  'accept RPC should require an authenticated user',
)
assertIncludes(
  migration,
  'partner_organisation_id = v_partner_organisation_id',
  'accept RPC should bind the relationship to the accepting organisation',
)
assertIncludes(
  migration,
  'public.bridge_is_org_admin(v_partner_organisation_id)',
  'accept RPC should only bind organisations for workspace admins',
)
assertIncludes(migration, "'organisation_required'", 'accept RPC should reject unbound accepts')
assertIncludes(migration, "'wrong_workspace'", 'accept RPC should reject mismatched workspaces')
assertIncludes(migration, "'self_relationship'", 'accept RPC should reject self relationships')

assertIncludes(
  api,
  'p_partner_organisation_id: normalizeNullableUuid(input.partnerOrganisationId || input.partner_organisation_id || input.organisationId)',
  'client accept call should pass the active partner organisation id',
)
assertIncludes(api, "reason === 'organisation_required'", 'client should surface workspace setup failures')
assertIncludes(api, "reason === 'not_workspace_admin'", 'client should surface workspace admin failures')

assertIncludes(page, "import { useWorkspace } from '../context/WorkspaceContext'", 'invite page should read the active workspace')
assertIncludes(page, "partnerOrganisationId: workspaceId", 'invite page should accept against the active workspace')
assertIncludes(page, 'Complete workspace setup', 'invite page should keep users on the setup path when no workspace exists')
assertIncludes(page, 'rememberPendingPartnerInvitePath(returnPath)', 'invite page should preserve the invite through signup/onboarding')
assertIncludes(page, 'clearPendingPartnerInvitePath(returnPath)', 'invite page should clear the pending invite after acceptance')
assertIncludes(page, 'autoAcceptAttemptedRef', 'developer invite page should support one-shot auto accept after onboarding')

assertIncludes(pending, "safePath.startsWith('/developer/partner-invite/')", 'pending helper should recognise developer partner invites')
assertIncludes(pending, "safePath.startsWith('/partners/invite/')", 'pending helper should recognise organisation partner invites')
assertIncludes(pending, "url.searchParams.set('accept', '1')", 'pending helper should support auto-accept resume paths')
assertIncludes(app, 'readPendingPartnerInvitePath()', 'app should resume pending partner invites after onboarding')
assertIncludes(app, 'buildPartnerInviteAutoAcceptPath(pendingPartnerInvitePath)', 'app should auto-accept pending partner invites after onboarding')

console.log('developer partner invite binding contract passed')
