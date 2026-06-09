import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  COMMERCIAL_LAUNCH_MINIMUMS,
  buildCommercialDashboardIntegrity,
  buildCommercialDataIntegrityAudit,
  buildCommercialLaunchReadinessReport,
  buildCommercialSeedSaturationStatus,
  buildCommercialWorkflowReadiness,
} from '../src/modules/commercial/services/commercialLaunchReadiness.js'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const readinessSource = await read('../src/modules/commercial/services/commercialLaunchReadiness.js')
for (const marker of [
  'COMMERCIAL_LAUNCH_MINIMUMS',
  'COMMERCIAL_LAUNCH_ROLE_MATRIX',
  'buildCommercialDataIntegrityAudit',
  'buildCommercialDashboardIntegrity',
  'buildCommercialWorkflowReadiness',
  'buildCommercialPermissionReadinessMatrix',
  'buildCommercialLaunchReadinessReport',
  'Landlord Portal',
  'Tenant Portal',
  'Portal tables must be migrated',
]) {
  assert.match(readinessSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 8 readiness service should include ${marker}`)
}

const docSource = await read('../../docs/commercial-phase-8-launch-readiness.md')
for (const marker of [
  'End-to-End Workflow Validation',
  'Data Integrity Audit',
  'Permissions Audit',
  'Dashboard Validation',
  'Reporting Validation',
  'Search Validation',
  'Activity Validation',
  'Notification Validation',
  'Seed Data Saturation',
  'Demo Environment',
  'Executive Demo Mode',
  'Performance Testing',
  'Mobile Validation',
  'Production Hardening',
  'Support Readiness',
  'Launch Checklist',
  'Final QA Sign-Off',
  'Known Issues',
  'Deferred Features',
]) {
  assert.match(docSource, new RegExp(marker), `Phase 8 launch readiness doc should include ${marker}`)
}

const seedSource = await read('../../supabase/seed/seed-commercial-launch-readiness-demo-data.sql')
for (const marker of [
  'commercial_launch_uuid',
  'commercial_launch_readiness_demo',
  'large brokerage',
  'medium brokerage',
  'independent broker',
  'corporate landlord',
  'corporate tenant',
  'industrial',
  'retail',
  'office',
  'mixed_use',
  'logistics',
  'business_park',
  'warehouse',
  'landlords 50, tenants 100, properties 50, vacancies 150, requirements 100, deals 75, HOTs 50, leases 100',
]) {
  assert.match(seedSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 8 seed should include ${marker}`)
}

assert.match(seedSource, /for v_i in 1\.\.50 loop[\s\S]*commercial_landlords/, 'launch seed should create 50+ landlords')
assert.match(seedSource, /for v_i in 1\.\.100 loop[\s\S]*commercial_tenants/, 'launch seed should create 100+ tenants')
assert.match(seedSource, /for v_i in 1\.\.50 loop[\s\S]*commercial_properties/, 'launch seed should create 50+ properties')
assert.match(seedSource, /for v_i in 1\.\.150 loop[\s\S]*commercial_vacancies/, 'launch seed should create 150+ vacancies')
assert.match(seedSource, /for v_i in 1\.\.100 loop[\s\S]*commercial_requirements/, 'launch seed should create 100+ requirements')
assert.match(seedSource, /for v_i in 1\.\.75 loop[\s\S]*commercial_deals/, 'launch seed should create 75+ deals')
assert.match(seedSource, /for v_i in 1\.\.50 loop[\s\S]*commercial_heads_of_terms/, 'launch seed should create 50+ HOTs')
assert.match(seedSource, /for v_i in 1\.\.100 loop[\s\S]*commercial_leases/, 'launch seed should create 100+ leases')
assert.match(seedSource, /for v_i in 1\.\.220 loop[\s\S]*commercial_documents/, 'launch seed should create a large document library')
assert.match(seedSource, /for v_i in 1\.\.160 loop[\s\S]*commercial_document_requests/, 'launch seed should create compliance requests')
assert.match(seedSource, /for v_i in 1\.\.320 loop[\s\S]*commercial_activity/, 'launch seed should create large activity histories')
assert.match(seedSource, /commercial_portal_access/, 'launch seed should include portal access demo records')

const saturation = buildCommercialSeedSaturationStatus(COMMERCIAL_LAUNCH_MINIMUMS)
assert.equal(saturation.every((item) => item.status === 'pass'), true, 'commercial launch minimums should satisfy themselves')

