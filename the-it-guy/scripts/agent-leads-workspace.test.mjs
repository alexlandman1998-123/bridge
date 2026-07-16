import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const leads = [
  {
    leadId: 'lead-contact-only',
    contactId: 'contact-one',
    leadSource: '',
    stage: 'New Lead',
    status: 'New Lead',
    assignedAgentName: 'Alex Agent',
    createdAt: '2026-05-01T08:00:00.000Z',
  },
  {
    leadId: 'lead-viewing-offer',
    contactId: 'contact-two',
    leadSource: 'Property24',
    stage: 'Offer Submitted',
    status: 'Offer Submitted',
    listingId: 'listing-one',
    createdAt: '2026-05-02T08:00:00.000Z',
  },
  {
    leadId: 'lead-converted',
    contactId: 'contact-three',
    leadSource: 'Referral',
    stage: 'Converted to Transaction',
    status: 'Converted to Transaction',
    convertedTransactionId: 'tx-one',
    createdAt: '2026-05-03T08:00:00.000Z',
  },
  {
    leadId: 'seller-listing-link',
    contactId: 'contact-four',
    leadSource: 'Canvassing',
    leadCategory: 'seller',
    stage: 'Listing Created',
    status: 'Listing Created',
    listingId: 'listing-two',
    createdAt: '2026-05-04T08:00:00.000Z',
  },
]

const contacts = [
  { contactId: 'contact-one', firstName: 'Missing', lastName: 'Details', phone: '', email: '' },
  { contactId: 'contact-two', firstName: 'Buyer', lastName: 'Viewing', phone: '+27820000000', email: 'buyer@example.test' },
  { contactId: 'contact-three', firstName: 'Converted', lastName: 'Client', phone: '+27821111111', email: 'converted@example.test' },
  { contactId: 'contact-four', firstName: 'Seller', lastName: 'Linked', phone: '+27822222222', email: 'seller@example.test' },
]

const leadActivities = [
  {
    activityId: 'activity-one',
    leadId: 'lead-viewing-offer',
    activityType: 'WhatsApp',
    activityNote: 'Buyer asked for offer link.',
    activityDate: '2026-05-04T10:00:00.000Z',
  },
]

const tasks = [
  { taskId: 'task-one', leadId: 'lead-contact-only', title: 'Call missing details lead', status: 'Pending', dueDate: '2026-05-05' },
  { taskId: 'task-two', leadId: 'lead-viewing-offer', title: 'Send OTP pack', status: 'Completed', dueDate: '2026-05-06' },
]

const appointments = [
  { appointmentId: 'appt-one', leadId: 'lead-viewing-offer', contactId: 'contact-two', listingId: 'listing-one', title: 'Viewing', status: 'confirmed' },
  { appointmentId: 'appt-two', contactId: 'contact-three', title: 'Converted client check-in', status: 'completed' },
]

const offers = [
  { id: 'offer-one', buyer_lead_id: 'lead-viewing-offer', buyer_contact_id: 'contact-two', listing_id: 'listing-one', viewing_appointment_id: 'appt-one', status: 'submitted', offer_amount: 2500000 },
]

const transactions = [
  { id: 'tx-one', originating_buyer_lead_id: 'lead-converted', buyer_contact_id: 'contact-three', status: 'Finance' },
]

const listings = [
  { id: 'listing-one', originating_crm_lead_id: 'lead-viewing-offer', listing_status: 'active', suburb: 'Sandton' },
  { id: 'listing-two', listing_status: 'seller_lead', suburb: 'Claremont', assigned_agent_id: 'agent-seller-id', assigned_agent_email: 'seller.agent@example.test' },
]

const listingInterests = [
  { interest_id: 'interest-one', lead_id: 'lead-contact-only', listing_id: 'missing-listing', status: 'interested', source: 'manual' },
  { interest_id: 'interest-two', lead_id: 'lead-viewing-offer', listing_id: 'listing-one', status: 'sent', source: 'manual' },
]

