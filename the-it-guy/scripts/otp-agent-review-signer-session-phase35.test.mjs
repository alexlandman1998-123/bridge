import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpAgentReviewUiPhase31Audit,
} from '../src/core/documents/otpAgentReviewUiPhase31.js'
import {
  buildOtpAgentReviewRuntimeProofPhase32Audit,
} from '../src/core/documents/otpAgentReviewRuntimeProofPhase32.js'
import {
  buildOtpAgentReviewSigningAlignmentPhase33Audit,
} from '../src/core/documents/otpAgentReviewSigningEnvelopeAlignmentPhase33.js'
import {
  buildOtpAgentReviewDispatchGuardPhase34Audit,
} from '../src/core/documents/otpAgentReviewDispatchGuardPhase34.js'
import {
  OTP_AGENT_REVIEW_SIGNER_SESSION_CONTRACT,
  OTP_AGENT_REVIEW_SIGNER_SESSION_PHASE35_VERSION,
  OTP_AGENT_REVIEW_SIGNER_SESSION_READY_STATUS,
  buildOtpAgentReviewSignerSession,
  buildOtpAgentReviewSignerSessionAlignment,
  buildOtpAgentReviewSignerSessionPhase35Audit,
  formatOtpAgentReviewSignerSessionPhase35Markdown,
} from '../src/core/documents/otpAgentReviewSignerSessionPhase35.js'
import {
  buildOtpAgentReviewDispatchGuardDecision,
} from '../src/core/documents/otpAgentReviewDispatchGuardPhase34.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')
const phase35Source = await readFile(new URL('../src/core/documents/otpAgentReviewSignerSessionPhase35.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-agent-review-signer-session-phase35'],
  'node scripts/otp-agent-review-signer-session-phase35.test.mjs',
  'package.json should expose the OTP agent review signer session Phase 35 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-agent-review-signer-session-phase35'],
  'node scripts/report-otp-agent-review-signer-session-phase35.mjs',
  'package.json should expose the OTP agent review signer session Phase 35 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-agent-review-signer-session-phase35'),
  'OTP vNext verification should include Phase 35 signer session alignment.',
)

assert.equal(OTP_AGENT_REVIEW_SIGNER_SESSION_PHASE35_VERSION, 'otp_agent_review_signer_session_phase35_v1')
assert.equal(OTP_AGENT_REVIEW_SIGNER_SESSION_CONTRACT, 'otp-vnext-agent-review-signer-session-phase35-v1')
assert.equal(OTP_AGENT_REVIEW_SIGNER_SESSION_READY_STATUS, 'OTP_AGENT_REVIEW_SIGNER_SESSION_READY_FOR_COMPLETION_GUARD_EXTENSION')

function sampleGuard(routeVariant = 'resale_existing_property', targetSignerRole = 'seller') {
  const signerRoles = routeVariant === 'new_development'
    ? ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent']
    : ['purchaser_1', 'seller']
  return buildOtpAgentReviewDispatchGuardDecision({
    alignment: {
      version: 'otp_agent_review_signing_alignment_phase33_v1',
      contract: 'otp-vnext-agent-review-signing-alignment-phase33-v1',
      canPrepareSigningEnvelope: true,
      blockerCodes: [],
      routeVariant,
      routeLabel: routeVariant === 'new_development' ? 'New development OTP' : 'Existing / resale property OTP',
      expectedSignerRoles: signerRoles,
      signerRoles,
      reviewRecordFingerprint: `review-${routeVariant}`,
      termsFingerprint: `terms-${routeVariant}`,
    },
    targetSignerRole,
    packetId: `otp-phase35-${routeVariant}-packet`,
    packetVersionId: `otp-phase35-${routeVariant}-version`,
    checkedAt: '2026-08-05T22:00:00.000Z',
  })
}

const resaleGuard = sampleGuard('resale_existing_property', 'seller')
const resaleSession = buildOtpAgentReviewSignerSession({
  dispatchGuard: resaleGuard,
  checkedAt: '2026-08-05T22:00:00.000Z',
})
const resaleAlignment = buildOtpAgentReviewSignerSessionAlignment({
  dispatchGuard: resaleGuard,
  signerSession: resaleSession,
  checkedAt: '2026-08-05T22:00:00.000Z',
})
assert.equal(resaleAlignment.version, OTP_AGENT_REVIEW_SIGNER_SESSION_PHASE35_VERSION)
assert.equal(resaleAlignment.contract, OTP_AGENT_REVIEW_SIGNER_SESSION_CONTRACT)
assert.equal(resaleAlignment.canOpenRoleScopedSession, true)
assert.equal(resaleAlignment.sessionSignerRole, 'seller')
assert.equal(resaleAlignment.targetSignerRole, 'seller')
assert.equal(resaleAlignment.packetVersionId, resaleGuard.packetVersionId)
assert.equal(resaleAlignment.otherSignerFieldCount, 0)
assert.equal(resaleAlignment.exactVersionBound, true)

const developmentGuard = sampleGuard('new_development', 'developer_authorised_signatory')
const developmentAlignment = buildOtpAgentReviewSignerSessionAlignment({
  dispatchGuard: developmentGuard,
  signerSession: buildOtpAgentReviewSignerSession({
    dispatchGuard: developmentGuard,
    checkedAt: '2026-08-05T22:00:00.000Z',
  }),
  checkedAt: '2026-08-05T22:00:00.000Z',
})
assert.equal(developmentAlignment.canOpenRoleScopedSession, true)
assert.equal(developmentAlignment.sessionSignerRole, 'developer_authorised_signatory')