const fixture = {
  landlords: [{ id: 'landlord-1' }],
  tenants: [{ id: 'tenant-1' }],
  properties: [{ id: 'property-1', landlord_id: 'landlord-1', gla_m2: 1000, available_space_m2: 100 }],
  vacancies: [{ id: 'vacancy-1', property_id: 'property-1', landlord_id: 'landlord-1', available_area_m2: 100, status: 'available' }],
  requirements: [{ id: 'requirement-1', tenant_id: 'tenant-1', stage: 'matching' }],
  deals: [{
    id: 'deal-1',
    requirement_id: 'requirement-1',
    tenant_id: 'tenant-1',
    landlord_id: 'landlord-1',
    property_id: 'property-1',
    vacancy_id: 'vacancy-1',
    deal_value: 120000,
  }],
  headsOfTerms: [{
    id: 'hot-1',
    deal_id: 'deal-1',
    tenant_id: 'tenant-1',
    landlord_id: 'landlord-1',
    property_id: 'property-1',
    vacancy_id: 'vacancy-1',
    status: 'signed',
  }],
  leases: [{
    id: 'lease-1',
    deal_id: 'deal-1',
    heads_of_terms_id: 'hot-1',
    tenant_id: 'tenant-1',
    landlord_id: 'landlord-1',
    property_id: 'property-1',
    vacancy_id: 'vacancy-1',
    status: 'active',
    lease_end_date: '2027-06-30',
    monthly_rental: 10000,
    lease_term_months: 36,
  }],
  documents: [{ id: 'document-1', entity_type: 'commercial_lease', entity_id: 'lease-1', status: 'approved' }],
  documentRequests: [{ id: 'request-1', entity_type: 'commercial_lease', entity_id: 'lease-1', status: 'approved' }],
  activity: [{ id: 'activity-1', entity_type: 'commercial_deal', entity_id: 'deal-1' }],
  portalAccess: [{ id: 'portal-access-1' }],
  portalMessages: [{ id: 'portal-message-1' }],
}

assert.equal(buildCommercialDataIntegrityAudit(fixture).status, 'pass', 'coherent fixture should pass integrity audit')
assert.equal(buildCommercialDashboardIntegrity(fixture).status, 'pass', 'coherent fixture should pass dashboard metric audit')
assert.equal(buildCommercialWorkflowReadiness(fixture).status, 'pass', 'coherent fixture should pass workflow readiness')
assert.equal(buildCommercialLaunchReadinessReport({
  ...fixture,
  landlords: Array.from({ length: 50 }, (_, index) => ({ id: `landlord-${index + 1}` })),
  tenants: Array.from({ length: 100 }, (_, index) => ({ id: `tenant-${index + 1}` })),
  properties: Array.from({ length: 50 }, (_, index) => ({ id: `property-${index + 1}`, landlord_id: `landlord-${(index % 50) + 1}`, gla_m2: 1000, available_space_m2: 100 })),
  vacancies: Array.from({ length: 150 }, (_, index) => ({ id: `vacancy-${index + 1}`, property_id: `property-${(index % 50) + 1}`, landlord_id: `landlord-${(index % 50) + 1}`, available_area_m2: 100 })),
  requirements: Array.from({ length: 100 }, (_, index) => ({ id: `requirement-${index + 1}`, tenant_id: `tenant-${(index % 100) + 1}` })),
  deals: Array.from({ length: 75 }, (_, index) => ({
    id: `deal-${index + 1}`,
    requirement_id: `requirement-${(index % 100) + 1}`,
    tenant_id: `tenant-${(index % 100) + 1}`,
    property_id: `property-${(index % 50) + 1}`,
    vacancy_id: `vacancy-${(index % 150) + 1}`,
    deal_value: 100000,
  })),
  headsOfTerms: Array.from({ length: 50 }, (_, index) => ({
    id: `hot-${index + 1}`,
    deal_id: `deal-${(index % 75) + 1}`,
    tenant_id: `tenant-${(index % 100) + 1}`,
    property_id: `property-${(index % 50) + 1}`,
    vacancy_id: `vacancy-${(index % 150) + 1}`,
    status: index === 0 ? 'signed' : 'draft',
  })),
  leases: Array.from({ length: 100 }, (_, index) => ({
    id: `lease-${index + 1}`,
    deal_id: `deal-${(index % 75) + 1}`,
    heads_of_terms_id: index < 50 ? `hot-${index + 1}` : '',
    tenant_id: `tenant-${(index % 100) + 1}`,
    landlord_id: `landlord-${(index % 50) + 1}`,
    property_id: `property-${(index % 50) + 1}`,
    vacancy_id: `vacancy-${(index % 150) + 1}`,
    status: index === 0 ? 'active' : 'draft',
    lease_end_date: '2027-06-30',
    monthly_rental: 10000,
    lease_term_months: 36,
  })),
}).status, 'ready', 'saturated coherent fixture should be launch ready')

console.log('commercial Phase 8 launch readiness tests passed')
