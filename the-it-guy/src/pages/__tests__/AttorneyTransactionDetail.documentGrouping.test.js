import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('general saved files remain reachable without satisfying party requirements', () => {
  const source = readFileSync(new URL('../AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const grouping = source.slice(source.indexOf('const ATTORNEY_DOCUMENT_DASHBOARD_CATEGORY_DEFINITIONS'), source.indexOf('function ArchlineDocumentsWorkspace'))
  const sandbox = {
    FileText: null, FileCheck2: null, Building2: null, UserCircle: null, CircleDollarSign: null, Upload: null, AlertTriangle: null,
    getSellerPartyLabels: () => ({ documents: 'Seller Documents', party: 'Seller' }),
    normalizeDocumentCommandStatus: status => status || 'uploaded',
    getDocumentCommandStatusLabel: status => status,
  }
  vm.runInNewContext(grouping + ';globalThis.buildDashboard=buildAttorneyDocumentsDashboardModel', sandbox)
  const dashboard = sandbox.buildDashboard({
    documentHealthSummary: { requiredCount: 1, missingCount: 1 },
    requiredRows: [{ id: 'buyer-requirement', canonicalCategory: 'buyer', status: 'missing' }],
    libraryRows: [{ id: 'general-upload', canonicalCategory: 'general', status: 'uploaded', displayName: 'QA continuity PDF', raw: { file_path: 'own-transaction/test.pdf' } }],
  })
  const other = dashboard.parties.find(party => party.key === 'general')
  assert.equal(other.categories[0].documents[0].id, 'general-upload')
  assert.equal(other.categories[0].requirements.length, 0)
  assert.equal(dashboard.totalRequired, 1)
  assert.equal(dashboard.verified, 0)
  assert.ok(!dashboard.parties.filter(party => party.key !== 'general').some(party => party.categories.some(category => category.documents.some(row => row.id === 'general-upload'))))
})
