import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const platformApiSource = await read('../src/modules/commercial/services/commercialPlatformApi.js')
for (const marker of [
  'buildCommercialTransactions',
  'buildCommercialTransactionTimeline',
  'buildCommercialRoleplayers',
  'buildCommercialCommissionSnapshot',
  'buildCommercialFinancialSummary',
  'buildCommercialRenewalRisk',
  'buildCommercialSearchIndex',
  'searchCommercialIndex',
  'buildCommercialTasks',
  'buildCommercialNotifications',
  'getCommercialTransactionWorkspaceData',
  'ctx-',
]) {
  assert.match(platformApiSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `commercial platform API should include ${marker}`)
}

const workspaceSource = await read('../src/modules/commercial/pages/CommercialTransactionWorkspacePage.jsx')
for (const marker of [
  'CommercialTransactionWorkspacePage',
  'Unified Timeline',
  'Roleplayers',
  'Tasks & Notifications',
  'Financials',
  'Lease Information',
  'Renewal Watch',
  'Commercial Search',
  'CommercialDocumentLibrary',
]) {
  assert.match(workspaceSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `transaction workspace should include ${marker}`)
}

const dashboardApiSource = await read('../src/modules/commercial/services/commercialDashboardApi.js')
for (const marker of [
  'buildCommercialTransactions',
  'financialSummary',
  'platformTasks',
  'platformNotifications',
  'commercialSearchIndex',
  'renewalRisk',
]) {
  assert.match(dashboardApiSource, new RegExp(marker), `dashboard API should include ${marker}`)
}

const dashboardSource = await read('../src/modules/commercial/pages/CommercialDashboard.jsx')
for (const marker of [
  'PlatformIntegrationCard',
  'Bridge Transaction Integration',
  'Expected Commission',
  'Notification Candidates',
  'Renewal Watch Items',
  '/commercial/transactions/',
]) {
  assert.match(dashboardSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `dashboard should expose ${marker}`)
}

const appSource = await read('../src/App.jsx')
for (const marker of [
  'CommercialTransactionWorkspacePage',
  'transactions/:transactionId',
]) {
  assert.match(appSource, new RegExp(marker), `App routes should include ${marker}`)
}

const navigationSource = await read('../src/modules/commercial/commercialNavigation.js')
assert.match(navigationSource, /Transactions/, 'Commercial navigation should include transaction visibility')

const commandPaletteSource = await read('../src/components/CommandPalette.jsx')
for (const marker of [
  'Go to Commercial Dashboard',
  'Go to Commercial Transactions',
  'Go to Commercial Documents',
]) {
  assert.match(commandPaletteSource, new RegExp(marker), `Command palette should include ${marker}`)
}

console.log('commercial Phase 6 platform integration tests passed')
