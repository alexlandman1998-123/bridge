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
  {
    leadId: 'seller-submitted-placeholder',
    leadSource: 'Manual Entry',
    leadCategory: 'seller',
    stage: 'Seller Onboarding Submitted',
    status: 'Submitted',
    name: 'Unnamed Lead',
    listingId: 'listing-submitted',
    createdAt: '2026-05-05T08:00:00.000Z',
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
  { id: 'listing-one', originating_crm_lead_id: 'lead-viewing-offer', listing_status: 'active', title: 'Sandton Sky Villa', propertyAddress: '12 Alice Lane', suburb: 'Sandton' },
  { id: 'listing-two', listing_status: 'seller_lead', title: 'Claremont Family Home', propertyAddress: '8 Protea Road', suburb: 'Claremont', assigned_agent_id: 'agent-seller-id', assigned_agent_email: 'seller.agent@example.test' },
  {
    id: 'listing-submitted',
    seller_lead_id: 'seller-submitted-placeholder',
    listing_status: 'seller_lead',
    seller_onboarding_status: 'completed',
    seller_onboarding: {
      status: 'completed',
      form_data: {
        fullName: 'Adrian Lansberg',
        email: 'adrian@example.test',
        phone: '+27823334444',
        propertyAddress: '39 Dromedaris Avenue, Reigerpark',
        suburb: 'Reigerpark',
        city: 'Boksburg',
      },
    },
  },
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

  assert.equal(rows.length, 5, 'all leads should remain visible')

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

  const submittedSeller = rows.find((row) => row.leadId === 'seller-submitted-placeholder')
  assert.equal(submittedSeller.name, 'Adrian Lansberg', 'submitted seller onboarding should replace placeholder lead names')
  assert.equal(submittedSeller.email, 'adrian@example.test', 'submitted seller onboarding should supply seller email when contact row is sparse')
  assert.equal(submittedSeller.sellerPropertyAddress, '39 Dromedaris Avenue, Reigerpark, Boksburg', 'submitted seller onboarding should supply property address')
  assert.equal(submittedSeller.listings[0].title, '39 Dromedaris Avenue, Reigerpark', 'submitted seller onboarding should title the linked listing')

  const options = getLeadFilterOptions(rows)
  assert.ok(options.stages.includes('Offer Submitted'))
  assert.ok(options.sources.includes('Property24'))
  assert.ok(options.sources.includes('Unknown'))

  assert.equal(filterAgentLeadRows(rows, { search: 'buyer@example.test' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { search: 'Sandton Sky Villa' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { search: 'Call missing details lead' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { search: 'Reigerpark' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { search: 'Manual Entry' }).length, 1)
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
  const buyerTabKeys = [...buyerTabsSource.matchAll(/\{ key: (?:'([^']+)'|BUYER_ONBOARDING_OTP_TAB_KEY)/g)].map((match) => match[1] || 'offers')
  assert.deepEqual(buyerTabKeys, [
    'overview',
    'offers',
    'appointments',
    'property_match',
    'timeline',
  ], 'buyer lead workspace should expose the requested visible tab order')
  assert.ok(buyerTabsSource.includes("{ key: 'property_match', label: 'Property Match' }"), 'buyer property match tab should be labelled Property Match')
  assert.ok(buyerTabsSource.includes("{ key: BUYER_ONBOARDING_OTP_TAB_KEY, label: 'Offers' }"), 'buyer deal progression tab should be labelled Offers')
  assert.ok(buyerTabsSource.includes("{ key: 'timeline', label: 'Activity' }"), 'buyer timeline tab should be labelled Activity')
  assert.match(workspaceSource, /const visibleBuyerTabs = useMemo\(\s*\(\) => tabs\.filter\(\(tab\) => !\['requirements', 'tasks', 'documents'\]\.includes\(tab\.key\)\)/, 'buyer menu should hide internal requirements, tasks, and documents tabs')
  for (const retiredTab of ['requirements', 'tasks', 'documents', 'suggestions', 'listings', 'recommendations', 'saved_searches']) {
    assert.ok(!buyerTabKeys.includes(retiredTab), `${retiredTab} should be merged into Property Match`)
  }
  assert.ok(workspaceSource.includes('function PropertyMatchWorkflowPanel'), 'Property Match should explain the enquiry-to-suggestions workflow')
  assert.ok(workspaceSource.includes('function EnquiryPropertyPanel'), 'Property Match should surface the original enquiry property before alternatives')
  for (const sectionTitle of ['Search Brief', 'Smart Suggestions', 'Shortlist / Interested Listings']) {
    assert.ok(workspaceSource.includes(`title="${sectionTitle}"`), `Property Match should include ${sectionTitle}`)
  }
  assert.ok(workspaceSource.includes('buttonLabel="Add Enquired Listing"'), 'Property Match should support linking the listing the buyer enquired on')
  const buyerPropertyMatchPanelSource = workspaceSource.match(/function BuyerPropertyMatchPanel[\s\S]*?\nfunction AppointmentStatusBadge/)?.[0] || ''
  assert.ok(buyerPropertyMatchPanelSource.includes('liveListingMatches'), 'Property Match should hydrate recommendations from live listing matches')
  assert.ok(buyerPropertyMatchPanelSource.includes('findListingsForRequirement({ organisationId, requirementId: primaryRequirementId'), 'Property Match should load scored matches from the real listing matcher')
  assert.ok(buyerPropertyMatchPanelSource.includes('listSearchablePrivateListings({ organisationId })'), 'Property Match should fall back to current organisation listings when no saved requirement exists')
  assert.ok(workspaceSource.includes('function getBuyerLiveListingMatchMeta'), 'live listing matches should be converted into buyer collection cards')
  assert.ok(workspaceSource.includes("source: 'Live listing match'"), 'live listing recommendations should be labelled as live listing matches')
  assert.ok(workspaceSource.includes('function LeadAppointmentsPanel'), 'appointments tab should expose a lead appointment creation panel')
  const buyerAppointmentsPanelSource = workspaceSource.match(/function LeadAppointmentsPanel[\s\S]*?\nfunction SellerAppointmentForm/)?.[0] || ''
  assert.ok(buyerAppointmentsPanelSource.includes('AppointmentOverviewPanel'), 'buyer appointments tab should start with the appointment overview dashboard')
  assert.ok(buyerAppointmentsPanelSource.includes('UpcomingAppointmentsPanel'), 'buyer appointments tab should show the operational upcoming appointments table')
  assert.ok(buyerAppointmentsPanelSource.includes('getLeadAppointmentDashboardRows'), 'buyer appointments tab should derive upcoming rows from real appointment data')
  assert.ok(buyerAppointmentsPanelSource.includes('getLeadAppointmentFilterOptions'), 'buyer appointments tab should expose type filters from appointment data')
  assert.ok(buyerAppointmentsPanelSource.includes("navigate('/pipeline/calendar')"), 'buyer appointments tab should link to the existing calendar route')
  assert.ok(!buyerAppointmentsPanelSource.includes('ViewingPlannerSummary'), 'buyer appointments tab should not permanently render the old viewing workspace summary')
  assert.ok(!buyerAppointmentsPanelSource.includes('BuyerLeadRecentViewingActivity'), 'buyer appointments tab should not permanently render recent viewing activity')
  assert.ok(!buyerAppointmentsPanelSource.includes('BuyerLeadPastViewingsSection'), 'buyer appointments tab should not permanently render appointment history')
  assert.ok(!buyerAppointmentsPanelSource.includes('BuyerViewingPlansModal'), 'buyer appointments tab should not keep viewing plans as a permanent page concept')
  assert.ok(!buyerAppointmentsPanelSource.includes('QuickScheduleCard'), 'buyer appointments tab should not permanently display the quick booking form')
  assert.ok(!buyerAppointmentsPanelSource.includes('AvailabilityWorkflowCard'), 'buyer appointments tab should not keep the old availability card beside booking')
  assert.ok(workspaceSource.includes('Manage upcoming appointments and client meetings across your pipeline.'), 'appointments overview copy should match the refactored appointments brief')
  assert.ok(workspaceSource.includes('No appointments scheduled'), 'appointments overview should include the requested empty state')
  assert.ok(workspaceSource.includes('Your upcoming appointments and client meetings will appear here.'), 'appointments overview empty state should explain where meetings will appear')
  assert.ok(workspaceSource.includes('Your next scheduled appointments will appear here.'), 'upcoming appointments container should use the requested helper copy')
  assert.ok(workspaceSource.includes('All Appointments'), 'upcoming appointments should expose the requested default filter')
  for (const appointmentColumn of ['Date &amp; Time', 'Type', 'With', 'Property', 'Status', 'Actions']) {
    assert.ok(workspaceSource.includes(appointmentColumn), `appointments table should include the ${appointmentColumn} column`)
  }
  assert.ok(workspaceSource.includes('md:hidden'), 'appointments table should switch to compact appointment cards on mobile')
  assert.ok(workspaceSource.includes('title="Schedule Appointment"'), 'schedule CTA should open the existing scheduler inside a modal')
  assert.ok(buyerAppointmentsPanelSource.includes('listSearchablePrivateListings({ organisationId })'), 'buyer viewing planner should load actual organisation listings')
  assert.ok(buyerAppointmentsPanelSource.includes('buildAppointmentPropertyOptions(lead, activeListings)'), 'buyer viewing planner should merge live listings into property options')
  assert.ok(buyerAppointmentsPanelSource.includes('propertyOptions={propertyOptions}'), 'appointment detail modal should receive the live listing property options')
  const manualViewingModalSource = workspaceSource.match(/function ManualBuyerViewingCompletedModal[\s\S]*?\nfunction LeadAppointmentsPanel/)?.[0] || ''
  assert.ok(manualViewingModalSource.includes('listSearchablePrivateListings({ organisationId })'), 'manual viewing completion should load actual organisation listings')
  assert.ok(manualViewingModalSource.includes('buildAppointmentPropertyOptions(lead, activeListings)'), 'manual viewing completion should offer real listings, not just linked placeholders')
  assert.ok(workspaceSource.includes('createAppointmentAsync(organisationId'), 'lead appointments should be created through the appointment service')
  assert.ok(workspaceSource.includes('updateAppointmentAsync(organisationId'), 'lead appointment cards should update appointment outcomes through the appointment service')
  assert.ok(workspaceSource.includes('upsertAppointmentViewedListings'), 'completed viewing outcomes should record the viewed property relationship')
  assert.ok(workspaceSource.includes('lead_workspace_viewing_outcome'), 'viewing outcome history should be tagged with the lead workspace source')
  assert.ok(workspaceSource.includes("const BUYER_ONBOARDING_OTP_TAB_KEY = 'offers'"), 'buyer workspace should define Offers as the canonical deal progression tab key')
  assert.ok(workspaceSource.includes("label: 'Offers'"), 'buyer workspace should expose the Offers tab label')
  assert.ok(workspaceSource.includes('normalizeBuyerLeadWorkspaceTabKey'), 'buyer workspace should route legacy onboarding and OTP aliases into Offers')
  assert.ok(workspaceSource.includes("{ key: BUYER_ONBOARDING_OTP_TAB_KEY, label: 'Offers' }"), 'buyer workspace should expose the visible offers tab')
  assert.ok(workspaceSource.includes('function DealOfferComposerModal'), 'offers workspace should retain a manual offer capture escape hatch')
  assert.ok(workspaceSource.includes('getLeadOfferPropertyContexts'), 'manual captured offers should be created from ranked property/viewing context')
  assert.ok(workspaceSource.includes('createCanonicalOffer'), 'manual captured offers should still persist through the canonical offer service')
  assert.ok(workspaceSource.includes("source: 'manual_offer_capture'"), 'manual captured offers should be explicitly tagged as manual evidence')
  assert.ok(workspaceSource.includes('lead_workspace_manual_offer_capture'), 'manual captures should tag viewed-listing history from the lead workspace')
  assert.ok(workspaceSource.includes('Capture Manual Offer'), 'onboarding / OTP workspace should expose manual capture instead of offer-link sending')
  assert.ok(!workspaceSource.includes('function LeadOfferReadinessPanel'), 'onboarding / OTP workspace should retire the old offer readiness link panel')
  assert.ok(!workspaceSource.includes('createOfferPortalSession'), 'Agent Leads should not create post-viewing offer portal sessions')
  assert.ok(!workspaceSource.includes('Send Offer Link'), 'onboarding / OTP workspace should not expose the legacy offer-link action')
  const onboardingOtpPanelSource = workspaceSource.match(/function LeadDealProgressionPanel[\s\S]*?\nfunction LeadOfferTransactionConversionPanel/)?.[0] || ''
  assert.ok(onboardingOtpPanelSource.includes('Back to overview'), 'onboarding / OTP workspace should expose a back to overview action')
  assert.ok(onboardingOtpPanelSource.includes('Upload OTP'), 'onboarding / OTP workspace should move Upload OTP to the top action row')
  assert.ok(onboardingOtpPanelSource.includes('Resend buyer onboarding link'), 'onboarding / OTP workspace should move buyer onboarding resend to the top action row')
  assert.ok(onboardingOtpPanelSource.includes('otpAmountDraft'), 'Upload OTP should ask for the OTP amount before opening the OTP workspace')
  assert.ok(onboardingOtpPanelSource.includes('otpAmount'), 'OTP amount should be passed into the OTP workspace context')
  assert.ok(onboardingOtpPanelSource.includes('<DealPropertySection'), 'onboarding / OTP workspace should keep property context near the top')
  assert.ok(onboardingOtpPanelSource.includes('<BuyerOnboardingFieldsSection lead={lead} />'), 'buyer-submitted onboarding fields should render below property context')
  assert.ok(!onboardingOtpPanelSource.includes('<DealStatusSection'), 'onboarding / OTP workspace should not render the old status/progress container')
  assert.ok(!onboardingOtpPanelSource.includes('<DealTransactionSection'), 'onboarding / OTP workspace should not render the old OTP transaction container')
  assert.ok(workspaceSource.includes('function BuyerOnboardingFieldsSection'), 'buyer onboarding field summary should be available')
  assert.ok(workspaceSource.includes('getBuyerOnboardingFormData'), 'buyer onboarding fields should populate from submitted onboarding data')
  assert.match(workspaceSource, /<nav className="flex gap-2 overflow-x-auto" aria-label="Lead section tabs" role="tablist">/, 'lead workspace tabs should render as a scroll-safe tab row')
  assert.ok(workspaceSource.includes('function SellerAppointmentForm'), 'seller workspace should expose an optional seller appointment form')
  assert.ok(workspaceSource.includes('function SellerAppointmentsTab'), 'seller workspace should expose appointments as an add-on tab')
  assert.ok(workspaceSource.includes("const linkedWorkflow = 'seller_lead_add_on'"), 'seller appointments should stay outside the main seller journey workflow')
  assert.ok(workspaceSource.includes("const linkedWorkflowStage = 'optional_appointment'"), 'seller appointment flow should store seller appointments as optional add-ons')
  assert.ok(workspaceSource.includes("initialAppointmentType = 'seller_consultation'"), 'seller appointment form should default to seller consultation as an optional appointment type')
  assert.ok(workspaceSource.includes('appointmentType: normalizedInitialAppointmentType'), 'seller appointment form should route validated default appointment types through the existing optional appointment flow')
  assert.ok(workspaceSource.includes('appointments stay outside the main seller journey'), 'seller appointment form should explain that appointments are optional to the seller journey')
  assert.ok(workspaceSource.includes('Schedule Appointment'), 'seller workspace should expose a clear schedule appointment action')
  assert.ok(workspaceSource.includes('aria-label="Seller actions"'), 'seller header actions should expose an accessible trigger button')
  assert.ok(workspaceSource.includes('role="list" aria-label="Seller lead status shortcuts"'), 'seller status chips should be actionable shortcuts')
  for (const actionId of ['edit_seller', 'assign_agent', 'open_journey', 'open_readiness', 'open_listing', 'view_mandate']) {
    assert.ok(workspaceSource.includes(actionId), `seller status chips should link to ${actionId}`)
  }
  assert.ok(workspaceSource.includes("setActiveWorkspaceTab('seller')"), 'edit seller should open the seller tab')
  assert.ok(workspaceSource.includes("focusSellerWorkspaceSection('seller-onboarding-editor')"), 'edit seller should focus the onboarding editor')
  assert.ok(workspaceSource.includes('id="seller-onboarding-editor"'), 'seller tab should expose the onboarding editor anchor')
  assert.ok(workspaceSource.includes('Seller Onboarding'), 'seller tab should render the onboarding editor')
  assert.ok(workspaceSource.includes('Save overrides'), 'seller tab should expose an override save action')
  assert.ok(workspaceSource.includes('SELLER_PROFILE_WORKSPACE_EDIT_SECTIONS'), 'seller profile summary cards should map to targeted editable fields')
  assert.ok(workspaceSource.includes('onEdit={() => onEdit?.(section)}'), 'seller profile edit buttons should pass the clicked section')
  assert.ok(workspaceSource.includes('getSellerProfileWorkspaceEditSectionModel'), 'seller profile edit should build a section-specific editor')
  assert.ok(workspaceSource.includes('setOptimisticFormData(nextDraft)'), 'seller profile saves should hold saved values during refresh')
  assert.ok(workspaceSource.includes('buildSellerProfileLeadSyncPatch'), 'seller profile saves should prepare lead/contact sync patches')
  assert.ok(workspaceSource.includes('updateAgencyCrmLeadRecord(organisationId, leadId, leadPatch)'), 'seller profile saves should sync denormalized lead fields')
  assert.ok(workspaceSource.includes('updateAgencyCrmContactRecord(organisationId, contactId, contactPatch)'), 'seller profile saves should sync contact fields')
  assert.ok(workspaceSource.includes('Only populated submitted fields are shown by default.'), 'seller tab should explain the submitted-details view')
  assert.ok(workspaceSource.includes('xl:grid-cols-2 xl:auto-rows-[minmax(320px,auto)]'), 'seller overview should wrap into a two-column grid')
  assert.ok(workspaceSource.includes('density="compact"'), 'seller overview cards should use the denser spacing variant')
  assert.ok(workspaceSource.includes('className="h-[320px] overflow-hidden"'), 'recent activity should stay fixed-height and scroll inside its card')
  assert.ok(workspaceSource.includes('className="h-[320px]"'), 'ownership should match the recent activity card height')
  assert.ok(workspaceSource.includes('id="seller-journey"'), 'current stage shortcut should have a seller journey anchor target')
  assert.match(workspaceSource, /grid min-w-0 grid-cols-2[\s\S]*xl:grid-cols-8/, 'seller journey rail should run in a single row on wide screens')
  assert.ok(workspaceSource.includes('w-[calc(100%-3rem)]'), 'seller journey connectors should stay centered between milestones on the single-row layout')
  assert.ok(workspaceSource.includes('min-h-[2.5rem]'), 'seller journey labels should reserve even vertical space across wrapped rows')
  assert.ok(workspaceSource.includes("focusSellerWorkspaceSection('seller-ownership')"), 'assigned agent shortcut should focus the ownership action card')
  assert.match(workspaceSource, /SellerTimelineList timeline=\{timeline\} limit=\{12\} compact/, 'recent activity should render enough rows for card scrolling')
  assert.match(workspaceSource, /overflow-y-auto/, 'recent activity should scroll inside its card')
  assert.match(workspaceSource, /getSellerDocumentDisplayStatus\(document\)/, 'seller document summary should show upload status text')
  assert.ok(workspaceSource.includes('updatePrivateListingOnboardingFormData'), 'seller lead commission save should persist to seller onboarding form data')
  assert.ok(workspaceSource.includes('function SellerCommissionCard'), 'seller mandate tab should expose commission structure capture')
  assert.ok(workspaceSource.includes('function getSellerCommissionWorkspace'), 'seller commission fields should normalize existing listing/onboarding values')
  assert.ok(!workspaceSource.includes('function SellerPropertyPreviewCard'), 'property tab should not render the marketing/media preview card')
  assert.ok(!workspaceSource.includes('Property Preview'), 'property tab should leave marketing/media updates to the listings page')
  assert.ok(workspaceSource.includes('commissionStructure: commissionType'), 'commission save should preserve mandate percentage/fixed merge field')
  assert.ok(workspaceSource.includes('mandateCommissionPercent'), 'commission save should provide mandate commission percent aliases')
  assert.ok(workspaceSource.includes('agencyCommissionStructureId'), 'commission save should keep agency split structure metadata separate')
  assert.ok(workspaceSource.includes('File saved. Commission saved.'), 'commission save should confirm mandate sync target')
  assert.ok(workspaceSource.includes("['add_commission', 'review_commission', 'open_commission']"), 'seller workflow actions should be able to open commission capture')
  assert.match(workspaceSource, /function SellerMandateTab\(\{[\s\S]*commissionDraft[\s\S]*onSaveCommission/, 'mandate tab should receive commission capture props')
  assert.ok(!workspaceSource.includes('title="Mandate Status"'), 'mandate tab should not render the old mandate status container')
  assert.ok(!workspaceSource.includes('title="Mandate History"'), 'mandate tab should not render the old mandate history container')
  assert.ok(workspaceSource.includes('function SellerTimelineSummaryCard'), 'seller activity should include a timeline summary card')
  assert.ok(workspaceSource.includes('function SellerTimelineMilestonesCard'), 'seller activity should include key milestone checklist')
  assert.ok(workspaceSource.includes('function SellerPremiumActivityFeed'), 'seller activity should render premium timeline cards')
  assert.ok(workspaceSource.includes('function SellerActivityInsightsPanel'), 'seller activity should include insights and secondary filters')
  assert.ok(workspaceSource.includes('dedupeSellerActivityEvents'), 'seller activity should group duplicate events in the frontend presentation')
  assert.match(workspaceSource, /grid min-w-0 gap-4 lg:grid-cols-12/, 'seller activity workspace should use a bounded 12-column grid with tighter spacing')
  assert.match(workspaceSource, /lg:col-span-4 xl:col-span-3/, 'seller activity summary column should fit the current content area')
  assert.match(workspaceSource, /lg:col-span-8 xl:col-span-6/, 'seller activity main feed should fit the current content area')
  assert.match(workspaceSource, /lg:col-span-12 xl:col-span-3/, 'seller activity insights should collapse below on laptop widths')
  assert.ok(!workspaceSource.includes('h-[560px]'), 'seller activity feed should not use a fixed height that clips the workspace')
  assert.ok(workspaceSource.includes('lg:h-[clamp(360px,calc(100dvh-19rem),620px)]'), 'seller activity feed should size to the available viewport height')
  for (const activityFilter of ['Communication', 'Documents', 'Mandate', 'Appointments', 'System']) {
    assert.ok(workspaceSource.includes(activityFilter), `seller activity filters should include ${activityFilter}`)
  }
  assert.ok(workspaceSource.includes('Export Activity'), 'seller activity should expose a future-safe export action')
  assert.match(privateListingServiceSource, /bridge_upload_private_listing_seller_document/, 'seller portal uploads should use the seller document RPC')
  assert.match(privateListingServiceSource, /private_listing_documents/, 'seller portal uploads should persist into private listing documents')
  assert.match(privateListingServiceSource, /status: 'uploaded'/, 'seller portal uploads should mark documents uploaded')
  assert.match(privateListingServiceSource, /updatePrivateListingRequirementStatus\(matchedRequirement\.id, 'uploaded'\)/, 'seller portal uploads should mark matched requirements uploaded')
  assert.ok(workspaceSource.includes('function LeadOfferTransactionConversionPanel'), 'onboarding / OTP workspace should expose accepted-offer transaction conversion')
  assert.ok(workspaceSource.includes('createTransactionFromAcceptedCanonicalOffer'), 'accepted offers should convert through the canonical transaction service')
  assert.ok(workspaceSource.includes('buyer_lead_offer_conversion'), 'buyer onboarding should be sent from the lead offer conversion flow')
  assert.ok(
    workspaceSource.includes('Accepted offer ready') || workspaceSource.includes('Accepted offer is ready for conversion'),
    'transaction conversion should clearly require an accepted offer before creating a transaction',
  )
  assert.ok(workspaceSource.includes('Create Transaction'), 'accepted offer conversion should expose a create transaction action')
  assert.ok(workspaceSource.includes('Open Transaction'), 'converted offers should expose the linked transaction')
  assert.ok(workspaceSource.includes('function LeadTransactionHandoffPanel'), 'onboarding / OTP workspace should expose a post-conversion handoff checklist')
  assert.ok(workspaceSource.includes('buyer_lead_handoff'), 'post-conversion handoff should resend buyer onboarding from the linked transaction')
  assert.ok(workspaceSource.includes('Create Handoff Tasks'), 'post-conversion handoff should create operational follow-up tasks')
  assert.ok(workspaceSource.includes('Collect buyer FICA and transaction documents'), 'handoff tasks should include buyer document collection')
  assert.ok(workspaceSource.includes('Confirm buyer finance readiness'), 'handoff tasks should include finance readiness')
  assert.ok(workspaceSource.includes('Confirm conveyancer handoff'), 'handoff tasks should include conveyancer handoff')
  assert.ok(workspaceSource.includes('Transaction Handoff Prepared'), 'handoff task creation should be logged to lead activity')
  assert.ok(!workspaceSource.includes('function BuyerJourneyCommandPanel'), 'buyer workspace should not duplicate outreach progress with a second journey panel')
  assert.ok(!workspaceSource.includes('Buyer Journey Command'), 'buyer workspace should keep one clear journey/progress surface')
  assert.ok(workspaceSource.includes('const safeOffer = offer || {}'), 'offer helpers should tolerate an early-stage lead with no accepted offer')
  assert.ok(workspaceSource.includes('const safeOffers = (Array.isArray(offers) ? offers : []).filter(Boolean)'), 'onboarding / OTP workspace should ignore sparse/null offer relationship rows')
  assert.ok(workspaceSource.includes('const safeTransactions = (Array.isArray(transactions) ? transactions : []).filter(Boolean)'), 'onboarding / OTP workspace should ignore sparse/null transaction relationship rows')
  assert.ok(workspaceSource.includes('getLeadAppointmentPropertyOptions'), 'lead appointments should select from linked/enquiry/shortlist properties')
  assert.ok(workspaceSource.includes('Choose at least one property for this viewing request'), 'viewing appointments should require at least one property context')
  assert.ok(workspaceSource.includes('toggleListingSelection'), 'viewing appointments should support multi-property card selection')
  assert.ok(workspaceSource.includes('Send seller requests first'), 'viewing appointments should use seller-first request workflow copy')
  assert.ok(workspaceSource.includes('Choose the property viewed before marking this viewing complete'), 'completed viewing outcomes should require the viewed property')
  assert.ok(workspaceSource.includes('sendInviteEmails: sellerFirstWorkflow ? shouldNotifySellerRequests : draft.sendInviteEmails'), 'lead appointment form should avoid buyer invites during seller-first requests')
  assert.ok(workspaceSource.includes('Seller availability requested'), 'lead appointment form should support seller availability requests')
  assert.ok(workspaceSource.includes('getAppointmentIntegrityBadges'), 'appointment cards should surface calendar/link/invite integrity badges')
  assert.ok(workspaceSource.includes('buildAppointmentCreateMessage'), 'lead appointment creation should explain calendar, workflow, and invite outcomes')
  assert.ok(workspaceSource.includes('buyerName: contact.name || lead.name ||'), 'manual captured offers should carry buyer metadata into the canonical offer context')
  assert.ok(workspaceSource.includes('agentReviewUrl'), 'manual captured offers should carry the agent review URL into the canonical offer context')
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
  assert.ok(appointmentServiceSource.includes("const normalizedStatus = normalizeLowerText(notificationSource.status)"), 'confirmed appointment creation should normalize notification status before routing')
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
