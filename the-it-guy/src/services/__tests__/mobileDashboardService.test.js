// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ overview: vi.fn(), agentRows: vi.fn(), allRows: vi.fn(), crm: vi.fn(), appointments: vi.fn(), listings: vi.fn(), leads: vi.fn(), from: vi.fn(), rollup: vi.fn(), documents: vi.fn() }))
vi.mock('../../lib/transactionWorkspaceApi.js', () => ({ getTransactionRollup: api.rollup, fetchTransactionDocumentsWorkspace: api.documents }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: api.from } }))
vi.mock('../../domains/reporting/api.js', () => ({ fetchDashboardOverview: api.overview, fetchTransactionsByParticipantSummary: api.agentRows, fetchTransactionsListSummary: api.allRows }))
vi.mock('../../lib/agencyCrmRepository.js', () => ({ listAgencyCrmLeadContacts: api.crm }))
vi.mock('../appointmentDashboardService.js', () => ({ getAppointmentDashboardData: api.appointments }))
vi.mock('../privateListingService.js', () => ({ getAgentPrivateListings: api.listings }))
vi.mock('../developerLeadService.js', () => ({ listDeveloperLeadIntake: api.leads }))
vi.mock('../../lib/agentDemoTransactionStorage.js', () => ({ getAgentDemoTransactionRowsFromStorage: () => [] }))
import { buildResidentialActiveWork, clearMobileDashboardCache, getCachedMobileDashboardSnapshot, getMobileCalendarSnapshotAsync, getMobileDashboardSnapshot, getMobileDashboardSnapshotAsync, getMobileDeveloperTransactionSnapshotAsync } from '../mobileDashboardService.js'

const workspace = { role: 'agent', profile: { id: 'me', email: 'me@example.test' } }
const organisation = { id: 'org-one' }
beforeEach(() => {
  clearMobileDashboardCache()
  vi.clearAllMocks()
  api.agentRows.mockResolvedValue([])
  api.overview.mockResolvedValue({ rows: [], developmentSummaries: [] })
  api.allRows.mockResolvedValue([])
  api.crm.mockResolvedValue({ tasks: [], tasksAvailable: true })
  api.appointments.mockResolvedValue({ appointments: [] })
  api.listings.mockResolvedValue([])
  api.leads.mockResolvedValue([])
  api.rollup.mockResolvedValue(null)
  api.documents.mockResolvedValue(null)
})
afterEach(() => vi.restoreAllMocks())

it('loads real work for the current organisation and personal appointment scope without demo reconciliation', async () => {
  api.crm.mockResolvedValue({ tasks: [{ taskId: 'mine', assignedAgentId: 'me', title: 'Call client', dueDate: '2020-01-01' }, { taskId: 'other', assignedAgentId: 'other', dueDate: '2020-01-01' }] })
  const snapshot = await getMobileDashboardSnapshotAsync({ workspace, organisation })
  expect(api.crm).toHaveBeenCalledWith('org-one', { includeLocalFallback: false })
  expect(api.appointments).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'org-one', includeAll: false, module: 'agent', userId: 'me', userEmail: 'me@example.test' }))
  expect(snapshot.today.counts.followUps).toBe(1)
  expect(snapshot.today.action.title).toBe('Call client')
  expect(api.leads).not.toHaveBeenCalled()
})

it('loads new leads only for the selected developer organisation and retains every returned card', async () => {
  const leads = Array.from({ length: 8 }, (_, index) => ({ developerLeadId: `lead-${index}`, leadStatus: 'new' }))
  api.leads.mockResolvedValue(leads)
  const developer = { ...workspace, role: 'developer' }
  const snapshot = await getMobileDashboardSnapshotAsync({ workspace: developer, organisation })
  expect(api.leads).toHaveBeenCalledWith({ developerOrgId: 'org-one', status: 'new', throwOnUnavailable: true })
  expect(snapshot.newLeads).toEqual(leads)
  expect(snapshot.newLeadsAvailable).toBe(true)
})

