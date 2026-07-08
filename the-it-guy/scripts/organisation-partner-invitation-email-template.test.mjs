import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  handler: await readFile(new URL('../../supabase/functions/send-email/handlers/organisationPartnerInvitation.ts', import.meta.url), 'utf8'),
  router: await readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8'),
  partnersRepository: await readFile(new URL('../src/lib/partnersRepository.js', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

for (const token of [
  'export function renderOrganisationPartnerInvitationEmail',
  'class="arch9-shell"',
  'arch9-relationship',
  'Review invitation&nbsp;&nbsp;&rarr;',
  'This invitation expires in',
  'Invitation URL',
  'About Arch9',
  'What accepting means',
  'Security and privacy',
  'Need help?',
  'Property Transaction Platform',
]) {
  assert(files.handler.includes(token), `organisation partner invite email should retain premium layout marker: ${token}`)
}

for (const legacyToken of [
  'Hi there,',
  'Review Partner Invite',
  'SECURITY & PRIVACY',
  'Open the invitation in Arch9 to review the relationship scope',
  'Once accepted, both organisations can use this relationship for partner coordination.',
]) {
  assert(!files.handler.includes(legacyToken), `legacy organisation partner invite email copy should not remain: ${legacyToken}`)
}

for (const token of [
  'handleOrganisationPartnerInvitationEmail',
  '"organisation_partner_invitation"',
  'route: "organisation_partner_invitation"',
]) {
  assert(files.router.includes(token), `send-email router should keep organisation partner invitations on the premium handler: ${token}`)
}

for (const token of [
  "type: 'organisation_partner_invitation'",
  'inviteUrl: buildPartnerInvitationLink(invitation.id)',
  'invitingOrganisationName: invitation.fromOrganisationName',
  'partnerName: invitation.toOrganisationName || recipientEmail',
]) {
  assert(files.partnersRepository.includes(token), `partner invitation sender should pass the premium email payload: ${token}`)
}

assert.match(
  files.packageJson,
  /"test:organisation-partner-invitation-email": "node scripts\/organisation-partner-invitation-email-template\.test\.mjs"/,
  'package.json should expose the organisation partner invitation email template guard',
)

console.log('Organisation partner invitation email template contract passed.')
