/* global process */
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

const currentMonthIso = new Date().toISOString()
const staleIso = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString()

function makeRow(id, overrides = {}) {
  return {
    development: {
      id: overrides.developmentId || 'dev-one',
      name: overrides.developmentName || 'Harbour Point',
      developer_company: overrides.developerCompany || 'Aurum Developments',
      location: overrides.location || 'Sea Point',
      status: overrides.developmentStatus || 'Active',
    },
    transaction: {
      id,
      development_id: overrides.developmentId || 'dev-one',
      bond_amount: overrides.bondAmount ?? 1_000_000,
      purchase_price: overrides.purchasePrice,
      gross_commission_amount: overrides.commission ?? 0,
      stage: overrides.stage || 'Application submitted',
      current_main_stage: overrides.mainStage || 'FIN',
      next_action: overrides.nextAction || 'Application submitted to bank',
      comment: overrides.comment || '',
      finance_status: overrides.financeStatus || '',
      compliance_status: overrides.complianceStatus || '',
      lifecycle_state: overrides.lifecycleState || 'active',
      is_active: overrides.isActive ?? true,
      registered_at: overrides.registeredAt || null,
      cancelled_at: overrides.cancelledAt || null,
      archived_at: overrides.archivedAt || null,
      completed_at: overrides.completedAt || null,
      assigned_branch_name: overrides.branchName || 'Atlantic Branch',
      bond_originator: overrides.consultantName || 'Nandi Clarke',
      updated_at: overrides.updatedAt || currentMonthIso,
      created_at: overrides.createdAt || staleIso,
    },
    documentSummary: {
      missingCount: overrides.missingCount ?? 0,
      totalRequired: 6,
      uploadedCount: 6 - (overrides.missingCount ?? 0),
    },
  }
}

try {
  const service = await server.ssrLoadModule('/src/services/bondCommandCenterService.js')
  const portfolio = service.getBondDevelopmentPortfolio([
    {
      identity: {
        id: 'dev-one',
        name: 'Harbour Point',
        developerName: 'Aurum Developments',
        location: 'Sea Point',
        status: 'Active',
      },
      rows: [
        makeRow('approved', { bondAmount: 1_000_000, commission: 10_000, nextAction: 'Bond approved' }),
        makeRow('submitted', { bondAmount: 2_000_000, nextAction: 'Application submitted to bank' }),
        makeRow('registered', { bondAmount: 3_000_000, commission: 30_000, mainStage: 'REG', stage: 'Registered', nextAction: 'Registered', registeredAt: currentMonthIso }),
        makeRow('cancelled', { bondAmount: 9_000_000, lifecycleState: 'cancelled', cancelledAt: currentMonthIso }),
        makeRow('stale-docs', { bondAmount: 500_000, missingCount: 2, mainStage: 'OTP', stage: 'Awaiting documents', updatedAt: staleIso, nextAction: 'Awaiting documents' }),
      ],
    },
    {
      identity: {
        id: 'dev-two',
        name: 'Orchard Gate',
        developerName: 'Developer not linked',
        location: 'Location pending',
        status: 'Active',
      },
      rows: [
        makeRow('docs-only', {
          developmentId: 'dev-two',
          developmentName: 'Orchard Gate',
          developerCompany: '',
          location: '',
          bondAmount: 700_000,
          nextAction: 'Collect documents',
        }),
      ],
    },
  ])

  const harbour = portfolio.developments.find((row) => row.id === 'dev-one')
  const orchard = portfolio.developments.find((row) => row.id === 'dev-two')

  assert.equal(harbour.pipelineValue, 6_500_000)
  assert.equal(harbour.activeApplications, 4)
  assert.equal(harbour.awaitingDocs, 1)
  assert.equal(harbour.approvalRate, 67)
  assert.equal(harbour.registeredThisMonth, 1)
  assert.equal(harbour.commissionForecast, 40_000)
  assert.equal(harbour.riskLevel, 'medium')
  assert.equal(harbour.branchName, 'Atlantic Branch')
  assert.equal(harbour.consultantName, 'Nandi Clarke')

  assert.equal(orchard.approvalRate, null)
  assert.equal(orchard.developerName, 'Developer not linked')
  assert.equal(orchard.location, 'Location pending')

  assert.equal(portfolio.summary.totalPipelineValue, 7_200_000)
  assert.equal(portfolio.summary.activeApplications, 5)
  assert.equal(portfolio.summary.approvalRate, 67)
  assert.equal(portfolio.summary.registeredThisMonth, 1)
  assert.equal(portfolio.summary.commissionForecast, 40_000)
  assert.equal(portfolio.summary.developmentsAtRisk, 1)

  assert.deepEqual(service.calculateDevelopmentRisk([makeRow('healthy', { updatedAt: currentMonthIso })]), {
    riskLevel: 'low',
    riskCount: 0,
  })
  assert.deepEqual(service.calculateDevelopmentRisk([
    makeRow('medium-risk', { missingCount: 1, mainStage: 'OTP', stage: 'Awaiting documents', updatedAt: staleIso, nextAction: 'Awaiting documents' }),
    makeRow('medium-healthy-a', { updatedAt: currentMonthIso }),
    makeRow('medium-healthy-b', { updatedAt: currentMonthIso }),
    makeRow('medium-healthy-c', { updatedAt: currentMonthIso }),
  ]), {
    riskLevel: 'medium',
    riskCount: 1,
  })
  assert.deepEqual(service.calculateDevelopmentRisk([makeRow('high-risk', { comment: 'compliance review required' })]), {
    riskLevel: 'high',
    riskCount: 1,
  })

  console.log('bond development portfolio service tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
