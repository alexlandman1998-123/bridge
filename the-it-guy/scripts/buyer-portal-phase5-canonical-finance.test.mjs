import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('production adapts live bond and account state into the shared finance model', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /buildBuyerFinancePresentationModel\(\{[\s\S]*?source: 'production'/)
  assert.match(source, /offers: displayedBondOfferCards/)
  assert.match(source, /accountSummary: matterAccountsState\.summary/)
  assert.match(source, /<BuyerFinanceWorkspace[\s\S]*?model=\{buyerFinancePresentationModel\}/)
  assert.match(source, /<ClientPortalMatterAccountsPanel[\s\S]*?onUploadProof=\{handleUploadMatterAccountProof\}/)
  assert.match(source, /handleBondApplicationSubmit/)
  assert.match(source, /handleAcceptBondOffer/)
  assert.match(source, /handleDeclineBondOffer/)
})

test('demo desktop and mobile finance use one reactive canonical model', async () => {
  const source = await read('src/pages/ProspectBuyerDemo.jsx')

  assert.match(source, /const buyerFinanceModel = useMemo\(/)
  assert.match(source, /buildDemoBuyerFinanceModel\(demoUploadComplete\)/)
  assert.match(source, /financeModel=\{buyerFinanceModel\}/)
  assert.match(source, /<BuyerFinanceWorkspace[\s\S]*?model=\{model\}/)
  assert.match(source, /<MobileFinance brand=\{brand\} model=\{financeModel\}/)
})

test('shared finance files remain presentation-only boundaries', async () => {
  const [model, workspace] = await Promise.all([
    read('src/core/clientPortal/buyerFinancePresentationModel.js'),
    read('src/components/client-portal/finance/BuyerFinanceWorkspace.jsx'),
  ])

  assert.doesNotMatch(model, /services\/|supabase|fetch\(|localStorage|sessionStorage/)
  assert.doesNotMatch(workspace, /services\/|supabase|FINANCE_APPLICATION|matterAccountsState/)
  assert.match(workspace, /data-buyer-finance="workspace"/)
  assert.match(workspace, /data-finance-stage=\{stage\.state\}/)
  assert.match(workspace, /data-finance-offer=\{offer\.id\}/)
})
