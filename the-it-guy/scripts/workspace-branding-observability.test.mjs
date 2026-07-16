import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildWorkspaceBrandingMetric,
    getWorkspaceBrandingMetricDedupeKey,
    trackWorkspaceBrandingMetric,
  } = await server.ssrLoadModule('/src/services/observability/monitoring.js')

  const context = {
    userId: '',
    workspaceId: 'young-law',
    workspaceType: 'attorney_firm',
    membershipSource: 'attorney_firm_members',
    membershipSources: ['organisation_users', 'attorney_firm_members', 'organisation_users'],
    brandingSource: 'attorney_firm_members',
    logoPresent: true,
    severity: 'info',
    logoUrl: 'https://secret.example.test/young-law.jpg',
    firmName: 'Young Law Inc',
  }

  const metric = buildWorkspaceBrandingMetric('workspace_branding_resolved', context)
  assert.equal(metric.category, 'workspace')
  assert.equal(metric.metadata.workspaceType, 'attorney_firm')
  assert.equal(metric.metadata.membershipSource, 'attorney_firm_members')
  assert.deepEqual(metric.metadata.membershipSources, ['attorney_firm_members', 'organisation_users'])
  assert.equal(metric.metadata.membershipSourceOverlap, true)
  assert.equal(metric.metadata.brandingSource, 'attorney_firm_members')
  assert.equal(metric.metadata.logoPresent, true)
  assert.equal('logoUrl' in metric.metadata, false)
  assert.equal('firmName' in metric.metadata, false)
  assert.doesNotMatch(JSON.stringify(metric), /secret\.example|Young Law Inc/)

  const dedupeKey = getWorkspaceBrandingMetricDedupeKey(metric)
  assert.match(dedupeKey, /^workspace_branding_resolved::young-law:/)
  assert.notEqual(
    dedupeKey,
    getWorkspaceBrandingMetricDedupeKey(buildWorkspaceBrandingMetric('workspace_branding_image_failed', context)),
  )

  const first = await trackWorkspaceBrandingMetric('workspace_branding_phase5_test', context)
  const second = await trackWorkspaceBrandingMetric('workspace_branding_phase5_test', context)
  assert.equal(first.persisted, false)
  assert.equal(second.reason, 'deduplicated')

  console.log('workspace branding observability tests passed')
} finally {
  await server.close()
}