const roleLeak = buildOtpAgentReviewSignerSessionAlignment({
  dispatchGuard: resaleGuard,
  signerSession: buildOtpAgentReviewSignerSession({
    dispatchGuard: resaleGuard,
    signerRole: 'developer_authorised_signatory',
    checkedAt: '2026-08-05T22:00:00.000Z',
  }),
})
assert.equal(roleLeak.canOpenRoleScopedSession, false)
assert.ok(roleLeak.blockerCodes.some((code) => code.includes('session_signer_role_mismatch')))
assert.ok(roleLeak.blockerCodes.some((code) => code.includes('session_role_not_allowed_for_route')))

const versionMismatch = buildOtpAgentReviewSignerSessionAlignment({
  dispatchGuard: resaleGuard,
  signerSession: {
    ...resaleSession,
    version: {
      ...resaleSession.version,
      id: 'wrong-version',
    },
    binding: {
      ...resaleSession.binding,
      versionId: 'wrong-version',
      bindingKey: 'wrong-version-binding',
    },
  },
})
assert.equal(versionMismatch.canOpenRoleScopedSession, false)
assert.ok(versionMismatch.blockerCodes.includes('session_version_binding_mismatch'))

const crossSignerField = buildOtpAgentReviewSignerSessionAlignment({
  dispatchGuard: resaleGuard,
  signerSession: {
    ...resaleSession,
    fields: [
      ...resaleSession.fields,
      {
        id: 'purchaser_1:signature:page_3',
        signerRole: 'purchaser_1',
        type: 'signature',
        pageNumber: 3,
        required: true,
        status: 'pending',
      },
    ],
  },
})
assert.equal(crossSignerField.canOpenRoleScopedSession, false)
assert.ok(crossSignerField.blockerCodes.some((code) => code.startsWith('other_signer_fields_visible')))

for (const token of [
  'PHASE35_ROUTE_ROLE_LEAK_SESSION_BLOCKED',
  'PHASE35_VERSION_MISMATCH_BLOCKED',
  'PHASE35_CROSS_SIGNER_FIELD_VISIBILITY_BLOCKED',
  'OTP_AGENT_REVIEW_SIGNER_SESSION_READY_FOR_COMPLETION_GUARD_EXTENSION',
]) {
  assert.ok(phase35Source.includes(token), `phase35 source should include ${token}`)
}
for (const token of [
  'resolveExternalSignerSession',
  'FIELD_SCOPE_DENIED',
  'const fields = useMemo(() => (Array.isArray(session?.fields) ? session.fields : [])',
]) {
  assert.ok(signerPortalSource.includes(token), `SignerPortal should include ${token}`)
}
assert.ok(externalSigningApiSource.includes('assertCanonicalSigningSession'))
assert.ok(signingSessionContractSource.includes('exactVersionBound'))
assert.ok(signingSessionContractSource.includes('SIGNING_SESSION_CONTRACT'))

const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt: '2026-08-05T22:00:00.000Z',
  phase30Audit: {
    status: 'OTP_AGENT_CONTROLLED_EDITS_READY_FOR_UI_WIRING',
    sampleModels: {
      resaleReady: {
        canOpenAgentReviewModal: true,
        canGenerateOtp: true,
        routeVariant: 'resale_existing_property',
        routeLabel: 'Existing / resale property OTP',
        blockerCodes: [],
        warningCodes: [],
        editableSections: [{ key: 'buyer_cost_obligations' }],
        standardConditionControls: [{ key: 'bond_approval' }],
        approvalRows: [],
      },
    },
  },
  workspaceSource,
  packageJson,
})
const phase32Audit = buildOtpAgentReviewRuntimeProofPhase32Audit({
  checkedAt: '2026-08-05T22:00:00.000Z',
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt: '2026-08-05T22:00:00.000Z',
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt: '2026-08-05T22:00:00.000Z',
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt: '2026-08-05T22:00:00.000Z',
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
assert.equal(audit.version, OTP_AGENT_REVIEW_SIGNER_SESSION_PHASE35_VERSION)
assert.equal(audit.status, OTP_AGENT_REVIEW_SIGNER_SESSION_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 36)
for (const check of [
  'PHASE35_PHASE34_DISPATCH_GUARD_READY',
  'PHASE35_BOTH_ROUTES_OPEN_ROLE_SCOPED_SESSIONS',
  'PHASE35_EXACT_REVIEWED_VERSION_BOUND',
  'PHASE35_ONLY_OWN_FIELDS_VISIBLE',
  'PHASE35_ROUTE_ROLE_LEAK_SESSION_BLOCKED',
  'PHASE35_VERSION_MISMATCH_BLOCKED',
  'PHASE35_CROSS_SIGNER_FIELD_VISIBILITY_BLOCKED',
  'PHASE35_SIGNER_PORTAL_CONTRACT_WIRED',
  'PHASE35_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpAgentReviewSignerSessionPhase35Markdown(audit)
for (const token of [
  'OTP Generator Phase 35 Agent Review Signer Session Runtime Alignment',
  'OTP_AGENT_REVIEW_SIGNER_SESSION_READY_FOR_COMPLETION_GUARD_EXTENSION',
  'PHASE35_ROUTE_ROLE_LEAK_SESSION_BLOCKED',
  'Phase 36: OTP Agent Review Completion Guard Runtime Alignment',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP agent review signer session Phase 35 contract passed.')
