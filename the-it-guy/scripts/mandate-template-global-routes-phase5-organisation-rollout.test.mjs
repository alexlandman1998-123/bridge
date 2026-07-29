import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PHASE4_B3_RELEASE_CONTRACT } from '../src/core/documents/legalTemplateApproval.js'
import {
  GLOBAL_MANDATE_ROUTE_PHASE5_ORGANISATION_ROLLOUT_VERSION,
  buildMandateGlobalRouteOrganisationRollout,
} from './mandate-template-global-routes-phase5-organisation-rollout.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION,
} from './mandate-template-global-routes-phase4-coverage-audit.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
} from './mandate-template-global-routes-phase3.mjs'
import {
  GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  listMandateGlobalRouteTemplates,
} from './mandate-template-global-routes-phase2.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-global-routes-phase5'],
  'node scripts/mandate-template-global-routes-phase5-organisation-rollout.test.mjs',
  'package.json should expose the mandate global routes Phase 5 rollout test.',
)
assert.equal(
  packageJson.scripts?.['rollout:mandate-template-global-routes-phase5'],
  'node --env-file=.env --env-file=.env.staging.local scripts/mandate-template-global-routes-phase5-organisation-rollout.mjs',
  'package.json should expose the read-only mandate global routes Phase 5 rollout audit.',
)

const routes = listMandateGlobalRouteTemplates()
assert.equal(routes.length, 8)

function approvedMetadata(routeKey, digestSuffix) {
  return {
    legal_review_status: 'approved',
    legal_approved_at: '2026-07-29T10:00:00.000Z',
    legal_approval_reference: `COUNSEL-${routeKey}`,
    legal_approved_by: 'thread:user-confirmed-counsel-approval',
    legal_approval_content_digest: `sha256:${digestSuffix.repeat(64).slice(0, 64)}`,
    legal_counsel_review_evidence_digest: `sha256:${digestSuffix.repeat(64).slice(0, 64)}`,
    legal_b1_manifest_digest: `sha256:${digestSuffix.repeat(64).slice(0, 64)}`,
    legal_b3_applied_at: '2026-07-29T10:00:01.000Z',
    legal_b3_applied_by: 'codex',
    legal_b3_application_reference: 'phase5-test',
    legal_phase4_b3_release_contract: PHASE4_B3_RELEASE_CONTRACT,
  }
}

const globalRouteTemplates = routes.map((route, index) => ({
  id: `global-${route.key}`,
  organisation_id: null,
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: `mandate_${route.key}_v1`,
  template_label: `Seller Mandate - ${route.label}`,
  status: 'published',
  is_active: true,
  is_default: false,
  updated_at: '2026-07-29T10:00:00.000Z',
  metadata_json: {
    template_scope: 'global_route_variant',
    mandate_template_variant: route.key,
    seller_clause_profile: route.sellerProfile,
    property_clause_profile: route.propertyProfile,
    ...approvedMetadata(route.key, String(index + 1)),
  },
}))

const coverageAudit = {
  auditVersion: GLOBAL_MANDATE_ROUTE_PHASE4_COVERAGE_AUDIT_VERSION,
  mutatedData: false,
  status: 'COVERED',
  phase2Version: GLOBAL_MANDATE_ROUTE_PHASE2_VERSION,
  phase3Version: GLOBAL_MANDATE_ROUTE_PHASE3_VERSION,
  runtimeReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
  summary: {
    expectedRouteCount: 8,
    coveredRouteCount: 8,
    blockedRouteCount: 0,
    provenanceMatchedCount: 8,
    versionSnapshotMatchedCount: 8,
  },
}

const genericOrgTemplate = {
  id: 'org-generic',
  organisation_id: 'org-a',
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_default_v1',
  template_label: 'Organisation Generic Mandate',
  status: 'published',
  is_active: true,
  is_default: true,
  updated_at: '2026-07-29T11:00:00.000Z',
  metadata_json: {
    template_scope: 'organisation',
  },
}

const approvedOrgOverride = {
  id: 'org-b-company-full',
  organisation_id: 'org-b',
  module_type: 'agency',
  packet_type: 'mandate',
  template_key: 'mandate_company_full_title_custom_v1',
  template_label: 'Organisation Company Full Title Mandate',
  status: 'published',
  is_active: true,
  is_default: false,
  updated_at: '2026-07-29T12:00:00.000Z',
  metadata_json: {
    template_scope: 'organisation',
    mandate_template_variant: 'company_full_title',
    seller_clause_profile: 'company',
    property_clause_profile: 'full_title',
    ...approvedMetadata('org-b-company-full', 'a'),
  },
}

