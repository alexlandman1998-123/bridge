import { expect, it } from 'vitest'
import { emailCampaignPreflightFailure } from '../emailCampaignPreflightModel'
it('explains every failed check and leaves successful checks out of the error', () => {
  const message = emailCampaignPreflightFailure({ checks: [{ key: 'sender', ok: false }, { key: 'audience', ok: false }, { key: 'subscription', ok: true }, { key: 'account', ok: false }] })
  expect(message).toContain('verified sender')
  expect(message).toContain('No eligible recipients')
  expect(message).toContain('account is disabled')
  expect(message).not.toContain('active send-permission')
})
it('retains exact content and provider reasons without repeating them', () => {
  const reason = 'The brochure image is unavailable.'
  expect(emailCampaignPreflightFailure({ contentCheck: { errors: [reason] }, checks: [{ key: 'content', ok: false, message: reason }] })).toBe(reason)
})
it('gives a retry instruction when an older server omits check details', () => {
  expect(emailCampaignPreflightFailure()).toContain('Refresh and run the checks again')
})
it('retains the current server readiness issues after merging the older campaign UI', () => {
  expect(emailCampaignPreflightFailure({ issues: ['The verified sender domain has expired.'] })).toBe('The verified sender domain has expired.')
})
