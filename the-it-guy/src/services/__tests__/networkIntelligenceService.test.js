import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    __networkIntelligenceServiceTestUtils,
  } = await server.ssrLoadModule('/src/services/networkIntelligenceService.js')

  const {
    formatCurrency,
    formatDuration,
    getRelationshipMilestone,
    toNetworkOpportunity,
    toNetworkRelationship,
    toNetworkSummary,
    toPartnerSuggestion,
    toReferralMetric,
  } = __networkIntelligenceServiceTestUtils

  {
    const relationship = toNetworkRelationship({
      id: 'metric-1',
      partner_organization_id: 'org-tucker',
      partner_display_name: 'Tucker Attorneys',
      partner_organization_type: 'attorney_firm',
      relationship_type: 'agency_attorney',
      direction: 'outgoing',
      transaction_count: 54,
      active_transaction_count: 7,
      completed_transaction_count: 47,
      completion_rate: '0.8703',
      average_cycle_time: '68.4',
      average_response_time: '4.2',
      referral_volume: '12840000',
      relationship_health_score: 92,
    })

    assert.equal(relationship.partnerName, 'Tucker Attorneys')
    assert.equal(relationship.partnerTypeLabel, 'Attorney Firm')
    assert.equal(relationship.relationshipTypeLabel, 'Agency to Attorney')
    assert.equal(relationship.transactionCount, 54)
    assert.equal(relationship.averageCycleTime, 68.4)
    assert.equal(relationship.relationshipHealthScore, 92)
    assert.equal(relationship.milestone, '50 transactions together')
  }

  {
    const summary = toNetworkSummary({
      networkSize: '38',
      connectedAttorneys: 12,
      connectedOriginators: 8,
      transactionCount: '128',
      activeTransactionCount: '16',
      completedTransactionCount: '112',
      referralVolume: '35000000.55',
      averageCycleTime: '74.2',
      averageRelationshipScore: '81',
    })

    assert.equal(summary.networkSize, 38)
    assert.equal(summary.connectedAttorneys, 12)
    assert.equal(summary.transactionCount, 128)
    assert.equal(summary.referralVolume, 35000000.55)
    assert.equal(summary.averageRelationshipScore, 81)
  }

  {
    const referrer = toReferralMetric({
      organization_id: 'org-abc',
      organization_name: 'ABC Properties',
      organization_type: 'agency',
      transaction_count: 67,
      referral_volume: 4200000,
    })

    assert.equal(referrer.organizationName, 'ABC Properties')
    assert.equal(referrer.organizationTypeLabel, 'Agency')
    assert.equal(referrer.transactionCount, 67)
  }

  {
    const suggestion = toPartnerSuggestion({
      id: 'org-betterbond',
      display_name: 'BetterBond',
      organization_type: 'bond_originator',
      network_signal: 63,
    })

    assert.equal(suggestion.name, 'BetterBond')
    assert.equal(suggestion.organizationTypeLabel, 'Bond Originator')
    assert.equal(suggestion.reason, 'Suggested from Arch9 network activity')
    assert.equal(suggestion.networkSignal, 63)
  }

  {
    const opportunity = toNetworkOpportunity({
      id: 'opportunity-1',
      partner_prospect_id: 'prospect-tucker',
      role_type: 'attorney',
      company_name: 'Tucker Attorneys',
      status: 'pending',
      transactions_waiting: 8,
      agencies_count: 3,
      invitation_count: 10,
      accepted_invitation_count: 0,
      opportunity_score: 92,
    })

    assert.equal(opportunity.companyName, 'Tucker Attorneys')
    assert.equal(opportunity.transactionsWaiting, 8)
    assert.equal(opportunity.agenciesCount, 3)
    assert.equal(opportunity.conversionRate, 0)
    assert.equal(opportunity.opportunityScore, 92)
  }

  {
    assert.equal(getRelationshipMilestone(0), 'New relationship')
    assert.equal(getRelationshipMilestone(10), '10 transactions together')
    assert.equal(getRelationshipMilestone(112), '100 transactions together')
    assert.equal(formatDuration(4.24, 'hours'), '4.2h')
    assert.equal(formatDuration(74.2), '74d')
    assert.match(formatCurrency(12840000), /^R/)
  }

  console.log('networkIntelligenceService tests passed')
} finally {
  await server.close()
}