const rollout = buildMandateGlobalRouteOrganisationRollout({
  coverageAudit,
  organisations: [
    { id: 'org-a', name: 'Agency A', type: 'agency', status: 'active' },
    { id: 'org-b', name: 'Agency B', type: 'agency', status: 'active' },
  ],
  globalRouteTemplates,
  organisationTemplates: [
    genericOrgTemplate,
    approvedOrgOverride,
  ],
  checkedAt: '2026-07-29T12:00:00.000Z',
})

assert.equal(rollout.rolloutVersion, GLOBAL_MANDATE_ROUTE_PHASE5_ORGANISATION_ROLLOUT_VERSION)
assert.equal(rollout.status, 'ROLLOUT_READY')
assert.equal(rollout.mutatedData, false)
assert.equal(rollout.summary.organisationCount, 2)
assert.equal(rollout.summary.readyOrganisationCount, 2)
assert.equal(rollout.summary.organisationRouteCheckCount, 16)
assert.equal(rollout.summary.readyRouteCheckCount, 16)
assert.equal(rollout.summary.globalRouteSelectionCount, 15)
assert.equal(rollout.summary.organisationOverrideSelectionCount, 1)
assert.equal(rollout.summary.genericOrgTemplateBypassCount, 8)
assert.equal(rollout.warnings.some((warning) => warning.code === 'ORG_GENERIC_MANDATE_TEMPLATE_BYPASSED'), true)
assert.equal(rollout.warnings.some((warning) => warning.code === 'ORG_APPROVED_ROUTE_OVERRIDE_SELECTED'), true)

const orgACompanyFull = rollout.organisationRows
  .find((row) => row.organisationId === 'org-a')
  .routeRows.find((row) => row.routeKey === 'company_full_title')
assert.equal(orgACompanyFull.selectedSource, 'global_route_library')
assert.equal(orgACompanyFull.selectedTemplateId, 'global-company_full_title')

const orgBCompanyFull = rollout.organisationRows
  .find((row) => row.organisationId === 'org-b')
  .routeRows.find((row) => row.routeKey === 'company_full_title')
assert.equal(orgBCompanyFull.selectedSource, 'organisation_route_override')
assert.equal(orgBCompanyFull.selectedTemplateId, 'org-b-company-full')

const unapprovedOrgOverride = {
  ...approvedOrgOverride,
  id: 'org-c-company-full',
  organisation_id: 'org-c',
  metadata_json: {
    template_scope: 'organisation',
    mandate_template_variant: 'company_full_title',
    seller_clause_profile: 'company',
    property_clause_profile: 'full_title',
  },
}
const blockedRollout = buildMandateGlobalRouteOrganisationRollout({
  coverageAudit,
  organisations: [{ id: 'org-c', name: 'Agency C', type: 'agency', status: 'active' }],
  globalRouteTemplates,
  organisationTemplates: [unapprovedOrgOverride],
})
assert.equal(blockedRollout.status, 'BLOCKED')
assert.equal(blockedRollout.blockers.some((blocker) => blocker.code === 'ORG_ROUTE_OVERRIDE_NOT_B3_APPROVED'), true)

const missingCoverageRollout = buildMandateGlobalRouteOrganisationRollout({
  coverageAudit: { status: 'BLOCKED' },
  organisations: [{ id: 'org-a', name: 'Agency A', type: 'agency', status: 'active' }],
  globalRouteTemplates,
})
assert.equal(missingCoverageRollout.status, 'BLOCKED')
assert.equal(missingCoverageRollout.blockers.some((blocker) => blocker.code === 'PHASE4_COVERAGE_NOT_COVERED'), true)

const scriptSource = await readFile(new URL('./mandate-template-global-routes-phase5-organisation-rollout.mjs', import.meta.url), 'utf8')
for (const token of [
  'mutatedData: false',
  'ORG_GENERIC_MANDATE_TEMPLATE_BYPASSED',
  'ORG_ROUTE_OVERRIDE_NOT_B3_APPROVED',
  'selectSignableMandateRouteSelection',
  'resolveSignableTemplatePolicy',
  'PHASE4_COVERAGE_NOT_COVERED',
]) {
  assert.ok(scriptSource.includes(token), `Phase 5 rollout should include ${token}.`)
}

console.log('Mandate template global routes Phase 5 organisation rollout contract passed.')
