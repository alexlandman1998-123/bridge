import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSellerDocumentRequirementRows,
  buildSellerDocumentSourceOfTruth,
  getSellerRequiredDocuments,
} from '../src/services/sellerDocumentRequirementsService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

const conditionalComplianceKeys = [
  'alteration_approvals',
  'approved_building_plans',
  'beetle_certificate',
  'borehole_certificate',
  'electric_fence_certificate',
  'gas_compliance_certificate',
  'occupation_certificate',
  'plumbing_certificate',
  'solar_compliance_documents',
  'water_installation_certificate',
]

const activeComplianceKeys = [
  'beetle_certificate',
  'electric_fence_certificate',
  'gas_compliance_certificate',
  'plumbing_certificate',
  'solar_compliance_documents',
  'water_installation_certificate',
]

const kingstonsOnlyDocumentKeys = [
  'valuation_document',
  'seller_pack_readiness_complete',
]

const standardBasePackKeys = [
  'signed_mandate',
  'signed_disclosure_form',
  'signed_fica_declaration',
]

const baseListing = {
  id: 'global-phase2-listing',
  sellerLeadId: 'global-phase2-lead',
  listingStatus: 'onboarding_completed',
  sellerOnboardingStatus: 'completed',
  mandateStatus: 'signed',
  organisation: { name: 'Kingstons Real Estate' },
  assignedAgentEmail: 'kingstons.training@arch9.test',
  propertyAddress: '22 Compliance Road',
  sellerOnboarding: {
    status: 'completed',
  },
}

const baseFormData = {
  sellerType: 'natural_person',
  propertyStructureType: 'full_title',
  propertyCategory: 'residential',
  propertyAddress: '22 Compliance Road',
  gasInstallation: false,
  gasGeyser: false,
  solarInstallation: false,
  electricFence: false,
  plumbingCertificateRequired: false,
  boreholeInstallation: false,
  beetleCertificateRegion: false,
  recentAlterations: false,
  municipality: 'Johannesburg',
}

function keysOf(requirements = []) {
  return requirements.map((requirement) => requirement.key || requirement.requirement_key).filter(Boolean)
}

function rowByKey(rows = [], key = '') {
  return rows.find((row) => row.key === key) || null
}

function assertNoKeys(keys = [], blockedKeys = [], label = 'keys') {
  for (const key of blockedKeys) {
    assert.equal(keys.includes(key), false, `${label} should not include ${key}`)
  }
}

function assertRowsAreProperty(rows = [], keys = []) {
  for (const key of keys) {
    const row = rowByKey(rows, key)
    assert.ok(row, `expected ${key} row`)
    assert.equal(row.category, 'property', `${key} should populate under property documents`)
  }
}

{
  const requirements = getSellerRequiredDocuments({
    ...baseListing,
    documentRequirements: conditionalComplianceKeys.map((key) => ({
      key,
      requirement_key: key,
      requirement_group: 'property_compliance',
      status: 'required',
      is_required: true,
    })),
    sellerOnboarding: {
      ...baseListing.sellerOnboarding,
      formData: baseFormData,
    },
  })
  const keys = keysOf(requirements)
  assert.deepEqual(
    standardBasePackKeys.filter((key) => keys.includes(key)).sort(),
    [...standardBasePackKeys].sort(),
    'global requirements should include the standard seller base pack',
  )
  assertNoKeys(keys, ['property_condition_disclosure', 'signed_defect_form', 'signed_fica_form'], 'global base-pack requirements')
  assertNoKeys(keys, conditionalComplianceKeys, 'global requirements without selected compliance facts')
  assertNoKeys(keys, kingstonsOnlyDocumentKeys, 'global requirements')
}

{
  const requirements = getSellerRequiredDocuments({
    ...baseListing,
    sellerOnboarding: {
      ...baseListing.sellerOnboarding,
      formData: {
        ...baseFormData,
        features: ['security', 'water'],
      },
    },
  })
  const keys = keysOf(requirements)
  assertNoKeys(
    keys,
    ['electric_fence_certificate', 'borehole_certificate', 'gas_compliance_certificate', 'solar_compliance_documents'],
    'generic amenities should not create compliance requirements',
  )
}

{
  const requirements = getSellerRequiredDocuments({
    ...baseListing,
    sellerOnboarding: {
      ...baseListing.sellerOnboarding,
      formData: {
        ...baseFormData,
        features: ['electric_fencing', 'gas_geyser', 'solar_panels'],
      },
    },
  })
  const keys = keysOf(requirements)
  assert.equal(keys.includes('electric_fence_certificate'), true)
  assert.equal(keys.includes('gas_compliance_certificate'), true)
  assert.equal(keys.includes('solar_compliance_documents'), true)
  assert.equal(keys.includes('borehole_certificate'), false)
}

