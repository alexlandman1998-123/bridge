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
  const service = await server.ssrLoadModule('/src/services/partnerNetworkIntelligenceService.js')

  const snapshot = {
    accessContext: { organisationId: 'org-source' },
    organisations: [
      {
        id: 'org-partner',
        name: 'Ooba East Rand',
        type: 'bond_originator',
        city: 'Germiston',
        province: 'Gauteng',
        transactionStats: {
          activeTransactions: 18,
          registrations: 12,
          avgDealSpeedDays: 4,
          responseTimeHours: 3,
        },
      },
    ],
    relationships: [
      {
        id: 'rel-1',
        organisationId: 'org-source',
        partnerOrganisationId: 'org-partner',
        relationshipStatus: 'accepted',
        preferred: true,
        scopeType: 'branch',
        scopeId: 'branch-1',
        acceptedAt: '2026-06-01T08:00:00.000Z',
        partner: {
          id: 'org-partner',
          name: 'Ooba East Rand',
          type: 'bond_originator',
          city: 'Germiston',
          province: 'Gauteng',
          transactionStats: {
            activeTransactions: 18,
            registrations: 12,
            avgDealSpeedDays: 4,
            responseTimeHours: 3,
          },
        },
      },
    ],
    referrals: [
      {
        id: 'ref-1',
        referringOrganisationId: 'org-source',
        referredOrganisationId: 'org-partner',
        transactionId: 'TX-123',
        referralStatus: 'converted',
        referralDate: '2026-06-02T08:00:00.000Z',
        referralValue: 250000,
      },
    ],
  }

  const intelligence = service.buildPartnerNetworkIntelligence({
    snapshot,
    selectedPartnerId: 'org-partner',
    peopleByRelationshipId: {
      'rel-1': {
        groups: {
          principal: [{ userId: 'u-1', fullName: 'Warren Jacobs', role: 'principal', branchName: 'East Rand', isActive: true }],
          branchManagers: [{ userId: 'u-2', fullName: 'Melissa Botha', role: 'branch_manager', branchName: 'East Rand', teamName: 'Consultants', isActive: true }],
          agents: [{ userId: 'u-3', fullName: 'John Smith', role: 'agent', branchName: 'East Rand', isActive: true }],
        },
      },
    },
    auditEvents: [
      {
        type: 'partner.routing.resolved',
        at: '2026-06-05T08:00:00.000Z',
        payload: {
          targetOrganisationId: 'org-partner',
          targetUserId: 'u-1',
          resolutionReason: 'User preference found.',
        },
      },
    ],
    query: 'Warren',
  })

  assert.equal(intelligence.summary.totalConnections, 1)
  assert.equal(intelligence.summary.activeConnections, 1)
  assert.equal(intelligence.summary.totalUsers, 3)
  assert.equal(intelligence.partnerProfiles[0].healthLabel, 'Healthy')
  assert.equal(intelligence.partnerProfiles[0].staffDirectory.length, 3)
  assert.ok(intelligence.searchResults.some((result) => result.type === 'staff' && result.title === 'Warren Jacobs'))
  assert.ok(intelligence.activityFeed.length >= 2)
  assert.equal(intelligence.selectedProfile.organisationName, 'Ooba East Rand')
  assert.ok(intelligence.executiveHighlights.length >= 2)

  console.log('partnerNetworkIntelligenceService tests passed')
} finally {
  await server.close()
}

