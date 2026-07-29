import assert from 'node:assert/strict'
import { resolveLeadNextStep } from '../src/services/leadNextActionService.js'

const now = '2026-07-25T10:00:00+02:00'

assert.equal(
  resolveLeadNextStep(
    { stage: 'Offer Submitted', phone: '+27820000000' },
    [
      { title: 'Send updated valuation', status: 'Pending', dueDate: '2026-07-26' },
      { title: 'Call seller back', status: 'Pending', dueDate: '2026-07-24' },
    ],
    [{ title: 'Valuation', status: 'confirmed', dateTime: '2026-07-26T09:00:00+02:00' }],
    { now },
  ),
  'Overdue task: Call seller back',
)

assert.equal(
  resolveLeadNextStep(
    { stage: 'Contacted', phone: '+27820000000' },
    [{ title: 'Prepare viewing notes', status: 'Pending', dueDate: '2026-07-27' }],
    [{ title: 'Viewing', status: 'confirmed', dateTime: '2026-07-26T09:00:00+02:00' }],
    { now },
  ),
  'Upcoming appointment: Viewing on 26 Jul',
)

assert.equal(
  resolveLeadNextStep({ stage: 'Qualified' }, [], [], { now }),
  'Add phone or email before outreach',
)

assert.equal(
  resolveLeadNextStep(
    { stage: 'Qualified', email: 'buyer@example.test' },
    [{ title: 'Send shortlist', status: 'Pending', dueDate: '2026-07-27' }],
    [],
    { now },
  ),
  'Next task: Send shortlist',
)

assert.equal(
  resolveLeadNextStep({ stage: 'Offer Submitted', phone: '+27820000000' }, [], [], { now }),
  'Review buyer conditions before OTP generation',
)

assert.equal(
  resolveLeadNextStep({ stage: 'Viewing Completed', phone: '+27820000000' }, [], [], { now }),
  'Send Offer + Onboarding link',
)

assert.equal(
  resolveLeadNextStep({ stage: 'Ready to Generate OTP', phone: '+27820000000' }, [], [], { now }),
  'Generate OTP',
)

assert.equal(
  resolveLeadNextStep({ leadCategory: 'seller', stage: 'New Lead', phone: '+27820000000' }, [], [], { now }),
  'Contact Seller',
)

assert.equal(
  resolveLeadNextStep({ leadCategory: 'seller', stage: 'Contacted', phone: '+27820000000' }, [], [], { now }),
  'Send Seller Onboarding',
)

assert.equal(
  resolveLeadNextStep(
    { leadCategory: 'seller', stage: 'Onboarding Sent', status: 'Sent', phone: '+27820000000', sellerOnboardingStatus: 'sent' },
    [],
    [],
    { now },
  ),
  'Track Seller Onboarding',
)

assert.equal(
  resolveLeadNextStep(
    { leadCategory: 'seller', stage: 'Onboarding Submitted', status: 'Submitted', phone: '+27820000000', sellerOnboardingStatus: 'completed' },
    [],
    [],
    { now },
  ),
  'Generate Mandate',
)