const requirements = [
  {
    requirement_id: 'requirement-one',
    lead_id: 'lead-contact-only',
    intent_type: 'buy',
    property_types: ['house'],
    suburbs: ['Bartlett'],
    budget_max: 2200000,
    bedrooms_min: 3,
    status: 'active',
    is_primary: true,
  },
]

const appRoot = fileURLToPath(new URL('..', import.meta.url))

const server = await createServer({
  root: appRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildAgentLeadRows,
    filterAgentLeadRows,
    getLeadFilterOptions,
  } = await server.ssrLoadModule('/src/services/agentLeadWorkspaceService.js')

  const rows = buildAgentLeadRows({ leads, contacts, leadActivities, tasks, appointments, offers, transactions, listings, listingInterests, requirements })

  assert.equal(rows.length, 4, 'all leads should remain visible')

  const contactOnly = rows.find((row) => row.leadId === 'lead-contact-only')
  assert.equal(contactOnly.name, 'Missing Details')
  assert.equal(contactOnly.phone, '')
  assert.equal(contactOnly.email, '')
  assert.equal(contactOnly.source, 'Unknown', 'unknown source should not hide the lead')
  assert.equal(contactOnly.nextTask.title, 'Call missing details lead')
  assert.equal(contactOnly.listingCount, 1, 'missing listing details should still count the relationship')
  assert.equal(contactOnly.requirements.length, 1)
  assert.match(contactOnly.requirementSummary, /3-bed/)
  assert.match(contactOnly.requirementSummary, /Bartlett/)

  const sellerLinked = rows.find((row) => row.leadId === 'seller-listing-link')
  assert.equal(sellerLinked.assignedAgentId, 'agent-seller-id', 'seller lead should inherit owner id from its linked listing when lead ownership is sparse')
  assert.equal(sellerLinked.assignedAgentEmail, 'seller.agent@example.test', 'seller lead should inherit owner email from its linked listing when lead ownership is sparse')
  assert.equal(sellerLinked.assignedAgent, 'seller.agent@example.test', 'seller lead owner display should not fall back to unassigned when listing owner email exists')

  const viewingLead = rows.find((row) => row.leadId === 'lead-viewing-offer')
  assert.equal(viewingLead.appointmentCount, 1)
  assert.equal(viewingLead.offerCount, 1)
  assert.equal(viewingLead.listingCount, 1)
  assert.equal(viewingLead.listingInterests.length, 1)
  assert.equal(viewingLead.latestActivity.activityType, 'WhatsApp')

  const converted = rows.find((row) => row.leadId === 'lead-converted')
  assert.equal(converted.appointmentCount, 1, 'contact-linked appointments should resolve')
  assert.equal(converted.transactionCount, 1)

  const sellerLinkedByListingId = rows.find((row) => row.leadId === 'seller-listing-link')
  assert.equal(sellerLinkedByListingId.listings.length, 1, 'seller leads should keep listings linked by listing id')
  assert.equal(sellerLinkedByListingId.listings[0].id, 'listing-two')
  assert.equal(sellerLinkedByListingId.listings[0].listingId, 'listing-two')

  const options = getLeadFilterOptions(rows)
  assert.ok(options.stages.includes('Offer Submitted'))
  assert.ok(options.sources.includes('Property24'))
  assert.ok(options.sources.includes('Unknown'))

  assert.equal(filterAgentLeadRows(rows, { search: 'buyer@example.test' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { stage: 'Converted to Transaction' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { source: 'Unknown' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { agent: 'Alex Agent' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { createdFrom: '2026-05-02', createdTo: '2026-05-03' }).length, 2)

  const workspaceSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
  const privateListingServiceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
  assert.ok(workspaceSource.includes("function isArchivedLead"), 'lead list should detect archived leads as lifecycle state')
  assert.ok(workspaceSource.includes("{ key: 'archived', label: 'Archived'"), 'lead category tabs should expose an Archived view')
  assert.match(workspaceSource, /filters\.category === 'archived'\) return filtered\.filter\(isArchivedLead\)/, 'Archived tab should show archived leads only')
  assert.match(workspaceSource, /const activeRows = filtered\.filter\(\(row\) => !isArchivedLead\(row\)\)/, 'active lead tabs should hide archived leads')
  assert.match(workspaceSource, /xl:grid-cols-5/, 'lead category tabs should make room for the archived view')
  const buyerTabsSource = workspaceSource.match(/: \[\n      \{ key: 'overview'[\s\S]*?\n    \], \[isSellerLeadWorkspace\]\)/)?.[0] || ''
  const buyerTabKeys = [...buyerTabsSource.matchAll(/\{ key: '([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(buyerTabKeys, [
    'overview',
    'property_match',
    'timeline',
    'tasks',
    'appointments',
    'offers',
  ], 'buyer lead workspace should expose exactly six buyer journey tabs')
  for (const retiredTab of ['requirements', 'suggestions', 'listings', 'recommendations', 'saved_searches']) {
    assert.ok(!buyerTabKeys.includes(retiredTab), `${retiredTab} should be merged into Property Match`)
  }
  assert.ok(workspaceSource.includes('function PropertyMatchWorkflowPanel'), 'Property Match should explain the enquiry-to-suggestions workflow')
  assert.ok(workspaceSource.includes('function EnquiryPropertyPanel'), 'Property Match should surface the original enquiry property before alternatives')
  for (const sectionTitle of ['Search Brief', 'Smart Suggestions', 'Shortlist / Interested Listings']) {
    assert.ok(workspaceSource.includes(`title="${sectionTitle}"`), `Property Match should include ${sectionTitle}`)
  }
  assert.ok(workspaceSource.includes('buttonLabel="Add Enquired Listing"'), 'Property Match should support linking the listing the buyer enquired on')
  assert.ok(workspaceSource.includes('function LeadAppointmentsPanel'), 'appointments tab should expose a lead appointment creation panel')
  assert.ok(workspaceSource.includes('createAppointmentAsync(organisationId'), 'lead appointments should be created through the appointment service')
  assert.ok(workspaceSource.includes('updateAppointmentAsync(organisationId'), 'lead appointment cards should update appointment outcomes through the appointment service')
  assert.ok(workspaceSource.includes('upsertAppointmentViewedListings'), 'completed viewing outcomes should record the viewed property relationship')
  assert.ok(workspaceSource.includes('lead_workspace_viewing_outcome'), 'viewing outcome history should be tagged with the lead workspace source')
  assert.ok(workspaceSource.includes('function LeadOfferReadinessPanel'), 'offers tab should expose an offer readiness workflow')
  assert.ok(workspaceSource.includes('getLeadOfferPropertyContexts'), 'offer links should be created from ranked property/viewing context')
  assert.ok(workspaceSource.includes('createOfferPortalSession'), 'completed viewing offers should use the post-viewing offer portal')
  assert.ok(workspaceSource.includes('createCanonicalOffer'), 'offers should still support a deliberate no-viewing fallback path')
  assert.ok(workspaceSource.includes('lead_workspace_offer_link'), 'offer links should tag viewed-listing history from the lead workspace')
  assert.ok(workspaceSource.includes('Post-Viewing Offer Portal Sent'), 'offer portal sends should be logged to lead activity')
  assert.ok(workspaceSource.includes('Send Offer Link'), 'offers tab should expose a clear send offer link action')
  assert.match(workspaceSource, /sticky top-0 z-10 grid grid-cols-2[\s\S]*lg:grid-cols-7/, 'seller workspace tabs should spread across the row with optional appointments')
  assert.ok(workspaceSource.includes('function SellerAppointmentForm'), 'seller workspace should expose an optional seller appointment form')
  assert.ok(workspaceSource.includes('function SellerAppointmentsTab'), 'seller workspace should expose appointments as an add-on tab')
  assert.ok(workspaceSource.includes("const linkedWorkflow = 'seller_lead_add_on'"), 'seller appointments should stay outside the main seller journey workflow')
  assert.ok(workspaceSource.includes("const linkedWorkflowStage = 'optional_appointment'"), 'seller appointment flow should store seller appointments as optional add-ons')
  assert.ok(workspaceSource.includes("appointmentType: 'seller_consultation'"), 'seller appointment form should default to seller consultation as an optional appointment type')
  assert.ok(workspaceSource.includes('appointments stay outside the main seller journey'), 'seller appointment form should explain that appointments are optional to the seller journey')
  assert.ok(workspaceSource.includes('Schedule Appointment'), 'seller workspace should expose a clear schedule appointment action')
  const sellerActionsSource = workspaceSource.slice(
    workspaceSource.indexOf('function SellerLeadActions('),
    workspaceSource.indexOf('function SellerLeadHeader('),
  )
  assert.ok(sellerActionsSource.includes('aria-label="Seller actions"'), 'seller header should expose an accessible Actions trigger')
  assert.ok(sellerActionsSource.includes('aria-haspopup="menu"'), 'seller Actions trigger should announce its popup menu')
  assert.ok(sellerActionsSource.includes('aria-expanded={menuOpen}'), 'seller Actions trigger should expose its open state')
  assert.ok(sellerActionsSource.includes('role="menu"'), 'seller Actions popup should expose menu semantics')
  assert.ok(sellerActionsSource.includes('role="menuitem"'), 'seller Actions controls should expose menu-item semantics')
  for (const actionContract of [
    ['closeMenuAndRun(onOpenListing)', 'listing creation or opening'],
    ['closeMenuAndRun(onSendSellerOnboarding)', 'seller onboarding'],
    ['closeMenuAndRun(onGenerateMandate)', 'mandate generation or opening'],
    ['closeMenuAndRun(onOpenAppointments)', 'seller appointment scheduling'],
    ["onStatusAction?.('edit_seller')", 'seller detail editing'],
    ['closeMenuAndRun(onCopySellerOnboardingLink)', 'seller onboarding link copying'],
    ['closeMenuAndRun(onCopySellerPortalLink)', 'seller portal link copying'],
    ['closeMenuAndRun(onCopyListingLink)', 'listing link copying'],
    ['closeMenuAndRun(onMarkAsLost)', 'lost-lead handling'],
    ['closeMenuAndRun(onArchiveLead)', 'lead archiving'],
  ]) {
    assert.ok(sellerActionsSource.includes(actionContract[0]), `seller Actions menu should retain ${actionContract[1]}`)
  }
  assert.ok(workspaceSource.includes('function SellerAcquisitionActionRow'), 'seller workspace should expose journey and readiness actions outside the overflow menu')
  for (const actionId of ['open_journey', 'open_readiness']) {
    assert.ok(workspaceSource.includes(`key === '${actionId}'`), `seller acquisition actions should handle ${actionId}`)
  }
  assert.ok(workspaceSource.includes('aria-label={`Assigned agent: ${ownerName}`}'), 'seller ownership should remain visible with an accessible assigned-agent label')
  assert.ok(workspaceSource.includes("setActiveWorkspaceTab('seller')"), 'edit seller should open the seller tab')
  assert.ok(workspaceSource.includes("focusSellerWorkspaceSection('seller-onboarding-editor')"), 'edit seller should focus the onboarding editor')
  assert.ok(workspaceSource.includes('id="seller-onboarding-editor"'), 'seller tab should expose the onboarding editor anchor')
  assert.ok(workspaceSource.includes('Seller Onboarding'), 'seller tab should render the onboarding editor')
  assert.ok(workspaceSource.includes('Save overrides'), 'seller tab should expose an override save action')
  assert.ok(workspaceSource.includes('Only populated submitted fields are shown by default.'), 'seller tab should explain the submitted-details view')
  assert.ok(workspaceSource.includes('grid items-stretch gap-5 xl:grid-cols-2'), 'seller overview should use the current two-column responsive grid')
  assert.ok(workspaceSource.includes('<SellerWorkspaceCard title="Lead Summary" density="compact">'), 'seller overview lead summary should use the compact card treatment')
  assert.ok(workspaceSource.includes('<SellerDocumentsSummaryCard journey={journey} />'), 'seller overview should pair lead summary with document readiness')
  assert.ok(workspaceSource.includes('id="seller-journey"'), 'current stage shortcut should have a seller journey anchor target')
  assert.match(workspaceSource, /grid min-w-0 grid-cols-2[\s\S]*xl:grid-cols-8/, 'seller journey rail should run in a single row on wide screens')
  assert.ok(workspaceSource.includes('w-[calc(100%-3rem)]'), 'seller journey connectors should stay centered between milestones on the single-row layout')
  assert.ok(workspaceSource.includes('min-h-[2.5rem]'), 'seller journey labels should reserve even vertical space across wrapped rows')
  assert.ok(workspaceSource.includes('flex h-[560px] min-h-[380px]'), 'seller activity feed should stay bounded on desktop')
  assert.ok(workspaceSource.includes('className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable]"'), 'seller activity feed should scroll inside its card')
  assert.match(workspaceSource, /getSellerDocumentDisplayStatus\(document\)/, 'seller document summary should show upload status text')
  assert.ok(workspaceSource.includes('updatePrivateListingOnboardingFormData'), 'seller lead commission save should persist to seller onboarding form data')
  assert.ok(workspaceSource.includes('function SellerCommissionCard'), 'seller mandate tab should expose commission structure capture')
  assert.ok(workspaceSource.includes('function getSellerCommissionWorkspace'), 'seller commission fields should normalize existing listing/onboarding values')
  assert.ok(workspaceSource.includes('commissionStructure: commissionType'), 'commission save should preserve mandate percentage/fixed merge field')
  assert.ok(workspaceSource.includes('mandateCommissionPercent'), 'commission save should provide mandate commission percent aliases')
  assert.ok(workspaceSource.includes('agencyCommissionStructureId'), 'commission save should keep agency split structure metadata separate')
  assert.ok(workspaceSource.includes("setSellerActionMessage('Commission saved.')"), 'commission save should confirm the mandate-variable sync target')
  assert.ok(workspaceSource.includes("['add_commission', 'review_commission', 'open_commission']"), 'seller workflow actions should be able to open commission capture')
  assert.match(workspaceSource, /function SellerMandateTab\(\{[\s\S]*commissionDraft[\s\S]*onSaveCommission/, 'mandate tab should receive commission capture props')
  assert.ok(!workspaceSource.includes('title="Mandate Status"'), 'mandate tab should not render the old mandate status container')
  assert.ok(!workspaceSource.includes('title="Mandate History"'), 'mandate tab should not render the old mandate history container')
  assert.ok(workspaceSource.includes('function SellerTimelineSummaryCard'), 'seller activity should include a timeline summary card')
  assert.ok(workspaceSource.includes('function SellerTimelineMilestonesCard'), 'seller activity should include key milestone checklist')
  assert.ok(workspaceSource.includes('function SellerPremiumActivityFeed'), 'seller activity should render premium timeline cards')
  assert.ok(workspaceSource.includes('function SellerActivityInsightsPanel'), 'seller activity should include insights and secondary filters')
  assert.ok(workspaceSource.includes('dedupeSellerActivityEvents'), 'seller activity should group duplicate events in the frontend presentation')
  assert.match(workspaceSource, /grid min-w-0 gap-5 lg:grid-cols-12/, 'seller activity workspace should use a bounded 12-column grid')
  assert.match(workspaceSource, /lg:col-span-4 xl:col-span-3/, 'seller activity summary column should fit the current content area')
  assert.match(workspaceSource, /lg:col-span-8 xl:col-span-6/, 'seller activity main feed should fit the current content area')
  assert.match(workspaceSource, /lg:col-span-12 xl:col-span-3/, 'seller activity insights should collapse below on laptop widths')
  for (const activityFilter of ['Communication', 'Documents', 'Mandate', 'Appointments', 'System']) {
    assert.ok(workspaceSource.includes(activityFilter), `seller activity filters should include ${activityFilter}`)
  }
  assert.ok(workspaceSource.includes('Export Activity'), 'seller activity should expose a future-safe export action')
  assert.match(privateListingServiceSource, /bridge_upload_private_listing_seller_document/, 'seller portal uploads should use the seller document RPC')
  assert.match(privateListingServiceSource, /private_listing_documents/, 'seller portal uploads should persist into private listing documents')
  assert.match(privateListingServiceSource, /status: 'uploaded'/, 'seller portal uploads should mark documents uploaded')
  assert.match(privateListingServiceSource, /updatePrivateListingRequirementStatus\(matchedRequirement\.id, 'uploaded'\)/, 'seller portal uploads should mark matched requirements uploaded')
  assert.ok(workspaceSource.includes('function LeadOfferTransactionConversionPanel'), 'offers tab should expose accepted-offer transaction conversion')
  assert.ok(workspaceSource.includes('createTransactionFromAcceptedCanonicalOffer'), 'accepted offers should convert through the canonical transaction service')
  assert.ok(workspaceSource.includes('buyer_lead_offer_conversion'), 'buyer onboarding should be sent from the lead offer conversion flow')
  assert.ok(
    workspaceSource.includes('Accepted offer ready') || workspaceSource.includes('Accepted offer is ready for conversion'),
    'transaction conversion should clearly require an accepted offer before creating a transaction',
  )
  assert.ok(workspaceSource.includes('Create Transaction'), 'accepted offer conversion should expose a create transaction action')
  assert.ok(workspaceSource.includes('Open Transaction'), 'converted offers should expose the linked transaction')
  assert.ok(workspaceSource.includes('function LeadTransactionHandoffPanel'), 'offers tab should expose a post-conversion handoff checklist')
  assert.ok(workspaceSource.includes('buyer_lead_handoff'), 'post-conversion handoff should resend buyer onboarding from the linked transaction')
  assert.ok(workspaceSource.includes('Create Handoff Tasks'), 'post-conversion handoff should create operational follow-up tasks')
  assert.ok(workspaceSource.includes('Collect buyer FICA and transaction documents'), 'handoff tasks should include buyer document collection')
  assert.ok(workspaceSource.includes('Confirm buyer finance readiness'), 'handoff tasks should include finance readiness')
  assert.ok(workspaceSource.includes('Confirm conveyancer handoff'), 'handoff tasks should include conveyancer handoff')
  assert.ok(workspaceSource.includes('Transaction Handoff Prepared'), 'handoff task creation should be logged to lead activity')
  assert.ok(!workspaceSource.includes('function BuyerJourneyCommandPanel'), 'buyer workspace should not duplicate outreach progress with a second journey panel')
  assert.ok(!workspaceSource.includes('Buyer Journey Command'), 'buyer workspace should keep one clear journey/progress surface')
  assert.ok(workspaceSource.includes('const safeOffer = offer || {}'), 'offer helpers should tolerate an early-stage lead with no accepted offer')
  assert.ok(workspaceSource.includes('const safeOffers = (Array.isArray(offers) ? offers : []).filter(Boolean)'), 'offers tab should ignore sparse/null offer relationship rows')
  assert.ok(workspaceSource.includes('const safeTransactions = (Array.isArray(transactions) ? transactions : []).filter(Boolean)'), 'offers tab should ignore sparse/null transaction relationship rows')
  assert.ok(workspaceSource.includes('getLeadAppointmentPropertyOptions'), 'lead appointments should select from linked/enquiry/shortlist properties')
  assert.ok(workspaceSource.includes('Choose at least one property for this viewing request'), 'viewing appointments should require at least one property context')
  assert.ok(workspaceSource.includes('toggleListingSelection'), 'viewing appointments should support multi-property card selection')
  assert.ok(workspaceSource.includes('Send seller requests first'), 'viewing appointments should use seller-first request workflow copy')
  assert.ok(workspaceSource.includes('Choose the property viewed before marking this viewing complete'), 'completed viewing outcomes should require the viewed property')
  assert.ok(workspaceSource.includes('sendInviteEmails: sellerFirstWorkflow ? shouldNotifySellerRequests : draft.sendInviteEmails'), 'lead appointment form should avoid buyer invites during seller-first requests')
  assert.ok(workspaceSource.includes('Seller availability requested'), 'lead appointment form should support seller availability requests')
  assert.ok(workspaceSource.includes('getAppointmentIntegrityBadges'), 'appointment cards should surface calendar/link/invite integrity badges')
  assert.ok(workspaceSource.includes('buildAppointmentCreateMessage'), 'lead appointment creation should explain calendar, workflow, and invite outcomes')
  assert.ok(workspaceSource.includes('buyerName: contact.name || lead.name ||'), 'no-viewing offer links should carry buyer metadata into the canonical offer context')
  assert.ok(workspaceSource.includes('agentReviewUrl'), 'no-viewing offer links should carry the agent review URL into the canonical offer context')
  for (const appointmentAction of ['Save Feedback', 'Mark Complete', 'No-show', 'Reschedule']) {
    assert.ok(workspaceSource.includes(appointmentAction), `viewing appointments should expose ${appointmentAction}`)
  }
  assert.ok(workspaceSource.includes('function BuyerOutreachProgress'), 'buyer workspace should include outreach progress tracking')
  assert.ok(workspaceSource.includes('onMarkReachedOut={markBuyerReachedOut}'), 'outreach progress should allow first contact to be marked from the workspace')
  assert.ok(workspaceSource.includes('lead-progress-step'), 'outreach progress stages should use equal-height stage containers')
  assert.ok(workspaceSource.includes('deleteAgencyCrmLeadRecord'), 'lead header dropdown should support lead deletion')
  assert.ok(workspaceSource.includes('buyer-workspace-tab'), 'buyer tabs should use the stretched workspace tab class')
  assert.ok(!workspaceSource.includes("onMore={() => setActiveTab('timeline')}"), 'More should no longer be a direct timeline shortcut')

  const appointmentServiceSource = await readFile(new URL('../src/lib/agencyPipelineService.js', import.meta.url), 'utf8')
  assert.ok(appointmentServiceSource.includes("notificationSource.status) === 'confirmed'"), 'confirmed appointment creation should use confirmed notification path')
  assert.ok(appointmentServiceSource.includes("? 'appointment_confirmed'"), 'confirmed appointment creation should notify as confirmed')
  assert.ok(appointmentServiceSource.includes(": 'appointment_confirmation_required'"), 'requested appointment creation should ask for confirmation')

  const buyerOfferSource = await readFile(new URL('../src/pages/BuyerOfferSubmission.jsx', import.meta.url), 'utf8')
  assert.ok(buyerOfferSource.includes('conditions.buyerName || invite?.buyerLeadName'), 'buyer offer link should prefill the buyer name from offer context')
  assert.ok(buyerOfferSource.includes('conditions.buyerEmail'), 'buyer offer link should prefill the buyer email from offer context')
  assert.ok(buyerOfferSource.includes('conditions.buyerPhone'), 'buyer offer link should prefill the buyer phone from offer context')

  console.log('agent lead workspace smoke tests passed')
} finally {
  await server.close()
}