it('aligns both developer owners on shared organisation priorities using the developer layout', async () => {
  api.crm.mockResolvedValue({ tasksAvailable: true, tasks: [
    { taskId: 'alex-follow-up', assignedAgentId: 'alex', title: 'Follow up with buyer', dueDate: '2020-01-01' },
    { taskId: 'closed', assignedAgentId: 'alex', status: 'Completed', dueDate: '2020-01-01' },
  ] })
  api.appointments.mockResolvedValue({ appointments: [{ id: 'team-appointment', dateTime: '2099-01-01T10:00:00Z', typeLabel: 'Site visit', status: 'confirmed', statusKey: 'confirmed' }] })
  api.overview.mockResolvedValue({ rows: [{ transaction: { id: 'transfer', next_action: 'Upload the signed OTP to the transaction documents.' } }], developmentSummaries: [] })
  const alex = await getMobileDashboardSnapshotAsync({ organisation, workspace: { role: 'developer', workspaceRole: 'owner', profile: { id: 'alex', email: 'alex@example.test' } } })
  const samWorkspace = { role: 'developer', currentMembership: { raw: { workspace_role: 'owner' } }, profile: { id: 'sam', email: 'sam@example.test' } }
  const sam = await getMobileDashboardSnapshotAsync({ organisation, workspace: samWorkspace })
  expect(sam.category).toBe('developer')
  expect(sam.today).toEqual(alex.today)
  expect(sam.today.action).toMatchObject({ id: 'task:alex-follow-up', title: 'Follow up with buyer' })
  expect(sam.today.items.followUps).toHaveLength(1)
  expect(sam.today.items.appointments).toHaveLength(1)
  expect(api.crm).toHaveBeenCalledWith('org-one', { includeLocalFallback: false })
  expect(api.appointments).toHaveBeenLastCalledWith(expect.objectContaining({ organisationId: 'org-one', module: 'developer', includeAll: true }))
  // A changed membership must not reuse the owner's wider cached attention list.
  expect(getCachedMobileDashboardSnapshot({ organisation, workspace: { ...samWorkspace, currentMembership: { raw: { workspace_role: 'member' } } } })).toBeNull()
})

it('retains personal attention scope for developer members', async () => {
  api.crm.mockResolvedValue({ tasksAvailable: true, tasks: [
    { taskId: 'mine', assignedAgentId: 'me', dueDate: '2020-01-01' },
    { taskId: 'other', assignedAgentId: 'other', dueDate: '2020-01-01' },
  ] })
  const snapshot = await getMobileDashboardSnapshotAsync({ organisation, workspace: { ...workspace, role: 'developer', workspaceRole: 'member' } })
  expect(snapshot.today.items.followUps.map((item) => item.id)).toEqual(['task:mine'])
  expect(api.appointments).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'org-one', includeAll: false, module: 'developer', userId: 'me' }))
})

it('keeps the developer portfolio available when leads fail and recovers on refresh', async () => {
  api.leads.mockRejectedValueOnce(new Error('Lead read unavailable'))
  const options = { workspace: { ...workspace, role: 'developer' }, organisation }
  const snapshot = await getMobileDashboardSnapshotAsync(options)
  expect(snapshot.newLeads).toEqual([])
  expect(snapshot.newLeadsAvailable).toBe(false)
  expect(snapshot.today.available.deals).toBe(true)
  api.leads.mockResolvedValue([{ developerLeadId: 'saved-lead', leadStatus: 'new' }])
  const refreshed = await getMobileDashboardSnapshotAsync({ ...options, force: true })
  expect(refreshed.newLeadsAvailable).toBe(true)
  expect(refreshed.newLeads).toHaveLength(1)
})

it('lets the dashboard distinguish lead access failures from an empty result while preserving existing readers', async () => {
  const { listDeveloperLeadIntake } = await vi.importActual('../developerLeadService.js')
  const error = { code: '42501', message: 'permission denied' }
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: (resolve, reject) => Promise.resolve({ data: null, error }).then(resolve, reject) }
  api.from.mockReturnValue(query)
  const options = { developerOrgId: '11111111-1111-4111-8111-111111111111', status: 'new' }
  await expect(listDeveloperLeadIntake({ ...options, throwOnUnavailable: true })).rejects.toEqual(error)
  expect(query.eq).toHaveBeenCalledWith('developer_org_id', options.developerOrgId)
  expect(query.eq).toHaveBeenCalledWith('lead_status', 'new')
  await expect(listDeveloperLeadIntake(options)).resolves.toEqual([])
})

