import assert from 'node:assert/strict'
import { normalizeRevoExternalEnquiry, resolveRevoEnquiryRouting } from '../ingestionRouting.js'

const enquiry = normalizeRevoExternalEnquiry({ source: 'P24', enquiryId: 'p24-123', name: 'Sarah Williams', email: ' Sarah@example.test ', message: 'Interested in 18 Oak Avenue' })
assert.equal(enquiry.source, 'property24')
assert.equal(enquiry.externalReference, 'p24-123')
assert.equal(enquiry.contactAddress, 'sarah@example.test')
assert.throws(() => normalizeRevoExternalEnquiry({ source: 'email', enquiryId: 'x' }), /Website, Property24/)

const listingRoute = resolveRevoEnquiryRouting({ listing: { assigned_agent_id: 'agent-1', branch_id: 'branch-1' }, fallback: { assignedUserId: 'fallback-user' } })
assert.deepEqual(listingRoute, { assignedUserId: 'agent-1', assignedTeamId: null, branchId: 'branch-1', reason: 'listing_owner' })
const fallbackRoute = resolveRevoEnquiryRouting({ fallback: { assignedTeamId: 'team-1', branchId: 'branch-1' } })
assert.equal(fallbackRoute.reason, 'source_fallback_team')

console.log('Revo inbox ingestion routing checks passed.')
