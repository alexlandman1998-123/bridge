import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const edgeFunctionPath = resolve(root, '..', 'supabase/functions/accept-partner-invitation/index.ts')
const acceptPagePath = resolve(root, 'src/pages/PartnerInvitationAcceptPage.jsx')
const pendingHelperPath = resolve(root, 'src/lib/pendingPartnerInvite.js')

const edgeFunction = readFileSync(edgeFunctionPath, 'utf8')
const acceptPage = readFileSync(acceptPagePath, 'utf8')
const pendingHelper = readFileSync(pendingHelperPath, 'utf8')

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

assertIncludes(
  edgeFunction,
  'function isInvitationAccepted(invitation: JsonRecord)',
  'edge function should centralize accepted-state detection',
)
assertIncludes(
  edgeFunction,
  'if (isInvitationAccepted(invitation))',
  'accepted invitations should enter an explicit repair path',
)
assert.match(
  edgeFunction,
  /if \(isInvitationAccepted\(invitation\)\) \{[\s\S]*?ensureOrganisationRelationship\(\{[\s\S]*?recipientOrganisationId: organisationId,[\s\S]*?updateInvitationAccepted\(\{[\s\S]*?alreadyAccepted: true,[\s\S]*?relationshipId,/,
  'accepted invitations should repair organisation_partners and claim missing recipient_organisation_id before returning alreadyAccepted',
)
assertIncludes(
  edgeFunction,
  'recipient_organisation_id: recipientOrganisationId',
  'acceptance should persist the accepting workspace as recipient_organisation_id',
)
assertIncludes(
  edgeFunction,
  'if (existingRecipientOrganisationId && existingRecipientOrganisationId !== organisationId)',
  'acceptance should continue rejecting mismatched workspaces',
)
assertIncludes(
  edgeFunction,
  'code: "not_active_member"',
  'acceptance should still require an active accepting workspace membership',
)

assert.match(
  acceptPage,
  /!autoAccept \|\|[\s\S]*?autoAcceptAttemptedRef\.current \|\|[\s\S]*?accepting \|\|[\s\S]*?loadingPreview/,
  'auto-accept guard should allow accepted previews to call the backend repair path once',
)
assert.doesNotMatch(
  acceptPage,
  /!autoAccept \|\|[\s\S]*?accepted \|\|[\s\S]*?accepting/,
  'auto-accept must not be blocked by alreadyAccepted preview state',
)
assertIncludes(
  acceptPage,
  "if (role === 'attorney' || workspaceType === 'attorney_firm') return '/attorney/dashboard'",
  'auto-accepted attorney partner invites should return to the attorney dashboard',
)
assertIncludes(
  acceptPage,
  'void handleAccept({ redirectOnSuccess: true })',
  'auto-accept should redirect only after the accept call succeeds',
)
assert.match(
  acceptPage,
  /if \(redirectOnSuccess\) \{[\s\S]*?navigate\(autoAcceptRedirectPath, \{ replace: true \}\)/,
  'auto-accept success should navigate to the resolved workspace home',
)

assertIncludes(
  pendingHelper,
  'writeStorage(window.localStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY, safePath)',
  'pending partner invite path should be copied to localStorage for callback durability',
)
assertIncludes(
  pendingHelper,
  'readStorage(window.localStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY)',
  'pending partner invite path should fall back to localStorage when sessionStorage is empty',
)
assertIncludes(
  pendingHelper,
  'removeStorage(window.localStorage, PENDING_PARTNER_INVITE_PATH_STORAGE_KEY)',
  'accepted partner invites should clear the durable localStorage fallback',
)

console.log('partner invite durable acceptance tests passed')