it('keeps the full transaction list while limiting the home preview to five deals', async () => {
  api.agentRows.mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ transaction: { id: `tx-${i}`, organisation_id: 'org-one', lifecycle_state: 'active', next_action: 'Review OTP' } })))
  const snapshot = await getMobileDashboardSnapshotAsync({ workspace, organisation })
  expect(snapshot.activeWork).toHaveLength(5)
  expect(snapshot.transactions).toHaveLength(7)
  expect(snapshot.today.counts.deals).toBe(7)
  expect(snapshot.today.items.deals).toHaveLength(7)
})

it('keeps independent source failures visible while retaining loaded deal actions', async () => {
  api.crm.mockResolvedValue({ tasks: [], tasksAvailable: false })
  api.appointments.mockRejectedValue(new Error('Appointment access unavailable'))
  api.agentRows.mockResolvedValue([{ transaction: { id: 'tx', organisation_id: 'org-one', next_action: 'Review OTP' } }])
  const snapshot = await getMobileDashboardSnapshotAsync({ workspace, organisation })
  expect(snapshot.today.counts).toEqual({ appointments: null, followUps: null, deals: 1 })
  expect(snapshot.today.action.to).toBe('/mobile/transaction/tx')
})

it('uses team appointment scope for principals and marks offline fallback counts unavailable', async () => {
  await getMobileDashboardSnapshotAsync({ workspace: { ...workspace, role: 'principal' }, organisation })
  expect(api.appointments).toHaveBeenCalledWith(expect.objectContaining({ includeAll: true, module: 'default' }))
  expect(getMobileDashboardSnapshot({ workspace }).today.counts).toEqual({ appointments: null, followUps: null, deals: null })
})

it('keeps each transaction’s own property photo and exact value, with linked media as a fallback', async () => {
  api.agentRows.mockResolvedValue([
    { transaction: { id: 'own-photo', organisation_id: 'org-one', property_image_url: '/property-one.jpg', purchase_price: 4850000, suburb: 'Sea Point', city: 'Cape Town', property_type: 'apartment', transaction_reference: 'REVO-101' }, unit: { image_url: '/unit-one.jpg' }, development: { cover_image_url: '/development.jpg' } },
    { transaction: { id: 'unit-photo', organisation_id: 'org-one' }, unit: { image_url: '/unit-two.jpg' }, development: { cover_image_url: '/development.jpg' } },
    { transaction: { id: 'development-photo', organisation_id: 'org-one' }, development: { cover_image_url: '/development.jpg' } },
    { transaction: { id: 'no-photo', organisation_id: 'org-one' } },
  ])
  const { activeWork } = await getMobileDashboardSnapshotAsync({ workspace, organisation })
  expect(activeWork.find((item) => item.id === 'own-photo')).toMatchObject({ imageUrl: '/property-one.jpg', valueRaw: 4850000, location: 'Sea Point, Cape Town', propertyType: 'apartment', reference: 'REVO-101', to: '/mobile/transaction/own-photo' })
  expect(activeWork.find((item) => item.id === 'unit-photo').imageUrl).toBe('/unit-two.jpg')
  expect(activeWork.find((item) => item.id === 'development-photo').imageUrl).toBe('/development.jpg')
  expect(activeWork.find((item) => item.id === 'no-photo').imageUrl).toBe('')
})

it('keeps recorded sectional-title unit identities visible without guessing a unit from the street or legal section number', () => {
  const items = buildResidentialActiveWork([
    { transaction: { id: 'sectional', property_type: 'sectional_title', property_address_line_1: '18 Oak Avenue' }, development: { name: 'Oak Court' }, unit: { unit_number: '007' } },
    { transaction: { id: 'hydrated', property_address_line_1: '18 Oak Avenue', property_unit: { property_title_type: 'sectional_title', unitNumber: 'Unit 12' }, property_development: { name: 'Oak Court' } } },
    { transaction: { id: 'missing-unit', property_type: 'sectional_title', section_number: '42', property_address_line_1: '18 Oak Avenue' } },
    { transaction: { id: 'freehold', property_type: 'freehold', property_address_line_1: '24 Pine Street' } },
  ])
  expect(items[0]).toMatchObject({ title: 'Oak Court · Unit 007', propertyTitle: 'Oak Court', unitLabel: 'Unit 007' })
  expect(items[1]).toMatchObject({ title: 'Oak Court · Unit 12', propertyTitle: 'Oak Court', unitLabel: 'Unit 12' })
  expect(items[2]).toMatchObject({ title: '18 Oak Avenue', unitLabel: '' })
  expect(items[3]).toMatchObject({ title: '24 Pine Street', unitLabel: '' })
})

