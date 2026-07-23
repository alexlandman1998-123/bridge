import assert from 'node:assert/strict'
import fs from 'node:fs'

const phase0Migration = fs.readFileSync('../supabase/migrations/202607220002_authoritative_mandate_signing_delivery_phase0.sql', 'utf8')
const phase1Migration = fs.readFileSync('../supabase/migrations/202607220003_signable_packet_sent_phase1.sql', 'utf8')
const packetPolicies = fs.readFileSync('../supabase/migrations/202607170025_legal_packet_least_privilege_h2.sql', 'utf8')
const mandateSender = fs.readFileSync('../supabase/functions/send-mandate-signing-email/index.ts', 'utf8')
const genericEmail = fs.readFileSync('../supabase/functions/send-email/index.ts', 'utf8')
const signerResolver = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
const signerAction = fs.readFileSync('../supabase/functions/signer-signing-action/index.ts', 'utf8')

// H2 intentionally gives an authorised packet owner normal update access. The
// Phase 1 trigger—not a client convention—is therefore the authority boundary.
assert.match(packetPolicies, /create policy document_packets_h2_update[\s\S]{0,500}for update to authenticated/)
assert.match(phase0Migration, /lower\(coalesce\(new\.packet_type, ''\)\) = 'mandate'/)

for (const marker of [
  'bridge_enforce_authoritative_signable_packet_sent_phase1',
  "in ('mandate', 'otp')",
  "v_role <> 'service_role'",
  "in ('sent', 'partially_signed', 'signed', 'completed')",
  "tg_op = 'INSERT'",
  'v_next_status is distinct from v_old_status',
  'PHASE1_PACKET_LIFECYCLE_SERVICE_ONLY',
  'before insert or update of status, packet_type on public.document_packets',
  'trg_authoritative_signable_packet_sent_phase1',
]) {
  assert.ok(phase1Migration.includes(marker), `Phase 1 lifecycle-state guard must contain ${marker}`)
}

// The guard is deliberately scoped: browser authors may keep preparing
// mandate/OTP drafts, but cannot create a false public/signing lifecycle or
// reclassify a protected commercial packet as mandate/OTP.
const lifecycleGuard = phase1Migration.match(/if v_role <> 'service_role'[\s\S]*?\n  end if;/)?.[0] || ''
for (const allowedStatus of ['draft', 'generated', 'signing_prep', 'ready_to_send']) {
  assert.ok(!lifecycleGuard.includes(`'${allowedStatus}'`), `Phase 1 must not block ${allowedStatus}`)
}
assert.match(phase1Migration, /v_next_packet_type is distinct from v_old_packet_type/)

const protectedLifecycleStatuses = new Set(['sent', 'partially_signed', 'signed', 'completed'])
const isBlockedByPhase1 = ({ role = 'authenticated', operation = 'UPDATE', previousType = '', nextType = '', previousStatus = '', nextStatus = '' }) =>
  role !== 'service_role' &&
  ['mandate', 'otp'].includes(nextType) &&
  protectedLifecycleStatuses.has(nextStatus) &&
  (operation === 'INSERT' || previousStatus !== nextStatus || previousType !== nextType)

assert.equal(isBlockedByPhase1({ operation: 'INSERT', nextType: 'otp', nextStatus: 'completed' }), true)
assert.equal(isBlockedByPhase1({ previousType: 'mandate', nextType: 'mandate', previousStatus: 'sent', nextStatus: 'partially_signed' }), true)
assert.equal(isBlockedByPhase1({ previousType: 'commercial', nextType: 'mandate', previousStatus: 'sent', nextStatus: 'sent' }), true)
assert.equal(isBlockedByPhase1({ operation: 'INSERT', nextType: 'mandate', nextStatus: 'ready_to_send' }), false)
assert.equal(isBlockedByPhase1({ operation: 'INSERT', nextType: 'commercial', nextStatus: 'completed' }), false)
assert.equal(isBlockedByPhase1({ role: 'service_role', previousType: 'mandate', nextType: 'mandate', previousStatus: 'sent', nextStatus: 'completed' }), false)

// Delivery remains fail-closed for OTP and generic email cannot substitute for
// the packet-bound signing endpoint. Phase 2 uses the canonical generic
// finaliser, so the signer path must require its certified PDF rather than
// retain the old OTP-disabled containment branch.
assert.match(mandateSender, /const isOtpSigning = type === "otp_signing"/)
assert.match(mandateSender, /OTP_EMAIL_DISPATCH_BINDING_REQUIRED/)
assert.match(mandateSender, /OTP_EMAIL_PACKET_NOT_DELIVERABLE/)
assert.match(mandateSender, /bridge_record_otp_signing_delivery_phase2/)
assert.match(mandateSender, /versionHasCertifiedPdf\(version\)/)
assert.doesNotMatch(mandateSender, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
assert.match(genericEmail, /MANDATE_SIGNING_DELIVERY_ROUTE_RETIRED/)
assert.match(signerResolver, /if \(!\["sent", "viewed", "signed"\]\.includes\(signerStatus\)\)/)
assert.match(signerAction, /const signerSessionActive = \["sent", "viewed"\]\.includes\(signerStatus\)/)
assert.match(signerAction, /const canonicalOtpPdfReady/)
assert.match(signerAction, /OTP_CANONICAL_PDF_REQUIRED/)
assert.match(signerAction, /const finaliserFunction = "generate-final-signed-document"/)
assert.match(signerAction, /packet_type, status, current_version_number/)
assert.match(signerAction, /deferExpiryMutation: true/)

const otpMutationGate = signerAction.indexOf('if (normalizeText(runtimePacket?.packet_type).toLowerCase() === "otp")')
const firstSignerMutation = signerAction.indexOf('if (action === "upsert_asset")')
assert.ok(otpMutationGate >= 0, 'OTP signer-action containment gate must exist')
assert.ok(firstSignerMutation > otpMutationGate, 'OTP signer-action containment must run before asset, field, viewed, or signer writes')

console.log('Document generator Phase 1 mandate/OTP lifecycle guard passed.')
