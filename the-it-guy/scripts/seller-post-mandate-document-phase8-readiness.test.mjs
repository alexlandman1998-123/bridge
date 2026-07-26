import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createSellerMandateContinuityReport,
  renderSellerMandateContinuityMarkdown,
} from '../src/services/sellerMandateContinuityReportService.js'

function signedMandateRecord(overrides = {}) {
  const listingId = overrides.listingId || 'listing-docs-ready'
  const packetId = overrides.packetId || 'packet-docs-ready'
  return {
    listing: {
      id: listingId,
      title: overrides.title || 'Signed mandate listing',
      mandatePacketId: packetId,
      mandateStatus: 'signed',
      listingStatus: 'mandate_signed',
      sellerWorkspaceToken: `${listingId}-seller-token`,
    },
    lead: {
      id: `${listingId}-lead`,
      mandatePacketId: packetId,
      mandateStatus: 'signed',
    },
    mandatePacket: {
      id: packetId,
      status: 'signed',
      finalSignedFilePath: `mandates/${packetId}.pdf`,
      finalSignedFileName: 'Signed Mandate.pdf',
    },
    documents: [
      {
        id: `${listingId}-signed-mandate`,
        documentType: 'signed_mandate',
        documentName: 'Signed Mandate.pdf',
        visibility: 'seller_visible',
        filePath: `mandates/${packetId}.pdf`,
      },
    ],
    activityEvents: [
      {
        id: `${listingId}-activity-mandate`,
        eventType: 'mandate_signed',
        visibility: 'client_visible',
        eventData: { title: 'Signed mandate received' },
      },
      ...(overrides.activityEvents || []),
    ],
    packetEvents: overrides.packetEvents || [],
    portalContext: {
      mandatePacketId: packetId,
    },
    sellerWorkspaceToken: `${listingId}-seller-token`,
  }
}

const auditedRecord = signedMandateRecord({
  listingId: 'listing-docs-audited',
  packetId: 'packet-docs-audited',
  title: 'Audited seller document request',
  packetEvents: [
    {
      id: 'packet-event-docs-audited',
      eventType: 'seller_portal_invite_sent_after_mandate_signed',
      eventPayload: {
        portalInviteStatus: 'sent',
        sentAt: '2026-07-25T10:00:00.000Z',
        deliveryId: 'delivery-docs-audited',
        documentPackFingerprint: 'pack-fingerprint-company',
        documentPackSource: 'seller_onboarding_structure',
        outstandingDocumentKeys: ['company_resolution_to_sell', 'director_member_ids'],
        outstandingDocumentCount: 2,
        sellerStructure: { sellerType: 'company', label: 'Company seller' },
        notificationCreated: true,
        auditSummary: {
          workflowKey: 'seller_post_mandate_document_request',
          status: 'completed',
          reason: 'completed',
          documentPackFingerprint: 'pack-fingerprint-company',
          workflowRunDedupeKey: 'workflow-run-company',
          documentPackSource: 'seller_onboarding_structure',
          outstandingDocumentKeys: ['company_resolution_to_sell', 'director_member_ids'],
          outstandingDocumentCount: 2,
          sellerStructure: { sellerType: 'company', label: 'Company seller' },
          requestCounts: { issued: 2, existing: 0, suppressed: 0, applied: 2, failed: 0 },
          notificationCreated: true,
          emailDeliveryId: 'delivery-docs-audited',
        },
      },
      createdAt: '2026-07-25T10:00:00.000Z',
    },
  ],
})

const legacyInviteOnlyRecord = signedMandateRecord({
  listingId: 'listing-docs-legacy',
  packetId: 'packet-docs-legacy',
  title: 'Legacy invite without document audit',
  packetEvents: [
    {
      id: 'packet-event-legacy-invite',
      eventType: 'seller_portal_invite_sent_after_mandate_signed',
      eventPayload: {
        portalInviteStatus: 'sent',
        sentAt: '2026-07-25T11:00:00.000Z',
        deliveryId: 'delivery-legacy',
      },
      createdAt: '2026-07-25T11:00:00.000Z',
    },
  ],
})

const report = createSellerMandateContinuityReport({
  generatedAt: '2026-07-25T12:00:00.000Z',
  records: [auditedRecord, legacyInviteOnlyRecord],
})

const audited = report.records.find((record) => record.listingId === 'listing-docs-audited')
const legacy = report.records.find((record) => record.listingId === 'listing-docs-legacy')

assert.equal(report.summary.total, 2)
assert.equal(report.summary.portalInviteSent, 2)
assert.equal(report.summary.postMandateDocumentRequestSent, 1)
assert.equal(report.summary.postMandateDocumentRequestMissing, 1)
assert.equal(report.summary.postMandateDocumentRequestNeedsAction, 1)
assert.equal(report.summary.postMandateStructurePackCount, 1)
assert.equal(audited.postMandateDocumentRequestStatus, 'sent')
assert.equal(audited.postMandateDocumentPackSource, 'seller_onboarding_structure')
assert.equal(audited.postMandateOutstandingDocumentCount, 2)
assert.deepEqual(audited.postMandateOutstandingDocumentKeys, ['company_resolution_to_sell', 'director_member_ids'])
assert.equal(audited.postMandateSellerStructure.sellerType, 'company')
assert.equal(audited.postMandateDocumentDeliveryId, 'delivery-docs-audited')
assert.equal(audited.postMandateDocumentNotificationCreated, true)
assert.equal(legacy.portalInviteStatus, 'sent')
assert.equal(legacy.postMandateDocumentRequestStatus, 'missing')
assert.equal(legacy.postMandateDocumentRequestActionRequired, true)
assert.ok(legacy.actionItems.some((item) => item.includes('post-mandate seller document request')))

const markdown = renderSellerMandateContinuityMarkdown(report)
assert.match(markdown, /Post-mandate document request sent: 1/)
assert.match(markdown, /Structure-derived document packs: 1/)
assert.match(markdown, /Seller docs/)
assert.match(markdown, /sent \(2\)/)

const diagnosticsPage = await readFile(
  new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url),
  'utf8',
)
assert.match(diagnosticsPage, /Seller docs sent/)
assert.match(diagnosticsPage, /postMandateDocumentRequestSent/)
assert.match(diagnosticsPage, /Docs action/)
assert.match(diagnosticsPage, /postMandateDocumentRequestNeedsAction/)
assert.match(diagnosticsPage, />Seller docs</)
assert.match(diagnosticsPage, /postMandateDocumentPackSource === 'seller_onboarding_structure'/)

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts['test:seller-post-mandate-document-phase8'],
  'node scripts/seller-post-mandate-document-phase8-readiness.test.mjs',
)

console.log('seller post-mandate document phase 8 readiness tests passed')