it('loads the authorised developer portfolio without confusing an organisation id with a development id or counting available units as deals', async () => {
  const development = { id: 'dev-one', name: 'Junoah', cover_image_url: '/junoah.jpg' }
  api.overview.mockResolvedValue({
    rows: [
      { development, unit: { id: 'unit-1', unit_number: '001', development_id: 'dev-one' }, transaction: { id: 'tx-1', organisation_id: 'selling-agency', current_main_stage: 'XFER', purchase_price: 0, sales_price: 2200000, next_action: 'Review transfer' } },
      { development, unit: { id: 'unit-2', unit_number: '002', development_id: 'dev-one', price: 2100000 }, transaction: null, stage: 'Available' },
      { development, unit: { id: 'unit-3', development_id: 'dev-one' }, transaction: { id: 'tx-3', registered_at: '2026-01-01', sales_price: 2000000 } },
    ],
    developmentSummaries: [{ id: 'dev-one', name: 'Junoah', totalUnits: 3, unitsRegistered: 1, coverImageUrl: '/junoah.jpg' }],
  })
  const snapshot = await getMobileDashboardSnapshotAsync({ workspace: { ...workspace, role: 'developer', workspace: { id: 'org-one' } }, organisation })
  expect(api.overview).toHaveBeenCalledWith({ organisationId: 'org-one', developmentId: null, includeSecondaryData: false })
  expect(api.agentRows).not.toHaveBeenCalled()
  expect(api.listings).not.toHaveBeenCalled()
  expect(api.appointments).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'org-one', module: 'developer' }))
  expect(snapshot.transactions).toHaveLength(1)
  expect(snapshot.transactions[0]).toMatchObject({ id: 'tx-1', title: 'Junoah · Unit 001', developmentId: 'dev-one', valueRaw: 2200000, imageUrl: '/junoah.jpg' })
  expect(snapshot.developments[0]).toMatchObject({ totalUnits: 3, availableUnits: 1, registeredUnits: 1, activeDeals: 1, to: '/mobile/development/dev-one' })
  expect(snapshot.summaryCards.find((item) => item.key === 'pipeline').value).toBe('R2.2m')
  expect(snapshot.today.counts.deals).toBe(1)
  expect(snapshot.units.find((unit) => unit.id === 'unit-2')).toMatchObject({ unitLabel: 'Unit 002', propertyTitle: 'Junoah', available: true, value: 2100000 })
})

it('keeps the full saved inventory for Listings while limiting the home preview to five', async () => {
  api.listings.mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({ id: `listing-${index}`, title: `Saved property ${index}`, askingPrice: 2190000 })))
  const snapshot = await getMobileDashboardSnapshotAsync({ workspace, organisation })
  expect(snapshot.listings).toHaveLength(5)
  expect(snapshot.allListings).toHaveLength(7)
  expect(snapshot.allListings[6]).toMatchObject({ id: 'listing-6', valueRaw: 2190000 })
})

it('loads the chosen calendar range using current workspace and personal appointment scope', async () => {
  const dateRange = { from: '2026-10-04T22:00:00.000Z', to: '2026-10-11T21:59:59.999Z' }
  await getMobileCalendarSnapshotAsync({ workspace: { ...workspace, role: 'developer' }, organisation, dateRange })
  expect(api.appointments).toHaveBeenCalledWith({ organisationId: 'org-one', includeAll: false, userId: 'me', userEmail: 'me@example.test', module: 'developer', dateRange })
  await getMobileCalendarSnapshotAsync({ workspace: { role: 'principal' }, organisation, dateRange })
  expect(api.appointments).toHaveBeenLastCalledWith(expect.objectContaining({ organisationId: 'org-one', includeAll: true, module: 'default' }))
})

