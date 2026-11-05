import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source = readFileSync(new URL('../api.js', import.meta.url), 'utf8')
const start = source.indexOf('async function upsertClientPortalOnboardingForm(')
const end = source.indexOf('\nexport async function saveClientPortalOnboardingDraft', start)
function fixture(status, recordStatus = 'submitted') {
  const transaction = { id: 'transaction-fixture', purchaser_type: 'individual', finance_type: 'cash', onboarding_status: status,
    onboarding_completed_at: '2026-10-01T10:00:00Z', external_onboarding_submitted_at: '2026-10-01T10:00:00Z' }
  let saved
  const scope = {
    requireClientPortalTokenClient: () => ({}), resolveClientPortalLinkByToken: async () => ({ transaction_id: transaction.id }),
    resolveTransactionAndContext: async () => ({ transaction }), normalizePurchaserType: value => value,
    fetchOnboardingFormDataForTransaction: async () => ({ formData: {} }), getBondApplicationProgress: () => ({ status: 'not_started' }),
    getOnboardingFundingSources: () => [], deriveOnboardingFinanceManagedBy: () => 'client', buildBuyerOnboardingFlowSnapshot: () => ({}),
    getOrCreateTransactionOnboardingRecord: async () => ({ status: recordStatus }), normalizeTextValue: value => String(value || '').trim(),
    syncOnboardingTransactionFinanceSnapshot: async (_client, value) => { saved = value }, getOnboardingFinanceSnapshot: () => ({ financeType: 'cash' }),
    ensureTransactionRequiredDocuments: async () => {}, isBondFinanceType: () => false,
  }
  return { save: Function('scope', `with(scope) { return (${source.slice(start, end)}); }`)(scope), saved: () => saved }
}
for (const status of ['signed_otp_received', 'awaiting_signed_otp', 'client_onboarding_complete']) {
  test(`editing buyer details preserves the existing ${status} lifecycle and completion date`, async () => {
    const f = fixture(status)
    await f.save({ token: 'fixture', formData: { phone: '+27820000001' } })
    assert.equal(f.saved().onboardingStatus, status)
    assert.equal(f.saved().onboardingCompletedAt, '2026-10-01T10:00:00Z')
    assert.equal(f.saved().submit, false)
  })
}
test('a submitted historical record with no transaction status remains complete', async () => {
  const f = fixture('')
  await f.save({ token: 'fixture', formData: {} })
  assert.equal(f.saved().onboardingStatus, 'awaiting_signed_otp')
})
