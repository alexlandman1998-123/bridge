import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

import { buildSellerDocumentRequestPlan } from '../src/services/sellerDocumentRequestOrchestrationService.js'

const bundleDir = await mkdtemp(path.join(tmpdir(), 'listing-seller-profile-phase6-'))
const entryPath = path.join(bundleDir, 'entry.mjs')
const bundlePath = path.join(bundleDir, 'bundle.mjs')
const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')

await writeFile(
  entryPath,
  `export { buildDocumentCenter, resolveSellerPortalRequiredDocumentPack } from ${JSON.stringify(servicePath)}\n`,
)

await build({
  entryPoints: [entryPath],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  define: {
    'import.meta.env': '{}',
  },
  logLevel: 'silent',
})

const { buildDocumentCenter, resolveSellerPortalRequiredDocumentPack } = await import(pathToFileURL(bundlePath).href)

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const portalData = {
  listing: {
    id: 'listing-trust-portal',
    propertyAddress: '20 Trust Avenue',
    sellerOnboarding: {
      status: 'completed',
      formData: {
        sellerType: 'trust',
        ownershipType: 'trust',
        ownerStructureType: 'trust',
        trustName: 'Family Property Trust',
        propertyAddress: '20 Trust Avenue',
      },
    },
    documentRequirements: [
      {
        id: 'retired-company-reg',
        requirement_key: 'company_registration',
        requirement_name: 'Company Registration Documents',
        requirement_group: 'company',
        status: 'not_applicable',
        is_required: false,
        retiredBySellerRequirementSync: true,
        generated_from: {
          archived: true,
          retirement_version: 'listing_seller_requirement_retirement_phase4_v1',
          retired_by: 'seller_requirement_sync',
        },
      },
      {
        id: 'trust-deed',
        requirement_key: 'seller_trust_deed',
        requirement_name: 'Trust Deed',
        requirement_group: 'trust',
        status: 'requested',
        is_required: true,
      },
    ],
  },
}

await test('seller portal document pack separates retired requirements from active upload requests', () => {
  const pack = resolveSellerPortalRequiredDocumentPack(portalData, 'selling')
  const requiredKeys = pack.requiredDocuments.map((item) => item.key)
  const retiredKeys = pack.retiredRequirements.map((item) => item.requirement_key || item.key)

  assert.ok(requiredKeys.includes('seller_trust_deed'), 'Trust requirements should remain active.')
  assert.equal(requiredKeys.includes('company_registration'), false, 'Retired company requirement must not be requested from the trust seller.')
  assert.ok(retiredKeys.includes('company_registration'), 'Retired requirement should remain available for audit metadata.')
})

await test('seller document center hides retired requirements from seller upload cards', () => {
  const documentCenter = buildDocumentCenter(portalData, 'selling')
  const requiredKeys = documentCenter.requiredDocuments.map((item) => item.key)
  const itemKeys = documentCenter.items.map((item) => item.sourceId)
  const retiredKeys = documentCenter.retiredRequirements.map((item) => item.requirement_key || item.key)

  assert.ok(requiredKeys.includes('seller_trust_deed'), 'Document center should include active trust requirements.')
  assert.equal(requiredKeys.includes('company_registration'), false)
  assert.equal(itemKeys.includes('company_registration'), false)
  assert.ok(retiredKeys.includes('company_registration'), 'Document center should expose retired requirements separately.')
})

await test('seller document request planner suppresses retired requirements', () => {
  const plan = buildSellerDocumentRequestPlan({
    listing: {
      id: 'listing-trust-portal',
      sellerContactEmail: 'seller@example.com',
    },
    requirements: [
      {
        id: 'retired-company-reg',
        requirement_key: 'company_registration',
        requirement_name: 'Company Registration Documents',
        document_visibility: 'seller_visible',
        status: 'not_applicable',
        is_required: false,
        generated_from: {
          archived: true,
          retired_by: 'seller_requirement_sync',
        },
      },
      {
        id: 'trust-deed',
        requirement_key: 'seller_trust_deed',
        requirement_name: 'Trust Deed',
        document_visibility: 'seller_visible',
        status: 'requested',
        is_required: true,
      },
    ],
    now: new Date('2026-08-12T08:00:00.000Z'),
  })
  const issuedKeys = plan.issued.map((request) => request.requirementKey)
  const retiredSuppression = plan.suppressed.find((item) => item.key === 'company_registration')

  assert.ok(issuedKeys.includes('seller_trust_deed'))
  assert.equal(issuedKeys.includes('company_registration'), false)
  assert.equal(retiredSuppression?.reason, 'closed_requirement')
})

console.log('listing seller profile capture phase 6 checks passed.')