it('refuses a calendar read without an organisation, personal identity or valid date range', async () => {
  const dateRange = { from: '2026-10-04T22:00:00.000Z', to: '2026-10-11T21:59:59.999Z' }
  await expect(getMobileCalendarSnapshotAsync({ workspace, dateRange })).rejects.toThrow('Select a workspace')
  await expect(getMobileCalendarSnapshotAsync({ workspace: { role: 'agent' }, organisation, dateRange })).rejects.toThrow('Select a workspace')
  await expect(getMobileCalendarSnapshotAsync({ workspace, organisation, dateRange: { from: dateRange.to, to: dateRange.from } })).rejects.toThrow('valid calendar week')
  await expect(getMobileCalendarSnapshotAsync({ workspace, organisation })).rejects.toThrow('valid calendar week')
  expect(api.appointments).not.toHaveBeenCalled()
})

it('does not run an unscoped developer read or substitute agent demo work when the portfolio read fails', async () => {
  const developer = { ...workspace, role: 'developer' }
  await expect(getMobileDashboardSnapshotAsync({ workspace: developer })).rejects.toThrow('Select a developer workspace')
  expect(api.overview).not.toHaveBeenCalled()
  api.overview.mockRejectedValue(new Error('Portfolio unavailable'))
  await expect(getMobileDashboardSnapshotAsync({ workspace: developer, organisation })).rejects.toThrow('Portfolio unavailable')
  expect(api.agentRows).not.toHaveBeenCalled()
})

it('opens saved developer deal details from the authorised portfolio, including registered and connected agency deals', async () => {
  const row = {
    development: { id: 'dev-one', name: 'Junoah' }, unit: { id: 'unit-one', unit_number: '001' },
    buyer: { fullName: 'Saved buyer' },
    transaction: { id: 'tx-one', organisation_id: 'selling-agency', registered_at: '2026-01-01', sales_price: 2190000, finance_type: 'Cash', next_action: 'Closeout', updated_at: '2026-10-06' },
    documentSummary: { uploadedCount: 4, totalRequired: 6, missingCount: 2 },
  }
  api.overview.mockResolvedValue({ rows: [row] })
  const developer = { ...workspace, role: 'developer' }
  const detail = await getMobileDeveloperTransactionSnapshotAsync({ workspace: developer, organisation, transactionId: 'tx-one' })
  expect(api.overview).toHaveBeenCalledWith({ organisationId: 'org-one', developmentId: null, includeSecondaryData: false })
  expect(detail).toMatchObject({ item: { id: 'tx-one', title: 'Junoah · Unit 001', eyebrow: 'Saved buyer', valueRaw: 2190000 }, financeType: 'Cash', documentSummary: row.documentSummary })
  expect(api.rollup).toHaveBeenCalledWith('tx-one', { actorRole: 'developer' })
  expect(api.documents).toHaveBeenCalledWith('tx-one')
  expect(await getMobileDeveloperTransactionSnapshotAsync({ workspace: developer, organisation, transactionId: 'outside-portfolio' })).toBeNull()
  expect(api.rollup).toHaveBeenCalledTimes(1)
  expect(api.documents).toHaveBeenCalledTimes(1)
  api.overview.mockClear()
  await expect(getMobileDeveloperTransactionSnapshotAsync({ workspace: developer, transactionId: 'tx-one' })).rejects.toThrow('Select a developer workspace')
  await expect(getMobileDeveloperTransactionSnapshotAsync({ workspace, organisation, transactionId: 'tx-one' })).rejects.toThrow('Select a developer workspace')
  expect(api.overview).not.toHaveBeenCalled()
})

