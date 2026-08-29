import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const modelSource = readFileSync(resolve(root, 'src/pages/agency/agencyLeadListModel.js'), 'utf8')
const lifecycleSource = readFileSync(resolve(root, 'src/pages/agency/agencyLeadListLifecycle.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

assert.match(modelSource, /BUYER_LEAD_LIST_STAGES, resolveAgencyLeadListLifecycle/)
assert.doesNotMatch(modelSource, /buyerProcessDefinitionService/)
assert.doesNotMatch(modelSource, /leadLifecyclePresentationService/)
assert.match(lifecycleSource, /export function resolveAgencyLeadListLifecycle/)
assert.match(lifecycleSource, /export function getBuyerLeadListStage/)
assert.match(lifecycleSource, /\['listing_created', 'listing_live', 'documents_submitted'\]\.includes\(sellerKey\)/)

const bundle = await build({
  entryPoints: [resolve(root, 'src/pages/agency/agencyLeadListLifecycle.js')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
const lifecycle = await import(moduleUrl)

assert.deepEqual(
  lifecycle.getBuyerLeadListStage('Viewing Completed'),
  {
    key: 'viewing',
    label: 'Viewing',
    description: 'Viewings are planned or completed.',
  },
)
assert.equal(lifecycle.getBuyerLeadListStage('Signed OTP Received').key, 'offer')
assert.equal(lifecycle.getBuyerLeadListStage('Deal Created').key, 'transaction')

for (const stage of ['Listing Created', 'Listing Live', 'All Documents Submitted']) {
  const presentation = lifecycle.resolveAgencyLeadListLifecycle({ leadCategory: 'seller', stage })
  assert.equal(presentation.columnId, 'listing_active', `${stage} should remain in the seller listing column`)
}
assert.equal(
  lifecycle.resolveAgencyLeadListLifecycle({ leadCategory: 'seller', stage: 'Mandate Signed' }).columnId,
  'mandate_signed',
)
assert.equal(
  lifecycle.resolveAgencyLeadListLifecycle({ leadCategory: 'seller', stage: 'Appointment Scheduled' }).columnId,
  'valuation_scheduled',
)

assert.match(
  packageJson.scripts['verify:seller-leads-performance'],
  /test:seller-leads-read-boundary-phase9[\s\S]*test:seller-leads-lifecycle-boundary-phase10/,
)

console.log('seller leads Phase 10 lifecycle boundary passed (list presentation remains lightweight and aligned)')
