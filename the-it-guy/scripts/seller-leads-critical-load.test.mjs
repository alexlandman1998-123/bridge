import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const brandingApi = readFileSync(resolve(root, 'server/services/sellerOnboardingBrandingApi.js'), 'utf8')

const primaryLoad = pipeline.indexOf('const crmSnapshot = await withPipelineTimeout(')
const secondaryLoad = pipeline.indexOf('const inboundLeadEmailsPromise = withPipelineTimeout(')

assert.ok(primaryLoad > -1, 'pipeline should load primary lead records')
assert.ok(secondaryLoad > primaryLoad, 'secondary enrichment must start after the primary lead query')
assert.match(pipeline, /const usersPromise = withPipelineTimeout\(\s*listOrganisationUsers\(\)/)
assert.match(pipeline, /void usersPromise\s*\.then\(/)
assert.match(pipeline, /if \(!organisationId \|\| loading \|\| typeof window === 'undefined'\) return undefined/)
assert.match(pipeline, /createSellerLeadsPerformanceBaseline\(\{ route: location\.pathname \}\)/)
assert.match(pipeline, /recordSellerLeadsPerformance\('first_data'/)
assert.match(pipeline, /recordSellerLeadsPerformance\('background_settled'/)
assert.match(pipeline, /recordSellerLeadsPerformance\('workspace_ready'/)

const canonicalSelect = "'id, organisation_id, listing_status, listing_visibility, seller_lead_id'"
const compatibilitySelect = "'id, organisation_id, status, listing_visibility, seller_lead_id, deleted_at'"
assert.ok(
  brandingApi.indexOf(canonicalSelect) < brandingApi.indexOf(compatibilitySelect),
  'canonical listing columns must be queried before legacy compatibility columns',
)

console.log('seller leads critical-load checks passed')