it('uses saved milestone facts rather than the card progress or captured stage and reads current documents', async () => {
  const transaction = { id: 'tx-one', finance_type: 'Cash', current_stage: 'Registered', sales_price: 2190000 }
  api.overview.mockResolvedValue({ rows: [{ transaction }] })
  api.rollup.mockResolvedValue({ transactionId: 'tx-one', usedLegacyFallback: false, workflows: {
    sales_otp: { requiredSteps: [{ key: 'signed_otp_received', status: 'completed' }] },
    finance_cash: { requiredSteps: [{ key: 'proof_of_funds_reviewed', status: 'completed' }, { key: 'cash_confirmation_approved', status: 'waiting' }] },
  } })
  const documents = [{ id: 'file-one', name: 'Signed OTP.pdf' }]
  const requiredDocuments = [{ key: 'otp', label: 'Signed OTP', status: 'approved' }]
  const documentSummary = { totalRequired: 3, uploadedCount: 1, missingCount: 2 }
  api.documents.mockResolvedValue({ transaction, documents, requiredDocumentChecklist: requiredDocuments, documentSummary })
  const result = await getMobileDeveloperTransactionSnapshotAsync({ workspace: { ...workspace, role: 'developer' }, organisation, transactionId: 'tx-one' })
  expect(result.journey.highLevelJourney.milestones.map((step) => step.status)).toEqual(['complete', 'waiting', 'unknown', 'unknown', 'unknown'])
  expect(result).toMatchObject({ journeyAvailable: true, documentsAvailable: true, documents, requiredDocuments, documentSummary })
})

it('keeps the saved deal readable after secondary failures and rejects secondary responses for another transaction', async () => {
  api.overview.mockResolvedValue({ rows: [{ transaction: { id: 'tx-one', finance_type: 'Cash' } }] })
  api.rollup.mockRejectedValueOnce(new Error('Workflow unavailable'))
  api.documents.mockRejectedValueOnce(new Error('Documents unavailable'))
  const options = { workspace: { ...workspace, role: 'developer' }, organisation, transactionId: 'tx-one' }
  const failed = await getMobileDeveloperTransactionSnapshotAsync(options)
  expect(failed).toMatchObject({ item: { id: 'tx-one' }, journeyAvailable: false, documentsAvailable: false })
  expect(failed.journey.highLevelJourney.milestones.every((step) => step.status === 'unknown')).toBe(true)
  api.rollup.mockResolvedValue({ transactionId: 'other', usedLegacyFallback: false, workflows: { sales_otp: { requiredSteps: [{ key: 'signed_otp_received', status: 'completed' }] } } })
  api.documents.mockResolvedValue({ transaction: { id: 'other', finance_type: 'Bond' }, documents: [{ name: 'Foreign file.pdf' }] })
  const mismatched = await getMobileDeveloperTransactionSnapshotAsync(options)
  expect(mismatched).toMatchObject({ financeType: 'Cash', journeyAvailable: false, documentsAvailable: false, documents: [] })
  expect(mismatched.journey.highLevelJourney.milestones.every((step) => step.status === 'unknown')).toBe(true)
})

it('reuses a recent dashboard across visits and shares concurrent reads instead of repeating every source request', async () => {
  const options = { workspace, organisation }
  const [home, transactions] = await Promise.all([getMobileDashboardSnapshotAsync(options), getMobileDashboardSnapshotAsync(options)])
  expect(transactions).toBe(home)
  expect(getCachedMobileDashboardSnapshot(options)).toBe(home)
  expect(await getMobileDashboardSnapshotAsync(options)).toBe(home)
  expect(api.agentRows).toHaveBeenCalledTimes(1)
  expect(api.crm).toHaveBeenCalledTimes(1)
  expect(api.appointments).toHaveBeenCalledTimes(1)
  expect(api.listings).toHaveBeenCalledTimes(1)
})

it('reuses the authorised developer overview when opening a saved transaction from the dashboard', async () => {
  const developer = { ...workspace, role: 'developer' }
  api.overview.mockResolvedValue({ rows: [{ transaction: { id: 'saved-deal', sales_price: 2190000, finance_type: 'Cash' }, buyer: { name: 'Saved buyer' } }], developmentSummaries: [] })
  await getMobileDashboardSnapshotAsync({ workspace: developer, organisation })
  const detail = await getMobileDeveloperTransactionSnapshotAsync({ workspace: developer, organisation, transactionId: 'saved-deal' })
  expect(detail).toMatchObject({ item: { id: 'saved-deal', eyebrow: 'Saved buyer' }, financeType: 'Cash' })
  expect(api.overview).toHaveBeenCalledTimes(1)
  expect(await getMobileDeveloperTransactionSnapshotAsync({ workspace: developer, organisation, transactionId: 'not-authorised' })).toBeNull()
})

