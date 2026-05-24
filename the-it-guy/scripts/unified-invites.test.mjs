import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migration = fs.readFileSync(path.join(root, '../supabase/migrations/202605240012_unified_invites.sql'), 'utf8')
const inviteService = fs.readFileSync(path.join(root, 'src/services/inviteService.js'), 'utf8')
const workspaceService = fs.readFileSync(path.join(root, 'src/services/workspaceService.js'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const agentInviteService = fs.readFileSync(path.join(root, 'src/lib/agentInviteService.js'), 'utf8')
const attorneyFirmInvitations = fs.readFileSync(path.join(root, 'src/services/attorneyFirmInvitations.js'), 'utf8')

assert.match(migration, /create table if not exists public\.invites/i, 'canonical invites table must exist')
assert.match(migration, /invite_type in \(/i, 'invite type constraint must exist')
assert.match(migration, /status in \('pending', 'accepted', 'declined', 'expired', 'revoked', 'cancelled'\)/i, 'invite status lifecycle must exist')
assert.match(migration, /create or replace function public\.bridge_accept_invite/i, 'canonical acceptance RPC must exist')
assert.match(migration, /invite_email_mismatch/i, 'RPC must enforce signed-in email validation')
assert.match(migration, /for update/i, 'acceptance must lock invite rows during mutation')
assert.match(migration, /membership_created_from_invite/i, 'workspace membership creation must be audited')
assert.match(migration, /participant_created_from_invite/i, 'transaction participant creation must be audited')
assert.match(migration, /attorney_firm_membership_created_from_invite/i, 'attorney firm invite compatibility must be audited')
assert.match(migration, /transaction_participants_invitation_token_idx/i, 'transaction invite compatibility columns must be indexed')
assert.match(migration, /from public\.workspace_invites/i, 'workspace invite compatibility backfill must exist')
assert.match(migration, /from public\.attorney_firm_invitations/i, 'attorney invite compatibility backfill must exist')

assert.match(inviteService, /export async function acceptInvite/i, 'invite service must expose acceptInvite')
assert.match(inviteService, /assertInviteCanBeAccepted/i, 'client-side invite validation helper must exist')
assert.match(inviteService, /invite_email_mismatch/i, 'client-side email mismatch guard must exist')
assert.match(inviteService, /resolveInviteAction/i, 'invite action resolver must exist')
assert.match(inviteService, /bridge_accept_invite/i, 'invite service must call canonical RPC')

assert.match(workspaceService, /createInvite\(/, 'workspace invite creation must mirror canonical invites')
assert.match(workspaceService, /acceptInvite\(inviteToken/, 'workspace invite acceptance must use canonical acceptInvite first')

assert.match(app, /path="\/invite\/:token"/, 'unified invite route must exist')
assert.match(app, /InviteResolver/, 'InviteResolver must be mounted')

assert.match(api, /bridge_create_invite/, 'transaction invites must be mirrored into canonical invites')
assert.match(api, /bridge_accept_invite/, 'stakeholder invite acceptance must try canonical flow')
assert.match(api, /Sign in as \$\{invitedEmail\}/, 'legacy stakeholder acceptance must enforce email matching')

assert.match(agentInviteService, /return `\$\{origin\}\/invite\/\$\{token\}`/, 'agent invite links must route through /invite/:token')
assert.match(attorneyFirmInvitations, /createInvite\(/, 'attorney firm invite creation must mirror canonical invites')
assert.match(attorneyFirmInvitations, /bridge_accept_invite/, 'attorney firm invite acceptance must try canonical flow')

console.log('unified invite architecture tests passed')
