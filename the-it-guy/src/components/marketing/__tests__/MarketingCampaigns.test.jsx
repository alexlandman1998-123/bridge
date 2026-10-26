// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MarketingCampaigns from '../MarketingCampaigns'
vi.mock('../MarketingAudiences', () => ({ default: () => <div>Shared CRM audience library</div>, CampaignAudience: ({ campaign }) => <div>Live CRM audience: {campaign.audience}</div> }))
vi.mock('../CampaignEnquiries', () => ({ default: () => <div>Campaign enquiry workspace</div> }))
vi.mock('../../../services/campaignEnquiryService', () => ({ loadCampaignOverviewEnquiries: vi.fn().mockResolvedValue({ entries: [], warnings: [], tasksAvailable: true, activitiesAvailable: true }), loadCampaignEnquiries: vi.fn().mockResolvedValue({ entries: [], warnings: [], tasksAvailable: true, activitiesAvailable: true }) }))
const runtime = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  templateLoad: vi.fn(),
  templateSave: vi.fn(),
  choices: vi.fn(),
  source: vi.fn(),
  directory: vi.fn(),
  channelLoad: vi.fn(),
  channelSave: vi.fn(),
  prepareEmail: vi.fn(),
  publishingBrief: vi.fn(),
  org: 'agency',
  workspace: null,
}))
vi.mock('../../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ currentWorkspace: { organisationId: runtime.org } }),
}))
vi.mock('../../../services/marketingCampaignService', async (original) => ({
  ...(await original()),
  loadMarketingCampaigns: runtime.load,
  saveMarketingCampaign: runtime.save,
  linkMarketingActivity: runtime.link,
  unlinkMarketingActivity: runtime.unlink,
}))
vi.mock('../../../services/marketingCampaignTemplateService', () => ({
  loadCampaignTemplates: runtime.templateLoad,
  saveCampaignTemplate: runtime.templateSave,
}))
vi.mock('../../../services/justListedCampaignService', () => ({ loadJustListedChoices: runtime.choices, loadJustListedSource: runtime.source }))
vi.mock('../../../services/organizationService', () => ({ getOrganizationProfile: runtime.directory }))
vi.mock('../../../services/marketingChannelTemplateService', async (original) => ({ ...(await original()), loadChannelTemplates: runtime.channelLoad, saveChannelTemplate: runtime.channelSave }))
vi.mock('../../../services/campaignPackService', async (original) => ({ ...(await original()), handoffCampaignDraft: runtime.prepareEmail, loadCampaignChannelBrief: runtime.publishingBrief }))
vi.mock('../../../services/generalCampaignService', () => ({loadGeneralCampaignContext:vi.fn().mockResolvedValue({agentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',source:{agencyName:'Oak',agentName:'Sarah',destination:'sarah@example.test',language:'en-ZA'},areas:['Gardens'],defaults:{area:'Gardens'}})}))
vi.mock('../../../lib/supabaseClient', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))
const plan = {
  id: 'plan',
  name: 'Summer sellers',
  goal: 'seller_leads',
  objective: 'Book 20 valuations',
  audience: 'Local homeowners',
  offer: 'Free valuation',
  area: 'Cape Town',
  status: 'active',
  planned_channels: ['email', 'whatsapp', 'meta'],
  revision: 1,
  created_by: 'owner',
  updated_at: '2026-10-22',
}
const chooseObjective = () => {
  const objective = screen.queryByLabelText('Objective')
  if (objective && !objective.value) fireEvent.change(objective, { target: { value: 'OUTCOME_LEADS' } })
}
const next = () => { chooseObjective(); fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true })) }
const scratch = async () => fireEvent.click(await screen.findByRole('button', { name: /Start from scratch/ }))
const mount = (query = '') =>
  render(
    <MemoryRouter initialEntries={[`/marketing?section=campaigns${query}`]}>
      <MarketingCampaigns />
    </MemoryRouter>,
  )
beforeEach(() => {
  runtime.org = 'agency'
  runtime.prepareEmail.mockImplementation(async (org, user, campaign) => {
    runtime.workspace.activities.push({ id: 'prepared-link', campaign_id: campaign.id, channel: 'email', email_campaign_id: 'prepared-email' })
    runtime.workspace.channels.email.data.push({ id: 'prepared-email', name: campaign.name, status: 'draft', delivered: null, opened: null, clicked: null })
    return { id: 'prepared-email', status: 'draft' }
  })
  runtime.channelLoad.mockResolvedValue([])
  runtime.channelSave.mockImplementation(async (org, form, existing) => ({ ...form, id: existing?.id || 'channel-template', organisation_id: org, created_by: 'owner', revision: (existing?.revision || 0) + 1 }))
  runtime.directory.mockResolvedValue({ members: [{ userId: 'owner', fullName: 'Sarah Jacobs' }, { userId: 'other', fullName: 'Alex Smith' }] })
  runtime.choices.mockResolvedValue({ agency: { agencyName: 'Oak' }, listings: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Sunny home', area: 'Gardens' }] })
  runtime.source.mockResolvedValue({ listingId: '11111111-1111-4111-8111-111111111111', agentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', source: { title: 'Sunny home', location: 'Gardens', price: 'R 1250000', agencyName: 'Oak', agentName: 'Sarah', destination: 'sarah@example.test', language: 'en-ZA' } })
  runtime.templateLoad.mockResolvedValue([])
  runtime.templateSave.mockImplementation(async (org, form, existing) => ({
    ...form,
    id: existing?.id || form.id,
    planned_channels: form.planned_channels,
    run_mode: form.mode,
    created_by: 'owner',
    revision: (existing?.revision || 0) + 1,
  }))
  runtime.workspace = {
    campaigns: [structuredClone(plan)],
    activities: [],
    userId: 'owner',
    canManage: false,
    channels: {
      email: {
        data: [
          {
            id: 'email',
            name: 'Valuation invite',
            status: 'sent',
            delivered: 10,
            opened: 5,
            clicked: 2,
          },
        ],
      },
      whatsapp: { data: [] },
    },
  }
  runtime.load.mockImplementation(async () =>
    structuredClone(runtime.workspace),
  )
  runtime.save.mockImplementation(async (org, form) => {
    const saved = { ...form, id: 'new', revision: 1, created_by: 'owner' }
    runtime.workspace.campaigns.push(saved)
    return saved
  })
  runtime.link.mockImplementation(async (org, campaignId, channel, id) => {
    runtime.workspace.activities.push({
      id: 'link',
      campaign_id: campaignId,
      channel,
      [`${channel}_campaign_id`]: id,
    })
  })
  runtime.unlink.mockImplementation(async () => {
    runtime.workspace.activities = []
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('shows objective templates, searchable cards and status filters', async () => {
  mount()
  await screen.findByRole('heading', { name: 'Summer sellers' })
  expect(
    screen.getByRole('button', { name: 'Use template: Attract sellers' }),
  ).toBeTruthy()
  expect(screen.getByText('Dates to confirm')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Drafts' }))
  expect(screen.getByText('No matching campaigns')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'All campaigns' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search campaigns' }), {
    target: { value: 'no match' },
  })
  expect(screen.queryByRole('heading', { name: 'Summer sellers' })).toBeNull()
})
it('creates a plan and opens its persisted overview without sending', async () => {
  mount('&view=create')
  await scratch()
  fireEvent.change(await screen.findByLabelText('Campaign name'), {
    target: { value: 'Winter buyers' },
  })
  next(); next()
  fireEvent.change(screen.getByLabelText('Planned budget (ZAR)'), {
    target: { value: '1250.50' },
  })
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  await screen.findByRole('heading', { name: 'Winter buyers' })
  expect(runtime.save).toHaveBeenCalledWith(
    'agency',
    expect.objectContaining({
      name: 'Winter buyers',
      status: 'draft',
      planned_budget: '1250.50',
      budget_currency: 'ZAR',
    }),
    null,
  )
  expect(runtime.link).not.toHaveBeenCalled()
})
it('retains form values after a failed save', async () => {
  runtime.save.mockRejectedValue(new Error('Connection lost'))
  mount('&view=create')
  await scratch()
  fireEvent.change(await screen.findByLabelText('Campaign name'), {
    target: { value: 'Keep this draft' },
  })
  next(); next()
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Edit goal & offer' }))
  expect(screen.getByLabelText('Campaign name').value).toBe('Keep this draft')
})
it('links existing activity, shows recorded results and unlinks without deleting sends', async () => {
  mount('&view=detail&id=plan&tab=activity')
  fireEvent.change(
    await screen.findByLabelText('Link existing Email campaign'),
    { target: { value: 'email' } },
  )
  fireEvent.click(screen.getAllByRole('button', { name: 'Link activity' })[0])
  await screen.findByText('Valuation invite')
  fireEvent.click(screen.getByRole('button', { name: 'Results' }))
  await screen.findByText('10')
  expect(screen.getByText('5')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Channel activity' }))
  fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
  await waitFor(() => expect(screen.queryByText('Valuation invite')).toBeNull())
  expect(runtime.unlink).toHaveBeenCalledWith('agency', 'plan', 'link')
  expect(runtime.workspace.channels.email.data).toHaveLength(1)
})
it('keeps colleagues in view mode', async () => {
  runtime.workspace.userId = 'colleague'
  runtime.workspace.campaigns[0].channel_content = { email: { title: 'Subject', body: 'Saved copy' } }
  mount('&view=detail&id=plan&tab=activity')
  await screen.findByRole('heading', { name: 'Summer sellers' })
  expect(screen.queryByRole('button', { name: 'Edit campaign' })).toBeNull()
  expect(screen.queryByLabelText('Link existing Email campaign')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Prepare email draft' })).toBeNull()
})
it('discards late agency responses when switching workspaces', async () => {
  let resolveOld
  runtime.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  )
  const view = mount()
  runtime.org = 'other'
  runtime.load.mockResolvedValue({ ...runtime.workspace, campaigns: [] })
  view.rerender(
    <MemoryRouter>
      <MarketingCampaigns />
    </MemoryRouter>,
  )
  await screen.findByText('Give your marketing a direction')
  resolveOld({ ...runtime.workspace, campaigns: [plan] })
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Summer sellers' }),
    ).toBeNull(),
  )
})

it('starts a milestone template as an ongoing draft without enabling automation', async () => {
  mount()
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Use template: Celebrate milestones',
    }),
  )
  expect(screen.getByLabelText('Campaign name').value).toBe('Client milestones')
  next(); next()
  expect(screen.getByLabelText('How should this campaign run?').value).toBe(
    'ongoing',
  )
  expect(screen.queryByLabelText('End date')).toBeNull()
  expect(
    screen.getByText(/birthday triggers are not automated yet/),
  ).toBeTruthy()
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  await screen.findByRole('heading', { name: 'Client milestones' })
  expect(runtime.save).toHaveBeenCalledWith(
    'agency',
    expect.objectContaining({
      name: 'Client milestones',
      end_date: '',
      status: 'draft',
      planned_channels: ['email', 'whatsapp'],
    }),
    null,
  )
  expect(runtime.link).not.toHaveBeenCalled()
})
it('filters time-bound and ongoing campaigns without reclassifying undated plans', async () => {
  runtime.workspace.campaigns.push(
    {
      ...plan,
      id: 'bounded',
      name: 'November drive',
      start_date: '2026-11-01',
      end_date: '2026-11-30',
    },
    {
      ...plan,
      id: 'ongoing',
      name: 'Always connected',
      start_date: '2026-10-01',
      end_date: null,
    },
  )
  mount()
  await screen.findByRole('heading', { name: 'November drive', level: 2 })
  fireEvent.click(screen.getByRole('button', { name: 'Ongoing', exact: true }))
  expect(screen.getByRole('heading', { name: 'Always connected' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'November drive', level: 2 })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Summer sellers' })).toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: 'Time-bound', exact: true }),
  )
  expect(screen.getByRole('heading', { name: 'November drive', level: 2 })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Always connected' })).toBeNull()
})
it('clears the end date when a time-bound template becomes ongoing', async () => {
  mount('&view=create')
  await scratch()
  fireEvent.change(await screen.findByLabelText('Campaign name'), {target:{value:'Seller valuation campaign'}})
  next(); next()
  expect(screen.getByLabelText('End date').required).toBe(true)
  fireEvent.change(screen.getByLabelText('How should this campaign run?'), {
    target: { value: 'ongoing' },
  })
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  await screen.findByRole('heading', { name: 'Seller valuation campaign' })
  expect(runtime.save).toHaveBeenCalledWith(
    'agency',
    expect.objectContaining({ end_date: '', start_date: expect.any(String) }),
    null,
  )
})

it('shows recorded channel activity and attention without fabricated outcome metrics', async () => {
  runtime.workspace.activities = [
    {
      id: 'linked',
      campaign_id: 'plan',
      channel: 'email',
      email_campaign_id: 'email',
    },
  ]
  runtime.workspace.channels.email.data[0].status = 'failed'
  mount()
  await screen.findByRole('heading', { name: 'Summer sellers' })
  expect(screen.getByText('1 linked activity')).toBeTruthy()
  expect(screen.getAllByText('Needs attention').length).toBeGreaterThan(0)
  expect(screen.getByText('Channel activity needs attention')).toBeTruthy()
  expect(screen.queryByText('Valuation requests')).toBeNull()
})

it('opens the ready-made library and starts a new listing with editable channel content', async () => {
  mount()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Browse templates' }),
  )
  expect(screen.getByRole('heading', { name: 'Just Listed' })).toBeTruthy()
  const listing = screen
    .getByRole('heading', { name: 'Just Listed' })
    .closest('article')
  fireEvent.click(listing.querySelector('button'))
  fireEvent.click(await screen.findByRole('button', { name: /Sunny home/ }))
  fireEvent.click(await screen.findByRole('button', { name: /Confirm and preview/ }))
  expect(screen.getByRole('heading', { name: 'Your campaign draft is ready to review' })).toBeTruthy()
  expect(runtime.save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await screen.findByRole('heading', { name: 'Just Listed · Sunny home' })
  expect(runtime.save).toHaveBeenCalledWith('agency', expect.objectContaining({ listing_builder: expect.objectContaining({ template: 'new-listing' }) }), null)
  fireEvent.click(screen.getByRole('button', { name: 'Edit campaign' }))
  await screen.findByRole('heading', { name: 'Review your campaign draft' })
  expect(screen.getByRole('button', { name: /Confirm and preview/ })).toBeTruthy()
})
it('saves a personal template from a campaign without retaining its dates or activity links', async () => {
  runtime.workspace.campaigns[0] = {
    ...plan,
    start_date: '2025-01-01',
    end_date: '2025-01-15',
  }
  mount('&view=detail&id=plan')
  fireEvent.click(
    await screen.findByRole('button', { name: 'Save as template' }),
  )
  expect(screen.getByLabelText('Template name').value).toBe('Summer sellers')
  expect(screen.getByLabelText('Campaign duration (days)').value).toBe('14')
  expect(screen.queryByLabelText('Start date')).toBeNull()
  expect(screen.queryByLabelText('End date')).toBeNull()
  expect(screen.getByLabelText('Who can use this template?').value).toBe(
    'personal',
  )
  chooseObjective()
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
  await screen.findByRole('heading', { name: 'Campaign & Automation Templates' })
  expect(screen.getByRole('heading', { name: 'Summer sellers' })).toBeTruthy()
  expect(runtime.templateSave).toHaveBeenCalledWith(
    'agency',
    expect.objectContaining({
      name: 'Summer sellers',
      visibility: 'personal',
      duration_days: 14,
    }),
    null,
  )
  expect(runtime.save).not.toHaveBeenCalled()
  expect(runtime.link).not.toHaveBeenCalled()
})
it('uses a saved template with fresh dates, and does not offer agency publishing to ordinary members', async () => {
  runtime.templateLoad.mockResolvedValue([
    {
      id: 'saved-plan',
      name: 'My listing playbook',
      goal: 'promote_listing',
      objective: 'Find a buyer',
      visibility: 'personal',
      created_by: 'owner',
      planned_channels: ['email'],
      run_mode: 'bounded',
      duration_days: 7,
      channel_content: {
        email: { title: 'Hello', body: 'See [listing link]' },
      },
    },
  ])
  mount('&view=templates&library=personal')
  fireEvent.click(
    await screen.findByRole('button', { name: 'Use template', exact: true }),
  )
  expect(screen.getByLabelText('Campaign name').value).toBe(
    'My listing playbook',
  )
  next()
  expect(screen.getByLabelText('Email draft message').value).toBe('See [listing link]')
  next()
  expect(screen.getByLabelText('Start date').value).not.toBe('')
  expect(screen.getByLabelText('End date').value).not.toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Campaign & Automation Templates', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Create template' }))
  expect(
    screen.queryByRole('option', { name: 'Everyone in this agency' }),
  ).toBeNull()
})
it('retains a template draft after save failure and keeps ready-made templates available when storage is missing', async () => {
  runtime.templateLoad.mockRejectedValue(
    new Error('Template storage unavailable'),
  )
  runtime.templateSave.mockRejectedValue(
    new Error('Template storage unavailable'),
  )
  mount('&view=template-create')
  fireEvent.change(await screen.findByLabelText('Template name'), {
    target: { value: 'Keep my playbook' },
  })
  chooseObjective()
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Template storage unavailable',
  )
  expect(screen.getByLabelText('Template name').value).toBe('Keep my playbook')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(screen.getByRole('heading', { name: 'Just Listed' })).toBeTruthy()
})

it('opens the selected current campaign workspace above the templates', async () => {
  mount()
  fireEvent.click(
    await screen.findByRole('link', { name: 'Open campaign: Summer sellers' }),
  )
  expect(
    await screen.findByRole('button', { name: 'Edit campaign' }),
  ).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Summer sellers' })).toBeTruthy()
  expect(
    screen.queryByRole('heading', { name: /Current campaigns/ }),
  ).toBeNull()
})
it('routes the remaining listing templates into the specialised property campaign builder', async () => {
 mount('&view=create&template=property-spotlight')
 await screen.findByRole('heading',{name:'Property Spotlight',exact:true},{timeout:5000})
 fireEvent.click(await screen.findByRole('button',{name:/Sunny home/}))
 await screen.findByRole('heading',{name:'Confirm the campaign details'})
 expect(screen.getByLabelText('Standout feature (from your saved facts, editable)')).toBeTruthy()
 expect(runtime.save).not.toHaveBeenCalled()
})

it('routes buyer templates to the saved-details builder and exposes assets after saving',async()=>{
 mount('&view=create&template=buyers')
 fireEvent.click(await screen.findByRole('button',{name:/Continue with saved details/},{timeout:5000}))
 fireEvent.click(screen.getByRole('checkbox',{name:'I have reviewed these public details and campaign-specific facts.'}))
 fireEvent.click(screen.getByRole('button',{name:'Confirm and preview'}))
 fireEvent.click(screen.getByRole('button',{name:'Save campaign draft'}))
 await waitFor(()=>expect(runtime.save).toHaveBeenCalledWith('agency',expect.objectContaining({campaign_builder:expect.objectContaining({template:'buyers'})}),null))
 expect(await screen.findByRole('button',{name:'Assets & drafts'})).toBeTruthy()
 expect(runtime.link).not.toHaveBeenCalled()
})

it('separates the workspace pages and returns from Studio creation to Studio', async () => {
  mount()
  await screen.findByRole('heading', { name: 'Summer sellers' })
  const navigation = screen.getByRole('navigation', { name: 'Campaign workspace' })
  expect(navigation.querySelector('[aria-current="page"]').textContent).toBe('Overview')
  expect(screen.queryByRole('heading', { name: 'Campaign performance' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Analytics', exact: true }))
  expect(screen.getByRole('heading', { name: 'Campaign performance' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Your campaigns' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Studio', exact: true }))
  expect(screen.getByRole('region', { name: 'Marketing formats' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Build a campaign' }))
  await screen.findByRole('button', { name: /Start from scratch/ })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(screen.getByRole('region', { name: 'Marketing formats' })).toBeTruthy()
})

it('does not offer Agents or load the directory to an ordinary member, including a direct URL', async () => {
  mount('&page=agents')
  await screen.findByRole('heading', { name: 'Agency manager access required' })
  expect(screen.queryByRole('button', { name: 'Agents', exact: true })).toBeNull()
  expect(runtime.directory).not.toHaveBeenCalled()
})

it('shows manager-visible agency campaigns by named owner and filters active, scheduled and draft plans', async () => {
  runtime.workspace.canManage = true
  runtime.workspace.campaigns.push(
    { ...plan, id: 'scheduled', name: 'Alex launch', status: 'scheduled', created_by: 'other' },
    { ...plan, id: 'draft', name: 'Sarah draft', status: 'draft' },
  )
  mount('&page=agents')
  await screen.findByRole('heading', { name: 'Sarah Jacobs' })
  expect(runtime.directory).toHaveBeenCalledWith('agency')
  expect(screen.queryByRole('heading', { name: 'Summer sellers' })).toBeNull()
  expect(screen.getByRole('button', { name: 'View campaigns for Alex Smith' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View campaigns for Sarah Jacobs' }))
  expect(screen.getByRole('heading', { name: 'Summer sellers' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Sarah draft' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Agent campaign status'), { target: { value: 'active' } })
  expect(screen.queryByRole('heading', { name: 'Sarah draft' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Agent campaign status'), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText('Filter campaigns by agent'), { target: { value: 'other' } })
  expect(screen.getByRole('heading', { name: 'Alex launch' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Summer sellers' })).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Open campaign', exact: true }))
  await screen.findByRole('button', { name: 'Back to Agents' })
  fireEvent.click(screen.getByRole('button', { name: 'Back to Agents' }))
  expect(screen.getByRole('heading', { name: 'Agent campaigns' })).toBeTruthy()
})

it('promotes an agent campaign into a reviewed agency template without publishing immediately', async () => {
  runtime.workspace.canManage = true
  mount('&page=agents')
  fireEvent.click(await screen.findByRole('button', { name: 'View campaigns for Sarah Jacobs' }))
  fireEvent.click(screen.getByRole('button', { name: 'Make agency template' }))
  expect(await screen.findByLabelText('Who can use this template?')).toHaveProperty('value', 'agency')
  expect(screen.getByLabelText('Template name').value).toBe('Summer sellers')
  expect(runtime.templateSave).not.toHaveBeenCalled()
})

it('refreshes agent campaigns while the Agents page is open and stops after leaving', async () => {
  runtime.workspace.canManage = true
  vi.useFakeTimers()
  try {
    await act(async () => { mount('&page=agents') })
    expect(screen.getByRole('heading', { name: 'Sarah Jacobs' })).toBeTruthy()
    const initial = runtime.load.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(runtime.load.mock.calls.length).toBe(initial + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Overview', exact: true }))
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(runtime.load.mock.calls.length).toBe(initial + 1)
  } finally { vi.useRealTimers() }
})

it('indexes saved packs and channel copy without inventing generated assets', async () => {
  runtime.workspace.campaigns.push(
    { ...plan, id: 'pack', name: 'Property pack', listing_builder: { template: 'new-listing' } },
    { ...plan, id: 'copy', name: 'Email wording', channel_content: { email: { body: 'Saved wording' } } },
  )
  mount('&page=assets')
  await screen.findByRole('heading', { name: 'Assets & saved copy' })
  expect(screen.queryByRole('heading', { name: 'Summer sellers' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Open campaign pack' }).getAttribute('href')).toContain('tab=assets')
  expect(screen.getByRole('link', { name: 'Review saved copy' }).getAttribute('href')).toContain('tab=activity')
  fireEvent.change(screen.getByLabelText('Asset type'), { target: { value: 'copy' } })
  expect(screen.queryByRole('heading', { name: 'Property pack' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Email wording' })).toBeTruthy()
})

it('creates a channel template in Studio and uses a copy in a new campaign', async () => {
  mount('&page=studio&collection=channels')
  fireEvent.click(await screen.findByRole('button', { name: 'Create channel template' }))
  fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Valuation email' } })
  fireEvent.change(screen.getByLabelText('Email subject'), { target: { value: 'Your property value' } })
  fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'Hello [first name]' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save channel template' }))
  await screen.findByRole('heading', { name: 'Valuation email' })
  fireEvent.click(screen.getByRole('button', { name: 'Use in campaign' }))
  await screen.findByLabelText('Campaign name')
  expect(screen.getByLabelText('Campaign name').value).toBe('Valuation email')
  fireEvent.change(screen.getByLabelText('Objective'), {target:{value:'Book valuations'}})
  next()
  expect(screen.getByLabelText('Email draft message').value).toBe('Hello [first name]')
  expect(runtime.save).not.toHaveBeenCalled()
  expect(runtime.channelSave).toHaveBeenCalledWith('agency', expect.objectContaining({ name: 'Valuation email', visibility: 'personal' }), null)
})

it('keeps channel-template load failures explicit and blocks editing agency templates for members', async () => {
  runtime.channelLoad.mockResolvedValue([{ id: 'shared', organisation_id: 'agency', name: 'Agency copy', channel: 'email', visibility: 'agency', created_by: 'manager', title: 'Hello', body: 'Shared copy' }])
  mount('&page=studio&collection=channels&view=channel-template-edit&id=shared')
  await screen.findByRole('heading', { name: 'Channel template unavailable' })
  expect(screen.queryByRole('button', { name: 'Save channel template' })).toBeNull()
  expect(runtime.channelSave).not.toHaveBeenCalled()
})

it('loads a channel template from a direct create link without requiring a Studio page parameter', async () => {
  runtime.channelLoad.mockResolvedValue([{ id: 'direct', organisation_id: 'agency', name: 'Direct email', channel: 'email', visibility: 'agency', title: 'Hello', body: 'Independent wording' }])
  mount('&view=create&channelTemplate=direct')
  await screen.findByLabelText('Campaign name')
  expect(screen.getByLabelText('Campaign name').value).toBe('Direct email')
  fireEvent.change(screen.getByLabelText('Objective'), {target:{value:'Reach local owners'}})
  next()
  expect(screen.getByLabelText('Email draft message').value).toBe('Independent wording')
})

it('takes personalised template copy through campaign save, linked email draft and refreshed results', async () => {
  runtime.channelLoad.mockResolvedValue([{ id: 'email-template', name: 'Valuation email', channel: 'email', visibility: 'agency', title: 'Your valuation', body: 'Hello [first name]' }])
  mount('&view=create&channelTemplate=email-template')
  await screen.findByLabelText('Campaign name')
  fireEvent.change(screen.getByLabelText('Objective'), { target: { value: 'Book local valuations' } })
  next()
  fireEvent.change(screen.getByLabelText('Email draft message'), { target: { value: 'Hello {{first_name}}, book your Gardens valuation.' } })
  next(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare email draft' }))
  const open = await screen.findByRole('link', { name: 'Open email draft' })
  expect(open.getAttribute('href')).toContain('section=email&view=create&id=prepared-email')
  expect(runtime.prepareEmail).toHaveBeenCalledWith('agency', 'owner', expect.objectContaining({ channel_content: { email: expect.objectContaining({ body: 'Hello {{first_name}}, book your Gardens valuation.' }) } }), 'email')
  expect(runtime.channelSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Results', exact: true }))
  expect(within(screen.getByRole('heading', { name: 'Channel results' }).closest('.mc-panel')).getAllByText('—')).toHaveLength(3)
  const send = runtime.workspace.channels.email.data.find((row) => row.id === 'prepared-email')
  Object.assign(send, { status: 'sent', delivered: 100, opened: 40, clicked: 12 })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }))
  await screen.findByText('100')
  expect(screen.getByText('40')).toBeTruthy()
  expect(screen.getByText('12')).toBeTruthy()
})

it('keeps email preparation errors recoverable without discarding saved campaign copy', async () => {
  runtime.workspace.campaigns[0].channel_content = { email: { title: 'Subject', body: 'Saved copy' } }
  runtime.prepareEmail.mockRejectedValueOnce(new Error('Linking interrupted; retry the saved draft.'))
  mount('&view=detail&id=plan&tab=activity')
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare email draft' }))
  await screen.findByRole('alert')
  expect(screen.getByText('Saved copy')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Prepare email draft' }))
  await screen.findByRole('link', { name: 'Open email draft' })
  expect(runtime.prepareEmail).toHaveBeenCalledTimes(2)
})

it('prepares generic WhatsApp wording, opens the draft editor and refreshes recorded campaign reads',async()=>{
 runtime.workspace.campaigns[0].channel_content={whatsapp:{body:'Your personalised Gardens valuation invitation'}}
 runtime.prepareEmail.mockImplementation(async(_org,_user,campaign,channel)=>{
  runtime.workspace.activities.push({id:'wa-link',campaign_id:campaign.id,channel,whatsapp_campaign_id:'prepared-wa'})
  runtime.workspace.channels.whatsapp.data.push({id:'prepared-wa',name:'Valuation invitation',status:'draft',delivered:0,read:0})
  return {id:'prepared-wa',status:'draft'}
 })
 mount('&view=detail&id=plan&tab=activity')
 fireEvent.click(await screen.findByRole('button',{name:'Prepare WhatsApp draft'}))
 const open=await screen.findByRole('link',{name:'Open WhatsApp draft'})
 expect(open.getAttribute('href')).toContain('section=whatsapp&view=create&id=prepared-wa')
 expect(runtime.prepareEmail).toHaveBeenCalledWith('agency','owner',expect.objectContaining({id:'plan'}),'whatsapp')
 fireEvent.click(screen.getByRole('button',{name:'Results',exact:true}))
 Object.assign(runtime.workspace.channels.whatsapp.data[0],{status:'sent',delivered:80,read:42})
 fireEvent.click(screen.getByRole('button',{name:'Refresh results'}))
 await screen.findByText('80');expect(screen.getByText('42')).toBeTruthy()
})

it('checks saved Meta copy through the campaign publishing service before copying it',async()=>{
 const write=vi.fn().mockResolvedValue()
 Object.defineProperty(navigator,'clipboard',{value:{writeText:write},configurable:true})
 runtime.publishingBrief.mockResolvedValue({campaign:'Summer sellers',channel:'Meta ads',revision:1,headline:'Checked headline',message:'Checked ad wording'})
 runtime.workspace.campaigns[0].channel_content={meta:{title:'Headline',body:'Saved ad wording'}}
 mount('&view=detail&id=plan&tab=activity')
 fireEvent.click(await screen.findByRole('button',{name:'Copy ad copy'}))
 await screen.findByText('Message copied.')
 expect(runtime.publishingBrief).toHaveBeenCalledWith('agency','owner',expect.objectContaining({id:'plan',revision:1}),'meta')
 expect(write).toHaveBeenCalledWith('Checked ad wording')
 expect(runtime.prepareEmail).not.toHaveBeenCalled();expect(runtime.link).not.toHaveBeenCalled()
})

it.each([['email','Email'],['whatsapp','WhatsApp'],['meta','Meta ads'],['chatgpt','ChatGPT Ads'],['social','Organic social']])('opens the %s Studio workspace and keeps new templates in that format', async(format,label)=>{
 runtime.channelLoad.mockResolvedValue([
 {id:'email-seed',name:'Existing email invitation',channel:'email',visibility:'agency',title:'Hello',body:'Email wording'},
 {id:'social-seed',name:'Existing social caption',channel:'social',visibility:'agency',body:'Social wording'}
 ])
 mount('&page=studio')
 await screen.findByRole('region',{name:'Marketing formats'})
 expect(screen.queryByRole('heading',{name:'Campaign & Automation Templates'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:`${label} templates`,exact:true}))
 await screen.findByRole('heading',{name:`${label} templates`,exact:true})
 expect(screen.queryByRole('navigation',{name:'Channel template channels'})).toBeNull()
 if(format!=='email') expect(screen.queryByRole('heading',{name:'Existing email invitation'})).toBeNull()
 if(format!=='social') expect(screen.queryByRole('heading',{name:'Existing social caption'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:`Create ${label} template`}))
 expect(screen.getByLabelText('Channel').value).toBe(format)
 expect(screen.getByLabelText('Channel').disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('Template name'),{target:{value:`My ${label} template`}})
 if(format==='email') fireEvent.change(screen.getByLabelText('Email subject'),{target:{value:'An invitation'}})
 fireEvent.change(screen.getByLabelText(['meta','chatgpt'].includes(format)?'Primary ad text':format==='social'?'Post caption':'Message content'),{target:{value:'Personal wording'}})
 fireEvent.click(screen.getByRole('button',{name:'Save channel template'}))
 await screen.findByRole('heading',{name:`My ${label} template`})
 expect(screen.getByRole('heading',{name:`${label} templates`,exact:true})).toBeTruthy()
 expect(runtime.channelSave).toHaveBeenCalledWith('agency',expect.objectContaining({channel:format}),null)
 fireEvent.click(screen.getByRole('button',{name:'All marketing formats'}))
 expect(screen.getByRole('region',{name:'Marketing formats'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Campaign & Automation Templates',exact:true}))
 await screen.findByRole('heading',{name:'Campaign & Automation Templates',exact:true})
})
it('supports direct format workspace URLs and keeps format scope when cancelling edits',async()=>{
 mount('&page=studio&format=whatsapp')
 await screen.findByRole('heading',{name:'WhatsApp templates'})
 fireEvent.click(screen.getByRole('button',{name:'Create WhatsApp template'}))
 expect(screen.getByRole('heading',{name:'Create WhatsApp template'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
 expect(screen.getByRole('heading',{name:'WhatsApp templates'})).toBeTruthy()
})

it('shows agents without campaigns, excludes pending members, and keeps totals independent of search',async()=>{
 runtime.workspace.canManage=true
 runtime.directory.mockResolvedValue({members:[{userId:'owner',fullName:'Sarah Jacobs',membershipStatus:'active'},{userId:'zero',fullName:'Jamie Daniels',membershipStatus:'active'},{userId:'pending',fullName:'Pending Person',membershipStatus:'pending'}]})
 runtime.workspace.campaigns.push({...plan,id:'draft',name:'Unique draft',status:'draft'})
 mount('&page=agents')
 const empty=await screen.findByRole('button',{name:'View campaigns for Jamie Daniels'})
 expect(empty.querySelector('.mc-agent-card-totals dd').textContent).toBe('0')
 expect(screen.queryByRole('button',{name:'View campaigns for Pending Person'})).toBeNull()
 fireEvent.change(screen.getByLabelText('Search agent campaigns'),{target:{value:'Unique draft'}})
 const card=screen.getByRole('button',{name:'View campaigns for Sarah Jacobs'})
 expect(card.querySelector('.mc-agent-card-totals dd').textContent).toBe('2')
 fireEvent.click(card)
 expect(screen.getByRole('heading',{name:'Unique draft'})).toBeTruthy()
 expect(screen.queryByRole('heading',{name:'Summer sellers'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'All agents',exact:true}))
 fireEvent.change(screen.getByLabelText('Search agent campaigns'),{target:{value:''}})
 fireEvent.click(screen.getByRole('button',{name:'View campaigns for Jamie Daniels'}))
 expect(screen.getByText('This agent has no campaigns yet.')).toBeTruthy()
})
it('filters agent cards by campaign status without changing their total counts',async()=>{
 runtime.workspace.canManage=true
 runtime.workspace.campaigns.push({...plan,id:'scheduled',name:'Alex launch',status:'scheduled',created_by:'other'},{...plan,id:'draft',name:'Sarah draft',status:'draft'})
 mount('&page=agents')
 await screen.findByRole('button',{name:'View campaigns for Sarah Jacobs'})
 fireEvent.change(screen.getByLabelText('Agent campaign status'),{target:{value:'active'}})
 expect(screen.queryByRole('button',{name:'View campaigns for Alex Smith'})).toBeNull()
 expect(screen.getByRole('button',{name:'View campaigns for Sarah Jacobs'}).querySelector('.mc-agent-card-totals dd').textContent).toBe('2')
 fireEvent.change(screen.getByLabelText('Agent campaign status'),{target:{value:'scheduled'}})
 expect(screen.getByRole('button',{name:'View campaigns for Alex Smith'})).toBeTruthy()
})
it('keeps campaign-owner cards available when the agency directory fails',async()=>{
 runtime.workspace.canManage=true
 runtime.directory.mockRejectedValue(new Error('Unavailable'))
 mount('&page=agents')
 await screen.findByRole('alert')
 expect(screen.getByRole('button',{name:'View campaigns for You'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'View campaigns for You'}))
 expect(screen.getByRole('heading',{name:'Summer sellers'})).toBeTruthy()
})

it('places Calendar second and keeps campaign detail navigation in its selected date context',async()=>{
 runtime.workspace.campaigns[0]={...runtime.workspace.campaigns[0],start_date:'2026-10-24',end_date:'2026-10-26'}
 mount('&page=calendar&date=2026-10-25')
 await screen.findByRole('heading',{name:'Marketing calendar'})
 const nav=screen.getByRole('navigation',{name:'Campaign workspace'})
 expect([...nav.querySelectorAll('button')].slice(0,3).map(button=>button.textContent)).toEqual(['Overview','Calendar','Studio'])
 expect(nav.querySelector('[aria-current="page"]').textContent).toBe('Calendar')
 expect(screen.queryByRole('heading',{name:'Your campaigns'})).toBeNull()
 fireEvent.click(screen.getByRole('link',{name:'Open campaign',exact:true}))
 await screen.findByRole('button',{name:'Back to Calendar'})
 fireEvent.click(screen.getByRole('button',{name:'Back to Calendar'}))
 expect(screen.getByRole('heading',{name:'Marketing calendar'})).toBeTruthy()
 expect(screen.getByRole('heading',{name:/25 October|October 25/})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Next month'}))
 expect(screen.getByRole('heading',{name:'November 2026'})).toBeTruthy()
})
it('opens Calendar from Overview without requiring manager access',async()=>{
 mount()
 await screen.findByRole('heading',{name:'Summer sellers'})
 fireEvent.click(screen.getByRole('button',{name:'Calendar',exact:true}))
 expect(screen.getByRole('heading',{name:'Marketing calendar'})).toBeTruthy()
 expect(screen.getByText('1 campaign without dates')).toBeTruthy()
 expect(runtime.directory).not.toHaveBeenCalled()
})

it('refreshes scheduled calendar activity without leaving the selected day',async()=>{
 runtime.workspace.channels.email.data[0]={id:'email',name:'Newly scheduled invitation',status:'draft',scheduled_for:'2026-10-25T08:00:00Z'}
 mount('&page=calendar&date=2026-10-25')
 await screen.findByRole('heading',{name:'Marketing calendar'})
 expect(screen.queryByRole('heading',{name:'Newly scheduled invitation'})).toBeNull()
 runtime.workspace.channels.email.data[0].status='scheduled'
 fireEvent.click(screen.getByRole('button',{name:'Refresh calendar'}))
 await screen.findByRole('heading',{name:'Newly scheduled invitation'})
 expect(screen.getByRole('heading',{name:/25 October|October 25/})).toBeTruthy()
})
it('customises a bundled email starter without requiring saved-template storage', async () => {
 runtime.channelLoad.mockRejectedValue(new Error('Channel template storage is not enabled in this environment yet.'))
 mount('&page=studio&format=email')
 await screen.findByRole('heading', { name: 'Email templates', exact: true })
 expect(screen.queryByText('Brand & campaign setup')).toBeNull()
 const allFormats = screen.getByRole('button', { name: 'All marketing formats' })
 expect(allFormats.closest('.mc-studio-actions')).toBeTruthy()
 fireEvent.click(screen.getByRole('button', { name: 'Customise Property showcase' }))
 expect(screen.getByLabelText('Email subject').value).toBe('Your next chapter in [area]')
 fireEvent.change(screen.getByLabelText('Message content'), { target: { value: 'My personal property invitation' } })
 fireEvent.click(screen.getByRole('button', { name: 'Use in campaign' }))
 await screen.findByRole('heading', { name: 'What do you want to achieve?' })
 expect(runtime.channelSave).not.toHaveBeenCalled()
 next()
 expect(screen.getByLabelText('Email draft message').value).toBe('My personal property invitation\n\nExplore the property')
})
it.each([['meta', 'meta-valuation'], ['social', 'social-listing'], ['chatgpt', 'chatgpt-property']])('starts a %s campaign from bundled copy without saved-template storage', async (format, starter) => {
 runtime.channelLoad.mockRejectedValue(new Error('Channel template storage is not enabled in this environment yet.'))
 mount(`&page=studio&format=${format}&view=channel-template-create&starter=${starter}`)
 await screen.findByRole('heading', { name: 'Edit channel template' })
 expect(screen.getByLabelText('Channel').value).toBe(format)
 fireEvent.change(screen.getByLabelText(['meta', 'chatgpt'].includes(format) ? 'Primary ad text' : 'Post caption'), { target: { value: 'My tailored social content' } })
 fireEvent.click(screen.getByRole('button', { name: 'Use in campaign' }))
 await screen.findByRole('heading', { name: 'What do you want to achieve?' })
 next()
 expect(screen.getByLabelText(format === 'chatgpt' ? 'ChatGPT Ads draft message' : format === 'meta' ? 'Meta draft message' : 'Organic social draft message').value).toContain('My tailored social content')
 expect(runtime.channelSave).not.toHaveBeenCalled()
})

it('opens enquiries and follow-up inside the selected campaign workspace', async () => {
  mount('&view=detail&id=plan')
  expect(await screen.findByRole('region', { name: 'Campaign work queue' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Enquiries & follow-up' }))
  expect(await screen.findByText('Campaign enquiry workspace')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Enquiries & follow-up' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('heading', { name: 'Summer sellers' })).toBeTruthy()
})

it('opens the shared CRM audience library from the campaigns header', async () => {
  render(<MemoryRouter><MarketingCampaigns /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'CRM audiences' }))
  expect(await screen.findByText('Shared CRM audience library')).toBeTruthy()
})

it('opens the complete playbook inside the current campaign workspace', async () => {
  render(<MemoryRouter initialEntries={['/?section=campaigns&view=detail&id=plan&tab=playbook']}><MarketingCampaigns /></MemoryRouter>)
  expect(await screen.findByRole('region',{name:'Campaign playbook'})).toBeTruthy()
  expect(screen.getByRole('button',{name:'Playbook'}).getAttribute('aria-current')).toBe('page')
  expect(screen.getByText('Suggested plan · review and save')).toBeTruthy()
  expect(screen.getByText('Free valuation')).toBeTruthy()
})
