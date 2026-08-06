import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/signer-signing-action/index.ts', 'utf8')

assert.match(
  source,
  /const reloadedPacket = await reloadPacketForSellerPortalInvite[\s\S]*packet: reloadedPacket,[\s\S]*sendSellerPortalInviteAfterMandateSigned/,
  'Post-mandate seller portal invite should use the reloaded packet context written by finalisation.',
)

assert.match(
  source,
  /resolveSellerPortalInviteOnboarding\(\{ supabase, listing, packet \}\) \|\|[\s\S]*createSellerPortalInviteOnboarding/,
  'Post-mandate seller portal invite should create missing seller portal onboarding context before skipping.',
)

assert.match(
  source,
  /sellerPortalToken[\s\S]*seller-portal-[\s\S]*crypto\.randomUUID\(\)/,
  'Fallback seller portal onboarding context should create a stable seller portal token.',
)

assert.match(
  source,
  /const emailResult = await invokeSendEmail\(\{ body: payload \}\)/,
  'Post-mandate seller portal invite should still send through the seller_portal_link email path.',
)
