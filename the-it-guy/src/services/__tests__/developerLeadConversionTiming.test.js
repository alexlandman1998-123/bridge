import { beforeEach, expect, it, vi } from 'vitest'
import { convertDeveloperLeadToTransactionAndSendOnboarding } from '../developerLeadConversionService.js'

const mocks = vi.hoisted(() => ({ create: vi.fn(), onboarding: vi.fn(), from: vi.fn(), send: vi.fn(), recordSent: vi.fn() }))
vi.mock('../../lib/api.js', () => ({ createTransactionFromWizard: mocks.create, getOrCreateTransactionOnboarding: mocks.onboarding, recordBuyerOnboardingSent: mocks.recordSent }))
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from }, invokeEdgeFunction: mocks.send }))
const org = '00000000-0000-4000-8000-000000000001'
const lead = { developerLeadId: '00000000-0000-4000-8000-000000000002', developerOrgId: org }
beforeEach(() => { vi.clearAllMocks(); mocks.onboarding.mockResolvedValue({ token: 'existing-onboarding', url: 'https://example.invalid/onboarding' }) })

it.each(['new', 'qualified', 'reserved', 'onboarding_sent', 'onboarding_submitted', 'otp'])('never creates a transaction from the legacy onboarding action at %s', async leadStatus => {
  await expect(convertDeveloperLeadToTransactionAndSendOnboarding({ developerOrgId: org, lead: { ...lead, leadStatus } })).rejects.toThrow('signed OTP')
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.onboarding).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})

it('copies an existing transaction link without creating a transaction or changing lead status', async () => {
  const existing = { ...lead, leadStatus: 'converted', convertedTransactionId: '00000000-0000-4000-8000-000000000003' }
  const result = await convertDeveloperLeadToTransactionAndSendOnboarding({ developerOrgId: org, lead: existing, sendBuyerOnboarding: false, manualBuyerOnboardingDelivery: true })
  expect(result.convertedLead.leadStatus).toBe('converted')
  expect(result.transactionId).toBe(existing.convertedTransactionId)
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})


it.each([{data:{}},{data:{ok:true,queued:true}},{data:{error:'Provider rejected'}},{data:{ok:true,sent:false}}])('does not manufacture a sent stage from an unconfirmed delivery: %j',async response=>{
 mocks.send.mockResolvedValue(response)
 const current={...lead,leadStatus:'qualified',buyerEmail:'buyer@example.test',convertedTransactionId:'00000000-0000-4000-8000-000000000003'}
 const result=await convertDeveloperLeadToTransactionAndSendOnboarding({developerOrgId:org,lead:current})
 expect(result.convertedLead.leadStatus).toBe('qualified');expect(result.onboardingEmail.sent).toBe(false);expect(mocks.from).not.toHaveBeenCalled();expect(mocks.recordSent).not.toHaveBeenCalled()
})
it.each(['onboarding_submitted','otp','converted'])('resending a confirmed email preserves the %s stage',async leadStatus=>{
 mocks.send.mockResolvedValue({data:{ok:true,emailId:'accepted',message:'Email sent'}});mocks.recordSent.mockResolvedValue({})
 const current={...lead,leadStatus,buyerEmail:'buyer@example.test',convertedTransactionId:'00000000-0000-4000-8000-000000000003'}
 const result=await convertDeveloperLeadToTransactionAndSendOnboarding({developerOrgId:org,lead:current})
 expect(result.convertedLead.leadStatus).toBe(leadStatus);expect(result.onboardingEmail.sent).toBe(true);expect(mocks.from).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled()
})