{
  const formData = {
    ...baseFormData,
    gasInstallation: true,
    solarInstallation: true,
    electricFence: true,
    plumbingCertificateRequired: true,
    boreholeInstallation: true,
    beetleCertificateRegion: true,
    recentAlterations: true,
    municipality: 'City of Cape Town',
  }
  const source = buildSellerDocumentSourceOfTruth({
    listing: {
      ...baseListing,
      sellerOnboarding: {
        ...baseListing.sellerOnboarding,
        formData,
      },
    },
  })
  const keys = source.rows.map((row) => row.key)
  assert.deepEqual(
    standardBasePackKeys.filter((key) => keys.includes(key)).sort(),
    [...standardBasePackKeys].sort(),
    'global source-of-truth rows should include the standard seller base pack',
  )
  assertNoKeys(keys, ['property_condition_disclosure', 'signed_defect_form', 'signed_fica_form'], 'global source-of-truth base-pack rows')
  assert.deepEqual(
    activeComplianceKeys.filter((key) => keys.includes(key)).sort(),
    [...activeComplianceKeys].sort(),
  )
  assertRowsAreProperty(source.rows, activeComplianceKeys)
  assertNoKeys(keys, ['alteration_approvals', 'approved_building_plans', 'borehole_certificate', 'occupation_certificate'], 'active global source-of-truth rows')
  assert.equal(rowByKey(source.rows, 'gas_compliance_certificate')?.blocking, true)
  assert.equal(rowByKey(source.rows, 'solar_compliance_documents')?.blocking, true)
  assertNoKeys(keys, kingstonsOnlyDocumentKeys, 'global source-of-truth rows')
}

{
  const formData = {
    ...baseFormData,
    gasInstallation: true,
  }
  const agentUploadedGasCertificate = {
    id: 'gas-upload-1',
    requirementKey: 'gas_compliance_certificate',
    requirement_key: 'gas_compliance_certificate',
    document_type: 'gas_compliance_certificate',
    documentType: 'gas_compliance_certificate',
    category: 'property_compliance',
    document_name: 'Agent uploaded gas certificate.pdf',
    file_name: 'Agent uploaded gas certificate.pdf',
    storage_path: 'seller-documents/global-phase2-listing/gas.pdf',
    status: 'uploaded',
    uploaded_by: 'agent-user-1',
    uploaded_at: '2026-08-10T09:30:00.000Z',
  }
  const source = buildSellerDocumentSourceOfTruth({
    listing: {
      ...baseListing,
      documents: [agentUploadedGasCertificate],
      sellerOnboarding: {
        ...baseListing.sellerOnboarding,
        formData,
      },
    },
  })
  const gasRow = rowByKey(source.rows, 'gas_compliance_certificate')
  assert.ok(gasRow)
  assert.equal(gasRow.category, 'property')
  assert.equal(gasRow.status, 'uploaded')
  assert.equal(gasRow.statusBucket, 'uploaded')
  assert.equal(gasRow.complete, true)
  assert.equal(gasRow.hasUpload, true)
  assert.equal(gasRow.blocking, false)
  assert.equal(gasRow.uploadedBy, 'agent-user-1')
  assert.equal(gasRow.upload.filePath, 'seller-documents/global-phase2-listing/gas.pdf')
}

{
  const rows = buildSellerDocumentRequirementRows({
    listing: {
      ...baseListing,
      documents: [{
        id: 'electric-fence-upload-1',
        document_type: 'electric_fence_certificate',
        category: 'property_compliance',
        status: 'uploaded',
        storage_path: 'seller-documents/global-phase2-listing/electric-fence.pdf',
        uploaded_by: 'agent-user-1',
      }],
      sellerOnboarding: {
        ...baseListing.sellerOnboarding,
        formData: {
          ...baseFormData,
          electricFence: true,
        },
      },
    },
  })
  const electricFence = rowByKey(rows, 'electric_fence_certificate')
  assert.ok(electricFence)
  assert.equal(electricFence.category, 'property')
  assert.equal(electricFence.status, 'uploaded')
  assert.equal(electricFence.uploadedBy, 'agent-user-1')
}

assert.equal(
  packageJson.scripts?.['test:seller-document-conditional-logic-phase2'],
  'node scripts/seller-document-conditional-logic-phase2.test.mjs',
)

console.log('seller document conditional logic Phase 2 contract passed')
