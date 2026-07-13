import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createSellerMandateContinuityReport,
  getSellerMandateContinuityDiagnosticsSnapshot,
} from '../src/services/sellerMandateContinuityReportService.js'

const appRoot = resolve(import.meta.dirname, '..')

const reportService = readFileSync(resolve(appRoot, 'src/services/sellerMandateContinuityReportService.js'), 'utf8')
const diagnosticsPage = readFileSync(resolve(appRoot, 'src/pages/PlatformDiagnosticsPage.jsx'), 'utf8')
const sourceOfTruthContract = readFileSync(resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const signerSigningAction = readFileSync(resolve(appRoot, '../supabase/functions/signer-signing-action/index.ts'), 'utf8')
const legalDocumentWorkspacePage = readFileSync(resolve(appRoot, 'src/pages/LegalDocumentWorkspacePage.jsx'), 'utf8')
const privateListingService = readFileSync(resolve(appRoot, 'src/services/privateListingService.js'), 'utf8')
const sellerOnboardingPage = readFileSync(resolve(appRoot, 'src/pages/SellerOnboarding.jsx'), 'utf8')
const sellerOnboardingSubmittedHandler = readFileSync(resolve(appRoot, '../supabase/functions/send-email/handlers/sellerOnboardingSubmitted.ts'), 'utf8')
const sellerOnboardingEmailHandler = readFileSync(resolve(appRoot, '../supabase/functions/send-email/handlers/sellerOnboarding.ts'), 'utf8')
const sellerMandateContinuityService = readFileSync(resolve(appRoot, 'src/services/sellerMandateContinuityService.js'), 'utf8')
const agentListingDetail = readFileSync(resolve(appRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const agentLeadsPage = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function createQueryBuilder(rows = [], tableName = '') {
  return {
    select() {
      return this
    },
    or() {
      return this
    },
    order() {
      return this
    },
    limit() {
      return this
    },
    eq() {
      return this
    },
    in() {
      return this
    },
    then(resolveThen) {
      return Promise.resolve({ data: rows, error: null }).then(resolveThen)
    },
    tableName,
  }
}

await test('report service exposes a shared diagnostics snapshot for phase 9', async () => {
  const tables = {
    private_listings: [
      {
        id: 'listing-ready',
        organisation_id: 'workspace-1',
        title: 'Ready listing',
        mandate_packet_id: 'packet-ready',
        mandate_status: 'signed',
        listing_status: 'mandate_signed',
        seller_lead_id: 'lead-ready',
        seller_workspace_token: 'seller-token-ready',
      },
    ],
    private_listing_documents: [
      {
        id: 'document-ready',
        private_listing_id: 'listing-ready',
        document_type: 'signed_mandate',
        document_name: 'Signed Mandate.pdf',
        document_visibility: 'seller_visible',
        file_path: 'mandates/packet-ready.pdf',
      },
    ],
    private_listing_activity: [
      {
        id: 'activity-ready',
        private_listing_id: 'listing-ready',
        activity_type: 'mandate_signed',
        visibility: 'client_visible',
        metadata: { visibility: 'client_visible' },
      },
    ],
    leads: [
      {
        lead_id: 'lead-ready',
        mandate_packet_id: 'packet-ready',
        mandate_status: 'signed',
      },
    ],
    document_packets: [
      {
        id: 'packet-ready',
        status: 'signed',
        final_signed_file_path: 'mandates/packet-ready.pdf',
      },
    ],
    client_portal_contexts: [
      {
        seller_workspace_token: 'seller-token-ready',
        mandate_packet_id: 'packet-ready',
      },
    ],
    document_packet_events: [
      {
        id: 'portal-invite-event-ready',
        packet_id: 'packet-ready',
        event_type: 'seller_portal_invite_sent_after_mandate_signed',
        event_payload_json: {
          portalInviteStatus: 'sent',
          sentAt: '2026-07-13T10:00:00.000Z',
          deliveryId: 'delivery-ready',
        },
        created_at: '2026-07-13T10:00:00.000Z',
      },
      {
        id: 'portal-invite-event-blocked-later',
        packet_id: 'packet-ready',
        event_type: 'seller_portal_invite_blocked_before_mandate_signed',
        event_payload_json: {
          blockedAt: '2026-07-13T11:00:00.000Z',
          message: 'Seller portal password setup links are sent only after the seller mandate is signed.',
        },
        created_at: '2026-07-13T11:00:00.000Z',
      },
    ],
  }
  const client = {
    from(tableName) {
      return createQueryBuilder(tables[tableName] || [], tableName)
    },
  }

  const snapshot = await getSellerMandateContinuityDiagnosticsSnapshot({
    client,
    organisationId: 'workspace-1',
    limit: 10,
  })
  assert.equal(snapshot.summary.ready, 1)
  assert.equal(snapshot.summary.portalInviteSent, 1)
  assert.equal(snapshot.summary.portalInviteBlocked, 0)
  assert.equal(snapshot.summary.portalInviteNeedsAction, 0)
  assert.equal(snapshot.records[0].portalInviteStatus, 'sent')
  assert.equal(snapshot.records[0].portalInviteDeliveryId, 'delivery-ready')
  assert.equal(snapshot.gate.status, 'pass')
  assert.equal(snapshot.organisationId, 'workspace-1')
  assert.deepEqual(snapshot.queryWarnings, [])
})

await test('platform diagnostics imports and runs seller mandate continuity diagnostics', () => {
  assert.match(diagnosticsPage, /getSellerMandateContinuityDiagnosticsSnapshot/)
  assert.match(diagnosticsPage, /getSellerMandateContinuityReleaseGate/)
  assert.match(diagnosticsPage, /const \[mandateContinuity, setMandateContinuity\] = useState\(null\)/)
  assert.match(diagnosticsPage, /loadSellerMandateContinuityDiagnostics/)
  assert.match(diagnosticsPage, /organisationId:\s*currentWorkspace\?\.id/)
  assert.match(diagnosticsPage, /Run mandate continuity/)
})

await test('platform diagnostics renders a read-only seller mandate continuity panel', () => {
  assert.match(diagnosticsPage, />Seller mandate continuity</)
  assert.match(diagnosticsPage, /Audit signed mandate linkage across listings, leads, seller-visible documents, seller portal context, invite delivery, and activity feed\./)
  assert.match(diagnosticsPage, /mandateContinuityRows/)
  assert.match(diagnosticsPage, /mandateContinuityWarnings/)
  assert.match(diagnosticsPage, /Portal invite sent/)
  assert.match(diagnosticsPage, /Invite action/)
  assert.match(diagnosticsPage, />Portal invite</)
  assert.match(diagnosticsPage, /record\.actionItems\?\.\[0\]/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.insert\(/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.update\(/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.upsert\(/)
  assert.doesNotMatch(diagnosticsPage, /loadSellerMandateContinuityDiagnostics[\s\S]*?\.delete\(/)
})

await test('seller portal invite trigger is anchored after mandate finalization', () => {
  assert.match(signerSigningAction, /SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_EVENT = "seller_portal_invite_ready_after_mandate_signed"/)
  assert.match(signerSigningAction, /if \(lower\(packet\.packet_type\) !== "mandate"\) return/)
  assert.match(
    signerSigningAction,
    /nextPacketStatus === "completed"[\s\S]*final_signed_generation_triggered[\s\S]*appendSellerPortalInviteAfterMandateSignedTrigger[\s\S]*sendSellerPortalInviteAfterMandateSigned[\s\S]*sendFinalSignedMandateEmails/,
  )
  assert.match(signerSigningAction, /SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SENT_EVENT = "seller_portal_invite_sent_after_mandate_signed"/)
  assert.match(signerSigningAction, /sellerPortalMandateInviteAlreadySent/)
  assert.match(signerSigningAction, /type === "seller_portal_link"/)
  assert.match(legalDocumentWorkspacePage, /appendDocumentPacketEvent/)
  assert.match(legalDocumentWorkspacePage, /eventType: SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_EVENT/)
  assert.match(legalDocumentWorkspacePage, /readyForSellerPortalPasswordInvite: true/)
  assert.match(legalDocumentWorkspacePage, /sendSellerPortalInviteAfterMandateSigned/)
  assert.match(privateListingService, /export async function sendSellerPortalInviteAfterMandateSigned/)
  assert.match(privateListingService, /SELLER_PORTAL_INVITE_AFTER_MANDATE_SIGNED_SENT_EVENT = 'seller_portal_invite_sent_after_mandate_signed'/)
  assert.match(privateListingService, /hasSellerPortalMandateInviteBeenSent/)
  assert.match(privateListingService, /notifySellerPortalDocumentsReady/)
})

await test('seller portal invite phase 3 diagnostics and backfill are wired', () => {
  assert.match(reportService, /document_packet_events/)
  assert.match(reportService, /portalInviteStatus/)
  assert.match(reportService, /portalInviteNeedsAction/)
  assert.match(reportService, /Retry the seller portal password setup invite/)
  assert.match(privateListingService, /export async function backfillSellerPortalInvitesAfterSignedMandates/)
  assert.match(privateListingService, /dryRun = true/)
  assert.match(privateListingService, /sendSellerPortalInviteAfterMandateSigned\(\{[\s\S]*source: 'seller_portal_mandate_invite_backfill'/)
})

await test('seller portal invite phase 4 diagnostics backfill controls are gated', () => {
  assert.match(diagnosticsPage, /backfillSellerPortalInvitesAfterSignedMandates/)
  assert.match(diagnosticsPage, /const \[mandateInviteBackfill, setMandateInviteBackfill\] = useState\(null\)/)
  assert.match(diagnosticsPage, /runSellerPortalInviteBackfillDryRun/)
  assert.match(diagnosticsPage, /applySellerPortalInviteBackfill/)
  assert.match(diagnosticsPage, /dryRun:\s*true/)
  assert.match(diagnosticsPage, /dryRun:\s*false/)
  assert.match(diagnosticsPage, /window\.confirm\(`Send \$\{mandateInviteBackfillPlannedCount\}/)
  assert.match(diagnosticsPage, /!mandateInviteBackfillPlannedCount/)
  assert.match(diagnosticsPage, /Dry-run invite backfill/)
  assert.match(diagnosticsPage, /Apply invite backfill/)
  assert.match(diagnosticsPage, /SellerPortalInviteBackfillResult/)
  assert.match(sourceOfTruthContract, /Phase 4 exposes this backfill/)
  assert.match(sourceOfTruthContract, /confirmation before any live seller\s+portal password setup emails are sent/)
})

await test('seller portal invite phase 5 suppresses legacy early send paths', () => {
  assert.match(privateListingService, /export function isSellerPortalInviteReadyAfterSignedMandate/)
  assert.match(privateListingService, /reason:\s*'mandate_not_signed'/)
  assert.doesNotMatch(privateListingService, /seller portal email skipped after onboarding submit/)
  assert.doesNotMatch(privateListingService, /seller portal email skipped after onboarding fallback submit/)
  assert.match(sellerOnboardingPage, /sellerPortalInvitePolicy:\s*'after_mandate_signed'/)
  assert.match(sellerOnboardingPage, /deferSellerPortalLinkUntilMandateSigned:\s*true/)
  assert.doesNotMatch(sellerOnboardingPage, /sellerPortalLink,\s*$/m)
  assert.match(sellerOnboardingSubmittedHandler, /seller_portal_link_deferred_until_mandate_signed/)
  assert.match(sellerOnboardingEmailHandler, /verifySellerPortalInviteAfterSignedMandate/)
  assert.match(sellerOnboardingEmailHandler, /seller_portal_invite_requires_signed_mandate/)
  assert.match(agentListingDetail, /Sign the seller mandate before resending the seller portal password setup link/)
  assert.match(agentLeadsPage, /Sign the seller mandate before resending the seller portal password setup link/)
  assert.match(sourceOfTruthContract, /Phase 5 suppresses legacy early seller portal invite paths/)
})

await test('seller portal invite phase 6 accepts linked signed mandate packet evidence', () => {
  assert.match(sellerOnboardingEmailHandler, /SELLER_PORTAL_INVITE_SIGNED_MANDATE_PACKET_STATUS_KEYS/)
  assert.match(sellerOnboardingEmailHandler, /"completed"/)
  assert.match(sellerOnboardingEmailHandler, /function packetHasSignedMandateSignal/)
  assert.match(sellerOnboardingEmailHandler, /function listingHasSignedMandateSignal/)
  assert.match(sellerOnboardingEmailHandler, /async function listingLinkedPacketHasSignedMandateSignal/)
  assert.match(sellerOnboardingEmailHandler, /\.from\("document_packets"\)[\s\S]*\.select\("id, status"\)[\s\S]*\.eq\("id", packetId\)/)
  assert.match(sellerOnboardingEmailHandler, /\.from\("document_packet_versions"\)[\s\S]*final_signed_file_path[\s\S]*final_signed_file_url[\s\S]*final_signed_document_id[\s\S]*finalised_at[\s\S]*\.eq\("packet_id", packetId\)/)
  assert.match(sellerOnboardingEmailHandler, /\.select\("id, organisation_id, mandate_status, listing_status, status, mandate_packet_id"\)/)
  assert.match(sellerOnboardingEmailHandler, /listingHasSignedMandateSignal\(listing\)[\s\S]*listingLinkedPacketHasSignedMandateSignal\(supabase, listing\)/)
  assert.match(sellerOnboardingEmailHandler, /seller_portal_invite_requires_signed_mandate/)
  assert.match(sourceOfTruthContract, /Phase 6 accepts linked signed mandate packet evidence/)
})

await test('seller portal invite phase 7 records blocked guard events for diagnostics', () => {
  assert.match(sellerOnboardingEmailHandler, /SELLER_PORTAL_INVITE_BLOCKED_BEFORE_MANDATE_SIGNED_EVENT =[\s\S]*"seller_portal_invite_blocked_before_mandate_signed"/)
  assert.match(sellerOnboardingEmailHandler, /async function appendSellerPortalInviteGuardBlockedEvent/)
  assert.match(sellerOnboardingEmailHandler, /\.from\("document_packet_events"\)\.insert/)
  assert.match(sellerOnboardingEmailHandler, /\.select\("id, organisation_id, mandate_status, listing_status, status, mandate_packet_id"\)/)
  assert.match(sellerOnboardingEmailHandler, /await appendSellerPortalInviteGuardBlockedEvent\(supabase/)
  assert.match(sellerMandateContinuityService, /seller_portal_invite_blocked_before_mandate_signed/)
  assert.match(sellerMandateContinuityService, /status === 'blocked'/)
  assert.match(reportService, /portalInviteBlocked/)
  assert.match(diagnosticsPage, /Invite blocked/)
  assert.match(sourceOfTruthContract, /Phase 7 records guarded portal invite blocks as packet events/)
})

await test('seller portal invite blocked status remains actionable until a sent event exists', () => {
  const report = createSellerMandateContinuityReport({
    records: [
      {
        listing: {
          id: 'listing-blocked',
          title: 'Blocked listing',
          mandatePacketId: 'packet-blocked',
          mandateStatus: 'signed',
          listingStatus: 'mandate_signed',
          sellerWorkspaceToken: 'seller-token-blocked',
        },
        lead: {
          id: 'lead-blocked',
          mandatePacketId: 'packet-blocked',
          mandateStatus: 'signed',
        },
        documents: [
          {
            id: 'document-blocked',
            document_type: 'signed_mandate',
            document_name: 'Signed Mandate.pdf',
            document_visibility: 'seller_visible',
            file_path: 'mandates/packet-blocked.pdf',
          },
        ],
        activityEvents: [
          {
            id: 'activity-blocked',
            activity_type: 'mandate_signed',
            visibility: 'client_visible',
            metadata: { visibility: 'client_visible' },
          },
        ],
        mandatePacket: {
          id: 'packet-blocked',
          status: 'completed',
          finalSignedFilePath: 'mandates/packet-blocked.pdf',
        },
        packetEvents: [
          {
            id: 'portal-invite-event-blocked',
            packet_id: 'packet-blocked',
            event_type: 'seller_portal_invite_blocked_before_mandate_signed',
            event_payload_json: {
              blockedAt: '2026-07-13T11:00:00.000Z',
              message: 'Seller portal password setup links are sent only after the seller mandate is signed.',
            },
            created_at: '2026-07-13T11:00:00.000Z',
          },
        ],
        portalContext: {
          mandatePacketId: 'packet-blocked',
        },
        sellerWorkspaceToken: 'seller-token-blocked',
      },
    ],
  })
  assert.equal(report.summary.portalInviteBlocked, 1)
  assert.equal(report.summary.portalInviteNeedsAction, 1)
  assert.equal(report.records[0].portalInviteStatus, 'blocked')
  assert.equal(report.records[0].portalInviteBlockedAt, '2026-07-13T11:00:00.000Z')
  assert.match(report.records[0].portalInviteDetail, /only after the seller mandate is signed/)
})

await test('seller portal invite phase 8 locks live backfill to the dry-run plan', () => {
  assert.match(privateListingService, /plannedCandidates = null/)
  assert.match(privateListingService, /plannedCandidateKeys/)
  assert.match(privateListingService, /planLocked = !dryRun && Array\.isArray\(plannedCandidates\)/)
  assert.match(privateListingService, /eligibleCandidates\.filter\(\(record\) => plannedCandidateKeys\.has\(getCandidateKey\(record\)\)\)/)
  assert.match(privateListingService, /not_in_current_signed_mandate_snapshot/)
  assert.match(privateListingService, /plannedCandidateCount: plannedCandidateKeys\.size/)
  assert.match(diagnosticsPage, /const mandateInviteBackfillPlannedCandidates = useMemo/)
  assert.match(diagnosticsPage, /plannedCandidates:\s*mandateInviteBackfillPlannedCandidates/)
  assert.match(diagnosticsPage, /Applied from dry-run plan/)
  assert.match(sourceOfTruthContract, /Phase 8 locks live invite backfill to the dry-run plan/)
})

await test('phase 9 diagnostics console visibility is documented', () => {
  assert.match(sourceOfTruthContract, /## Diagnostics Console Visibility/)
  assert.match(sourceOfTruthContract, /getSellerMandateContinuityDiagnosticsSnapshot\(\)/)
  assert.match(sourceOfTruthContract, /does not repair records, resend documents, mutate activity, or\s+publish listings/)
})

await test('package exposes the phase 9 mandate diagnostics guard', () => {
  assert.equal(
    packageJson.scripts['test:seller-mandate-phase9'],
    'node scripts/seller-mandate-phase9.test.mjs',
  )
})

await test('shared report service remains read-only', () => {
  assert.match(reportService, /fetchSellerMandateContinuityRows/)
  assert.match(reportService, /getSellerMandateContinuityDiagnosticsSnapshot/)
  assert.doesNotMatch(reportService, /\.insert\(/)
  assert.doesNotMatch(reportService, /\.update\(/)
  assert.doesNotMatch(reportService, /\.upsert\(/)
  assert.doesNotMatch(reportService, /\.delete\(/)
})

console.log('seller mandate phase 9 tests passed')
