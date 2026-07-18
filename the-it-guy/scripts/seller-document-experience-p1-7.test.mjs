import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerDocumentExperienceModel } from '../src/lib/sellerDocumentExperienceModel.js'

const requirements = [
  {
    id: 'requirement-rates',
    requirement_key: 'rates_account',
    requirement_name: 'Municipal rates statement',
    status: 'requested',
    request_stages: ['listing_ready', 'attorney_instruction_ready'],
    due_date: '2026-07-10T00:00:00Z',
  },
  {
    id: 'requirement-levy',
    requirement_key: 'levy_statement',
    requirement_name: 'Latest levy statement',
    status: 'requested',
    request_stages: ['listing_ready'],
  },
  {
    id: 'requirement-id',
    requirement_key: 'seller_identity_document',
    requirement_name: 'Seller identity document',
    status: 'rejected',
    rejection_reason: 'The image is cropped.',
    request_stages: ['mandate_ready'],
  },
]

const uploadedOnly = buildSellerDocumentExperienceModel({
  requirements,
  documents: [{
    id: 'rates-file',
    requirement_id: 'requirement-rates',
    requirement_key: 'rates_account',
    status: 'uploaded',
  }],
  audience: 'seller',
  now: new Date('2026-07-17T12:00:00Z'),
})

assert.equal(uploadedOnly.version, 'seller_document_experience_p1_7_v1')
assert.equal(uploadedOnly.summary.ready, false, 'an upload awaiting review must never be complete')
assert.equal(uploadedOnly.summary.approved, 0)
assert.equal(uploadedOnly.summary.reviewRequired, 1)
assert.equal(uploadedOnly.summary.actionRequired, 2)
assert.equal(uploadedOnly.summary.rejected, 1)
assert.equal(uploadedOnly.summary.overdue, 0, 'a received file is not overdue while awaiting review')
assert.equal(uploadedOnly.items.find((item) => item.key === 'rates_account').statusLabel, 'Received — awaiting review')
assert.match(uploadedOnly.items.find((item) => item.key === 'seller_identity_document').message, /cropped/)
assert.equal(uploadedOnly.stages[0].key, 'mandate_ready')

const wrongRequirementId = buildSellerDocumentExperienceModel({
  requirements: [requirements[1]],
  documents: [{
    id: 'unrelated-levy-file',
    requirement_id: 'different-requirement',
    requirement_key: 'levy_statement',
    status: 'approved',
  }],
})
assert.equal(wrongRequirementId.summary.approved, 0, 'a conflicting requirement id must not be rescued by a fuzzy/key match')

const approved = buildSellerDocumentExperienceModel({
  requirements: requirements.map((requirement) => ({ ...requirement, status: 'approved', rejection_reason: '' })),
  audience: 'agent',
})
assert.equal(approved.summary.ready, true)
assert.equal(approved.summary.assurancePercent, 100)
assert.equal(approved.summary.actionRequired, 0)

const handoff = buildSellerDocumentExperienceModel({
  requirements: [{
    id: 'requirement-bank',
    requirement_key: 'seller_bank_account_confirmation',
    status: 'approved',
    transaction_id: 'transaction-1',
    promotion_status: 'failed',
    promotion_error: 'Shared document write failed.',
    request_stages: ['attorney_instruction_ready'],
  }],
  audience: 'agent',
})
assert.equal(handoff.summary.handoffBlocked, 1)
assert.match(handoff.items[0].message, /Shared document write failed/)

const clientPortal = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
assert.match(clientPortal, /buildSellerDocumentExperienceModel/)
assert.match(clientPortal, /sellerDocumentExperience\.summary\.ready/)
assert.doesNotMatch(clientPortal, /completedStatuses = new Set\(\['approved',[^\n]*'uploaded'/)

const agentListing = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(agentListing, /sellerDocumentExperience\.summary\.assurancePercent/)
assert.match(agentListing, /Seller action/)
assert.match(agentListing, /Review queue/)

const workspace = await readFile(new URL('../src/components/client-portal/documents/SellerDocumentWorkspace.jsx', import.meta.url), 'utf8')
assert.match(workspace, /approval is required for completion/i)
assert.match(workspace, /Document stages/)

console.log('seller document experience P1-7 tests passed')