it('expires saved dashboards after 30 seconds and lets an explicit refresh bypass recent data', async () => {
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const options = { workspace, organisation }
  const first = await getMobileDashboardSnapshotAsync(options)
  const refreshed = await getMobileDashboardSnapshotAsync({ ...options, force: true })
  expect(refreshed).not.toBe(first)
  expect(api.agentRows).toHaveBeenCalledTimes(2)
  clock.mockReturnValue(now + 30_001)
  expect(getCachedMobileDashboardSnapshot(options)).toBeNull()
  await getMobileDashboardSnapshotAsync(options)
  expect(api.agentRows).toHaveBeenCalledTimes(3)
})

it('can preview recently saved records during a fresh read, while expiring old previews after five minutes', async () => {
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const options = { workspace, organisation }
  const saved = await getMobileDashboardSnapshotAsync(options)
  clock.mockReturnValue(now + 30_001)
  expect(getCachedMobileDashboardSnapshot(options)).toBeNull()
  expect(getCachedMobileDashboardSnapshot({ ...options, allowStale: true })).toBe(saved)
  let resolveFresh
  api.agentRows.mockReturnValueOnce(new Promise((resolve) => { resolveFresh = resolve }))
  const freshRead = getMobileDashboardSnapshotAsync(options)
  expect(api.agentRows).toHaveBeenCalledTimes(2)
  expect(getCachedMobileDashboardSnapshot({ ...options, allowStale: true })).toBe(saved)
  resolveFresh([])
  await freshRead
  clock.mockReturnValue(now + 5 * 60_000 + 30_002)
  expect(getCachedMobileDashboardSnapshot({ ...options, allowStale: true })).toBeNull()
})

it('keeps cached records separate for different people, organisations, roles and selected workspaces', async () => {
  const options = { workspace, organisation }
  await getMobileDashboardSnapshotAsync(options)
  for (const other of [
    { workspace: { ...workspace, profile: { ...workspace.profile, id: 'other-user' } }, organisation },
    { workspace, organisation: { id: 'other-org' } },
    { workspace: { ...workspace, role: 'principal' }, organisation },
    { workspace: { ...workspace, workspace: { id: 'other-selection' } }, organisation },
    { workspace: { ...workspace, organisationMembershipRole: 'owner' }, organisation },
  ]) {
    expect(getCachedMobileDashboardSnapshot(other)).toBeNull()
    await getMobileDashboardSnapshotAsync(other)
  }
  expect(api.agentRows.mock.calls.length + api.allRows.mock.calls.length).toBe(6)
})

it.each(['itg:agency-crm-updated', 'itg:transaction-updated', 'itg:transaction-created', 'bridge:workspace-scoped-cache-cleared'])('clears saved data on %s', async (event) => {
  const options = { workspace, organisation }
  await getMobileDashboardSnapshotAsync(options)
  window.dispatchEvent(new Event(event))
  expect(getCachedMobileDashboardSnapshot(options)).toBeNull()
  await getMobileDashboardSnapshotAsync(options)
  expect(api.agentRows).toHaveBeenCalledTimes(2)
})

it('does not let a request started before invalidation overwrite the fresh dashboard', async () => {
  let resolveOld
  api.agentRows.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
  const options = { workspace, organisation }
  const oldRequest = getMobileDashboardSnapshotAsync(options)
  clearMobileDashboardCache()
  api.agentRows.mockResolvedValue([{ transaction: { id: 'new-deal', organisation_id: 'org-one', next_action: 'Review transfer' } }])
  const fresh = await getMobileDashboardSnapshotAsync(options)
  resolveOld([])
  await oldRequest
  expect(getCachedMobileDashboardSnapshot(options)).toBe(fresh)
  expect(fresh.transactions[0].id).toBe('new-deal')
})

it('retries failed reads rather than caching a failure', async () => {
  const options = { workspace, organisation }
  api.agentRows.mockRejectedValueOnce(new Error('Temporary failure'))
  await expect(getMobileDashboardSnapshotAsync(options)).rejects.toThrow('Temporary failure')
  expect(getCachedMobileDashboardSnapshot(options)).toBeNull()
  await getMobileDashboardSnapshotAsync(options)
  expect(api.agentRows).toHaveBeenCalledTimes(2)
})
