import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const migrationSource = await read('../../supabase/migrations/202606080005_commercial_external_portals.sql')
for (const marker of [
  'commercial_portal_contacts',
  'commercial_portal_access',
  'commercial_portal_messages',
  'commercial_portal_notifications',
  'x-bridge-commercial-portal-token',
  'commercial_documents_portal_insert',
  'commercial_document_requests_portal_update',
  'bridge_commercial_user_scope',
  "status in ('active', 'revoked', 'expired', 'disabled')",
]) {
  assert.match(migrationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Phase 7 migration should include ${marker}`)
}

const portalApiSource = await read('../src/modules/commercial/services/commercialPortalApi.js')
for (const marker of [
  'COMMERCIAL_PORTAL_ROLES',
  'getCommercialPortalWorkspaceData',
  'buildCommercialPortalWorkspace',
  'createCommercialPortalInvitation',
  'revokeCommercialPortalAccess',
  'uploadCommercialPortalDocument',
  'sendCommercialPortalMessage',
  'buildClientSafeTimeline',
  'buildRenewalVisibility',
  'x-bridge-commercial-portal-token',
]) {
  assert.match(portalApiSource, new RegExp(marker), `commercial portal API should include ${marker}`)
}

const portalPageSource = await read('../src/modules/commercial/pages/CommercialExternalPortalPage.jsx')
for (const marker of [
  'CommercialExternalPortalPage',
  'Secure Commercial Portal',
  'Document Requests',
  'Upload Document',
  'Timeline',
  'Messages',
  'Lease Visibility',
  'Ask a Question',
]) {
  assert.match(portalPageSource, new RegExp(marker), `commercial portal page should include ${marker}`)
}
for (const forbidden of [
  'commission',
  'internal notes',
  'broker management',
  'management dashboards',
]) {
  assert.doesNotMatch(portalPageSource.toLowerCase(), new RegExp(forbidden), `public portal should not expose ${forbidden}`)
}

const controlsSource = await read('../src/modules/commercial/components/CommercialPortalControlsPanel.jsx')
for (const marker of [
  'CommercialPortalControlsPanel',
  'Create Portal Link',
  'Revoke',
  'copyLink',
  'createCommercialPortalInvitation',
  'revokeCommercialPortalAccess',
  'External users cannot see commissions',
]) {
  assert.match(controlsSource, new RegExp(marker), `broker portal controls should include ${marker}`)
}

const workspaceSource = await read('../src/modules/commercial/pages/CommercialTransactionWorkspacePage.jsx')
for (const marker of [
  'Portal Access',
  'CommercialPortalControlsPanel',
  'LockKeyhole',
]) {
  assert.match(workspaceSource, new RegExp(marker), `transaction workspace should expose ${marker}`)
}

const appSource = await read('../src/App.jsx')
for (const marker of [
  'CommercialExternalPortalPage',
  '/commercial/portal/:token',
  'commercial-portal-route',
]) {
  assert.match(appSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `App routes should include ${marker}`)
}

console.log('commercial Phase 7 external portal tests passed')
