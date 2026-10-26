// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MarketingCampaigns from '../MarketingCampaigns'
const runtime = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  templateLoad: vi.fn(),
  templateSave: vi.fn(),
  choices: vi.fn(),
  source: vi.fn(),
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
const mount = (query = '') =>
  render(
    <MemoryRouter initialEntries={[`/marketing?section=campaigns${query}`]}>
      <MarketingCampaigns />
    </MemoryRouter>,
  )
beforeEach(() => {
  runtime.org = 'agency'
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
    campaigns: [plan],
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
  fireEvent.change(await screen.findByLabelText('Campaign name'), {
    target: { value: 'Winter buyers' },
  })
  fireEvent.change(screen.getByLabelText('Planned budget (ZAR)'), {
    target: { value: '1250.50' },
  })
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
  fireEvent.change(await screen.findByLabelText('Campaign name'), {
    target: { value: 'Keep this draft' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  await screen.findByRole('alert')
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
  mount('&view=detail&id=plan&tab=activity')
  await screen.findByRole('heading', { name: 'Summer sellers' })
  expect(screen.queryByRole('button', { name: 'Edit campaign' })).toBeNull()
  expect(screen.queryByLabelText('Link existing Email campaign')).toBeNull()
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
  expect(screen.getByLabelText('How should this campaign run?').value).toBe(
    'ongoing',
  )
  expect(screen.queryByLabelText('End date')).toBeNull()
  expect(
    screen.getByText(/birthday triggers are not automated yet/),
  ).toBeTruthy()
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
  await screen.findByRole('heading', { name: 'November drive' })
  fireEvent.click(screen.getByRole('button', { name: 'Ongoing', exact: true }))
  expect(screen.getByRole('heading', { name: 'Always connected' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'November drive' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Summer sellers' })).toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: 'Time-bound', exact: true }),
  )
  expect(screen.getByRole('heading', { name: 'November drive' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Always connected' })).toBeNull()
})
it('clears the end date when a time-bound template becomes ongoing', async () => {
  mount('&view=create')
  fireEvent.change(await screen.findByLabelText('Campaign name'), {target:{value:'Seller valuation campaign'}})
  expect(screen.getByLabelText('End date').required).toBe(true)
  fireEvent.change(screen.getByLabelText('How should this campaign run?'), {
    target: { value: 'ongoing' },
  })
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
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
  await screen.findByRole('heading', { name: 'Campaign templates' })
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
  expect(screen.getByLabelText('Start date').value).not.toBe('')
  expect(screen.getByLabelText('End date').value).not.toBe('')
  expect(screen.getByLabelText('Email draft message').value).toBe(
    'See [listing link]',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
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
