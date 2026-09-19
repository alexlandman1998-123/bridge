import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SELLER_ONBOARDING_SIGNING_STAGES, buildSellerOnboardingSigningAuditExport, createSellerOnboardingSigningLifecycle } from '../src/core/documents/sellerOnboardingSigningLifecycle.js'

const lifecycle = createSellerOnboardingSigningLifecycle({ stage: SELLER_ONBOARDING_SIGNING_STAGES.manualAwaitingUpload, actor: 'agent-1' })
assert.equal(lifecycle.stage, 'manual_awaiting_upload')
const audit = buildSellerOnboardingSigningAuditExport({ lifecycle, signingSessions: [{ signerEmail: 'SELLER@example.test', status: 'signed' }] })
assert.equal(audit.signatures[0].signerEmail, 'seller@example.test')
assert.match(readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'), /sellerOnboardingSigningLifecycle/)
assert.match(readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'), /SELLER_ONBOARDING_SIGNING_STAGES\.packPrepared/)
console.log('seller onboarding signing Phase 5 checks passed')
