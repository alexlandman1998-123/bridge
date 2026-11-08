import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { requireBuyerOnboardingDelivery } from '../../services/emailDeliveryReceipt'
const source = readFileSync(new URL('../agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const start = source.indexOf('async function createAndSendBuyerOnboardingForLead(')
const end = source.indexOf('\n  async function handleSendBuyerOnboardingFromAppointment', start)
const action = Function('scope', `with(scope) { return (${source.slice(start, end).trim()}); }`)
function scope(data, mode = 'digital_portal') {
  return {
    organisationId: 'org', selectedLead: { leadId: 'lead' }, selectedLeadIsSeller: false,
    normalizeClientIntakePreference: value => value || mode, normalizeText: value => String(value || '').trim(),
    BUYER_ONBOARDING_OTP_WORKSPACE_SOURCE: 'test', CLIENT_INTAKE_PREFERENCE: { DIGITAL_PORTAL: 'digital_portal' },
    offerLinkForm: {}, selectedLeadContactName: 'Buyer', selectedLeadContact: { email: 'buyer@example.test' },
    ensureBuyerOnboardingTransactionForLead: vi.fn().mockResolvedValue({ transactionId: 'transaction' }),
    isSupabaseConfigured: true, invokeEdgeFunction: vi.fn().mockResolvedValue({ data }), requireBuyerOnboardingDelivery,
    setOfferLinkForm: vi.fn(), recordBuyerLeadActivity: vi.fn().mockResolvedValue(null),
    currentAgent: {}, getClientIntakePreferenceLabel: () => 'Agent assisted',
  }
}
it.each([undefined, {}, { ok: false }, { ok: true }, { ok: true, queued: true }])('the real buyer lead action stops before claiming a send or advancing the lead: %j', async data => {
  const f = scope(data)
  await expect(action(f)()).rejects.toThrow(/email/)
  expect(f.setOfferLinkForm).not.toHaveBeenCalled()
  expect(f.recordBuyerLeadActivity).not.toHaveBeenCalled()
})
it('the real buyer lead action preserves a confirmed manual handoff without advancing the digital stage', async () => {
  const f = scope({ ok: true, manualHandoff: true, emailSkipped: true }, 'agent_assisted')
  await action(f)()
  expect(f.recordBuyerLeadActivity).toHaveBeenCalledWith(expect.objectContaining({ activityType: 'Buyer Onboarding Prepared', outcome: 'Prepared' }))
})
it.each(['agent_assisted', 'hard_copy'])('only explicitly requested assisted modes accept the manual receipt: %s', mode => {
  expect(requireBuyerOnboardingDelivery({ data: { ok: true, manualHandoff: true, emailSkipped: true } }, mode)).toBeNull()
  expect(() => requireBuyerOnboardingDelivery({ data: { ok: true } }, mode)).toThrow()
})
it('a manual response cannot masquerade as digital delivery', () => {
  expect(() => requireBuyerOnboardingDelivery({ data: { ok: true, manualHandoff: true, emailSkipped: true } })).toThrow()
})
const acceptedEmailStart = source.indexOf("          const onboardingEmail = await invokeEdgeFunction('send-email', {", source.indexOf("source: 'accepted_offer_conversion'") - 800)
const acceptedStart = source.lastIndexOf('        try {', acceptedEmailStart)
const acceptedEnd = source.indexOf('\n      }\n      if (transactionId)', acceptedStart)
const acceptedAction = Function('scope', `with(scope){return (async()=>{${source.slice(acceptedStart, acceptedEnd)};return onboardingSendWarning;})();}`)
it.each([{ ok: false }, { ok: true }, { ok: true, emailId: 'accepted', sent: false }])('accepted-offer conversion retains the saved transaction but warns about an unconfirmed invitation: %j', async data => {
  expect(await acceptedAction({ transactionId: 'transaction', intakePreference: 'digital_portal', selectedLeadContactName: 'Buyer', onboardingSendWarning: '', invokeEdgeFunction: vi.fn().mockResolvedValue({ data }), requireBuyerOnboardingDelivery })).toMatch(/email/)
})

it('accepted-offer conversion treats a transport exception as a delivery warning after saving', async () => {
  expect(await acceptedAction({ transactionId: 'transaction', intakePreference: 'digital_portal', selectedLeadContactName: 'Buyer', onboardingSendWarning: '', invokeEdgeFunction: vi.fn().mockRejectedValue(new Error('Connection interrupted')), requireBuyerOnboardingDelivery })).toBe('Connection interrupted')
})
