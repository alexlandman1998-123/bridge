import { createContactProvenance, GENERAL_CONTACT_FIELDS } from '../../../services/campaignContactProvenance'
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import GeneralCampaignBuilder from '../GeneralCampaignBuilder'
import {
  cleanGeneralBuilder,
  generalCampaignCopy,
  generalDefaults,
} from '../../../services/generalCampaignModel'
const runtime = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), assistant: null, showAi: false, persisted: null, persistError: '' }))
vi.mock('../../../services/generalCampaignService', () => ({
  loadGeneralCampaignContext: runtime.load,
}))
vi.mock('../../../services/marketingCampaignService', () => ({ saveMarketingCampaign: runtime.save }))
vi.mock('../../../lib/featureFlags', () => ({ get SHOW_CAMPAIGN_WORKSPACE() { return runtime.showAi } }))
vi.mock('../AiBusinessCampaignAssistant', () => ({ default: (input) => {
  runtime.assistant = input
  return <section aria-label="Test business assistant"><button type="button" onClick={async () => { try { runtime.persisted = await input.persist() } catch (error) { runtime.persistError = error.message } }}>Persist reviewed AI source</button></section>
} }))
const agentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const source = {
  agencyName: 'Oak & Stone',
  agentName: 'Sarah',
  agentTitle: 'Property consultant',
  destination: 'sarah@example.test',
  language: 'en-ZA',
  setupLanguage: 'en-ZA',
  serviceAreas: 'Gardens',
}
const props = (template) => ({
  template,
  organisationId: 'agency',
  userId: agentId,
  onSave: vi.fn().mockResolvedValue(),
  onCancel: vi.fn(),
  onSetup: vi.fn(),
})
beforeEach(() => {
  vi.clearAllMocks()
  runtime.showAi = false
  runtime.assistant = null
  runtime.persisted = null
  runtime.persistError = ''
  runtime.save.mockImplementation(async (org, payload, existing) => ({ ...payload, organisation_id: org, revision: (existing?.revision || 0) + 1 }))
  runtime.load.mockImplementation(async (org, user, template) => ({
    agentId,
    source,
    areas: ['Gardens'],
    defaults: generalDefaults(
      template,
      { serviceAreas: ['Gardens'], offers: ['Property valuation'] },
      { bio: 'Public biography' },
    ),
  }))
})
afterEach(cleanup)
const continueSaved = async () =>
  fireEvent.click(
    await screen.findByRole('button', { name: /Continue with saved details/ }),
  )
const confirm = () =>
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I have reviewed these public details and campaign-specific facts.',
    }),
  )
it('saves a buyer registration campaign with no retyped profile, contact or area fields', async () => {
  const input = props('buyers')
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved()
  expect(screen.getByLabelText('Campaign area').value).toBe('Gardens')
  expect(screen.queryByLabelText('Public enquiry contact')).toBeNull()
  expect(screen.queryByLabelText('Public agent name')).toBeNull()
  confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await waitFor(() =>
    expect(input.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'buyer_leads',
        status: 'draft',
        campaign_builder: expect.objectContaining({
          template: 'buyers',
          agentId,
        }),
      }),
    ),
  )
  expect(runtime.load).toHaveBeenLastCalledWith(
    'agency',
    agentId,
    'buyers',
    agentId,
  )
})

it('keeps the business brief, manual wording and chosen next step in one saved campaign', async () => {
  const input = { ...props('client-check-in'), businessGoalId: 'client-nurture' }
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved()
  expect(screen.getByText('Stay connected · Business campaign')).toBeTruthy()
  confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  expect(screen.getByLabelText('Campaign workflow').textContent).toContain('Enquiries & follow-up')
  expect(screen.getByText(/No recipients are selected by this description/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Intended audience'), { target: { value: 'Previous Gardens clients who agreed to hear from me' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A personal check-in, with no invented anniversary.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save & choose audience' }))
  await waitFor(() => expect(input.onSave).toHaveBeenCalledWith(expect.objectContaining({
    goal: 'reengage',
    status: 'draft',
    audience: 'Previous Gardens clients who agreed to hear from me',
    planned_channels: ['social', 'email', 'whatsapp'],
    channel_content: expect.objectContaining({ social: expect.objectContaining({ body: 'A personal check-in, with no invented anniversary.' }) }),
  }), { tab: 'audience' }))
  expect(runtime.save).not.toHaveBeenCalled()
})

it('persists the reviewed AI source once and passes its real revision to the final audience save', async () => {
  runtime.showAi = true
  const input = props('buyers')
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved(); confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'My reviewed original buyer wording' } })
  fireEvent.click(screen.getByRole('button', { name: 'Persist reviewed AI source' }))
  await waitFor(() => expect(runtime.persisted?.revision).toBe(1))
  const retained = runtime.persisted
  expect(runtime.save).toHaveBeenCalledWith('agency', expect.objectContaining({ id: retained.id, channel_content: expect.objectContaining({ social: expect.objectContaining({ body: 'My reviewed original buyer wording' }) }) }), null)
  expect(input.onSave).not.toHaveBeenCalled()
  expect(screen.getByText(/AI works from this reviewed version/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'My newer buyer wording' } })
  expect(screen.queryByText(/AI works from this reviewed version/)).toBeNull()
  const proposed = { ...runtime.assistant.content, email: { ...runtime.assistant.content.email, title: 'A reviewed email proposal' } }
  act(() => runtime.assistant.onApply(proposed))
  fireEvent.click(screen.getByRole('button', { name: 'Save & choose audience' }))
  await waitFor(() => expect(input.onSave).toHaveBeenCalledWith(expect.objectContaining({
    id: retained.id,
    channel_content: expect.objectContaining({
      social: expect.objectContaining({ body: 'My newer buyer wording' }),
      email: expect.objectContaining({ title: 'A reviewed email proposal' }),
    }),
  }), { tab: 'audience', persistedCampaign: retained }))
  expect(runtime.save).toHaveBeenCalledTimes(1)
})

it('reuses the saved identity and next revision when requesting another business proposal', async () => {
  runtime.showAi = true
  render(<GeneralCampaignBuilder {...props('buyers')} />)
  await continueSaved(); confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Persist reviewed AI source' }))
  await waitFor(() => expect(runtime.persisted?.revision).toBe(1))
  const first = runtime.persisted
  fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'A newer reviewed title' } })
  fireEvent.click(screen.getByRole('button', { name: 'Persist reviewed AI source' }))
  await waitFor(() => expect(runtime.persisted?.revision).toBe(2))
  expect(runtime.save).toHaveBeenLastCalledWith('agency', expect.objectContaining({ id: first.id, channel_content: expect.objectContaining({ social: expect.objectContaining({ title: 'A newer reviewed title' }) }) }), first)
  expect(runtime.persisted.id).toBe(first.id)
})

it('returns the durable intermediate AI draft on cancel without overwriting newer unsaved wording', async () => {
  runtime.showAi = true
  const input = props('buyers')
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved(); confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Persist reviewed AI source' }))
  await waitFor(() => expect(runtime.persisted?.revision).toBe(1))
  const saved = runtime.persisted
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Unsaved later wording' } })
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(input.onCancel).toHaveBeenCalledWith({ persistedCampaign: saved })
  expect(input.onSave).not.toHaveBeenCalled()
  expect(runtime.save).toHaveBeenCalledTimes(1)
  expect(saved.channel_content.social.body).not.toBe('Unsaved later wording')
})

it('rechecks saved public contacts before persisting a business AI source', async () => {
  runtime.showAi = true
  render(<GeneralCampaignBuilder {...props('buyers')} />)
  await continueSaved(); confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  runtime.load.mockResolvedValue({ agentId, source: { ...source, destination: 'changed@example.test' }, areas: ['Gardens'] })
  fireEvent.click(screen.getByRole('button', { name: 'Persist reviewed AI source' }))
  await waitFor(() => expect(runtime.persistError).toMatch(/changed/i))
  expect(runtime.save).not.toHaveBeenCalled()
  expect(runtime.persisted).toBeNull()
  expect(screen.getByLabelText('Message').value).toContain(source.destination)
})

it('retains the manual campaign flow when the flagship assistant flag is off', async () => {
  render(<GeneralCampaignBuilder {...props('buyers')} />)
  await continueSaved(); confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  expect(screen.queryByLabelText('Test business assistant')).toBeNull()
  expect(screen.getByRole('button', { name: 'Save & choose audience' })).toBeTruthy()
  expect(screen.getByLabelText('Message')).toBeTruthy()
})

it('holds a legacy contact source for explicit refresh, then saves an intentionally reviewed campaign-only route', async () => {
  const legacyBuilder = { version: 1, template: 'buyers', agentId, source, details: { area: 'Gardens' }, reviewed: true }
  const input = { ...props('buyers'), campaign: { id: 'legacy', revision: 1, campaign_builder: legacyBuilder, channel_content: generalCampaignCopy(legacyBuilder) } }
  runtime.load.mockResolvedValue({ agentId, source: { ...source, destination: '' }, areas: ['Gardens'], defaults: { area: 'Gardens' } })
  render(<GeneralCampaignBuilder {...input} />)
  const refresh = await screen.findByRole('button', { name: 'Refresh public contacts and wording' })
  expect(screen.getByRole('button', { name: 'Confirm and preview' }).disabled).toBe(true)
  fireEvent.click(screen.getByText('Review the saved wording before refreshing'))
  expect(screen.getByText('Keep a copy of any manual text you want to use again.', { exact: false })).toBeTruthy()
  expect(input.campaign.channel_content.email.body).toContain(source.destination)
  fireEvent.click(refresh)
  await screen.findByLabelText('Public enquiry contact')
  fireEvent.change(screen.getByLabelText('Public enquiry contact'), { target: { value: 'this-campaign@example.test' } })
  confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await waitFor(() => expect(input.onSave).toHaveBeenCalledWith(expect.objectContaining({ campaign_builder: expect.objectContaining({ contactProvenance: { version: 1, source: { agentName: source.agentName, destination: '' }, overrides: { destination: 'this-campaign@example.test' }, confirmed: true } }) }), { persistedCampaign: input.campaign }))
  expect(input.campaign.campaign_builder).not.toHaveProperty('contactProvenance')
  expect(input.campaign.channel_content.email.body).toContain(source.destination)
})

it('keeps a changed public contact blocked even when the campaign has an explicit override', async () => {
  const input = props('buyers')
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Use a campaign-only enquiry contact' }))
  fireEvent.change(screen.getByLabelText('Public enquiry contact'), { target: { value: 'this-campaign@example.test' } })
  confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  runtime.load.mockResolvedValue({ agentId, source: { ...source, destination: '' }, areas: ['Gardens'] })
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  expect((await screen.findByRole('alert')).textContent).toContain('removed')
  expect(input.onSave).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Message').value).toContain('this-campaign@example.test')
})
it('opens market updates with empty fact fields and prevents unsourced content from reaching preview', async () => {
  render(<GeneralCampaignBuilder {...props('market-update')} />)
  await continueSaved()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('Reviewed market summary').value).toBe('')
  expect(
    screen.getByRole('button', { name: 'Confirm and preview' }).disabled,
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('Reviewed market summary'), {
    target: { value: 'Our reviewed summary' },
  })
  expect(
    screen.getByRole('button', { name: 'Confirm and preview' }).disabled,
  ).toBe(true)
})
it('requires exact testimonial permission and resets review after material changes', async () => {
  render(<GeneralCampaignBuilder {...props('client-success')} />)
  await continueSaved()
  for (const [label, value] of [
    ['Approved testimonial', 'Excellent service'],
    ['Approved public attribution', 'A local client'],
    ['Verified story context', 'A property sale'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  confirm()
  expect(
    screen.getByRole('button', { name: 'Confirm and preview' }).disabled,
  ).toBe(true)
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: /permission to publish this exact testimonial/,
    }),
  )
  confirm()
  expect(
    screen.getByRole('button', { name: 'Confirm and preview' }).disabled,
  ).toBe(false)
  fireEvent.change(screen.getByLabelText('Approved testimonial'), {
    target: { value: 'Different quote' },
  })
  expect(
    screen.getByRole('checkbox', {
      name: /permission to publish this exact testimonial/,
    }).checked,
  ).toBe(false)
  expect(
    screen.getByRole('checkbox', {
      name: 'I have reviewed these public details and campaign-specific facts.',
    }).checked,
  ).toBe(false)
})
it('retains edited wording after a save failure and uses a stable draft identity on retry', async () => {
  const input = props('buyers')
  input.onSave.mockRejectedValueOnce(new Error('Connection lost'))
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved()
  confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'My reviewed copy' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await screen.findByText('Connection lost')
  expect(screen.getByLabelText('Message').value).toBe('My reviewed copy')
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await waitFor(() => expect(input.onSave).toHaveBeenCalledTimes(2))
  expect(input.onSave.mock.calls[0][0].id).toBe(
    input.onSave.mock.calls[1][0].id,
  )
})
it('reopens saved wording and preserves budgets, while blocking changed contacts before saving', async () => {
  const b = cleanGeneralBuilder({
    version: 1,
    template: 'buyers',
    agentId,
    source,
    details: { area: 'Gardens' },
    contactProvenance: { ...createContactProvenance(source, GENERAL_CONTACT_FIELDS), confirmed: true },
    reviewed: true,
  })
  const copy = generalCampaignCopy(b)
  copy.social.body = 'Existing wording'
  const campaign = {
    id: 'saved',
    revision: 2,
    campaign_builder: b,
    channel_content: copy,
    planned_budget: 1000,
    budget_currency: 'ZAR',
  }
  const input = { ...props('buyers'), campaign }
  render(<GeneralCampaignBuilder {...input} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Confirm and preview' }),
  )
  expect(screen.getByLabelText('Message').value).toBe('Existing wording')
  runtime.load.mockResolvedValue({
    agentId,
    source: { ...source, destination: 'new@example.test' },
    areas: ['Gardens'],
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await screen.findByRole('alert')
  expect(input.onSave).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Message').value).toBe('Existing wording')
  runtime.load.mockResolvedValue({ agentId, source, areas: ['Gardens'] })
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await waitFor(() =>
    expect(input.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ planned_budget: 1000, budget_currency: 'ZAR' }),
      { persistedCampaign: campaign },
    ),
  )
})
it('ignores late source responses after the agency changes', async () => {
  let resolve
  runtime.load.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const input = props('buyers'),
    view = render(<GeneralCampaignBuilder {...input} />)
  view.rerender(
    <GeneralCampaignBuilder {...input} organisationId="other-agency" />,
  )
  await screen.findByRole('button', { name: /Continue with saved details/ })
  resolve({
    agentId,
    source: { ...source, agencyName: 'Wrong agency' },
    areas: ['Wrong area'],
    defaults: { area: 'Wrong area' },
  })
  await Promise.resolve()
  expect(screen.queryByText('Wrong agency')).toBeNull()
})
it('translates untouched starter checklists when choosing a supported draft language and preserves custom text', async () => {
  runtime.load.mockResolvedValue({
    agentId,
    source: { ...source, language: 'zu-ZA', setupLanguage: 'zu-ZA' },
    areas: ['Gardens'],
    defaults: generalDefaults(
      'first-time-buyer',
      { language: 'zu-ZA', serviceAreas: ['Gardens'] },
      {},
    ),
  })
  render(<GeneralCampaignBuilder {...props('first-time-buyer')} />)
  await continueSaved()
  fireEvent.change(screen.getByLabelText('Campaign language'), {
    target: { value: 'af-ZA' },
  })
  expect(screen.getByLabelText('Buyer checklist').value).toContain(
    'voorkeurgebiede',
  )
  fireEvent.change(screen.getByLabelText('Buyer checklist'), {
    target: { value: 'My reviewed custom checklist' },
  })
  fireEvent.change(screen.getByLabelText('Campaign language'), {
    target: { value: 'en-ZA' },
  })
  expect(screen.getByLabelText('Buyer checklist').value).toBe(
    'My reviewed custom checklist',
  )
})

it('prepares a private review request from the saved link without asking for client details', async () => {
  runtime.load.mockResolvedValue({
    agentId,
    source: { ...source, reviewUrl: 'https://example.test/review' },
    areas: ['Gardens'],
    defaults: { area: 'Gardens', reviewUrl: 'https://example.test/review' },
  })
  const input = props('review-request')
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved()
  expect(screen.getByLabelText('Review link').value).toBe(
    'https://example.test/review',
  )
  expect(screen.queryByLabelText(/client name/i)).toBeNull()
  confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  expect(
    screen.queryByRole('button', { name: 'Social', exact: true }),
  ).toBeNull()
  expect(
    screen
      .getByRole('button', { name: 'Email', exact: true })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  expect(screen.getByLabelText('Message').value).toContain(
    'https://example.test/review',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await waitFor(() =>
    expect(input.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'reengage',
        planned_channels: ['email', 'whatsapp'],
      }),
    ),
  )
})
it('selects only permitted handovers, leaves the approved name blank, and saves agency branding', async () => {
  const tx = '11111111-1111-4111-8111-111111111111'
  runtime.load.mockImplementation(
    async (org, user, family, id, details = {}) => ({
      agentId,
      source,
      areas: ['Gardens'],
      defaults: {
        area: 'Gardens',
        transactionId: '',
        variant: 'buyer',
        publicName: '',
        imageId: '',
      },
      transactions: [{ id: tx, reference: 'A9-100', area: 'Sea Point' }],
      transaction: details.transactionId ? { id: tx, area: 'Sea Point' } : null,
      images: [{ id: 'photo', url: 'https://example.test/photo.jpg' }],
    }),
  )
  const input = props('key-handover')
  render(<GeneralCampaignBuilder {...input} />)
  await continueSaved()
  expect(
    screen.getByRole('button', { name: 'Confirm and preview' }).disabled,
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('Completed transaction'), {
    target: { value: tx },
  })
  await waitFor(() =>
    expect(screen.getByLabelText('Campaign area').value).toBe('Sea Point'),
  )
  expect(screen.getByLabelText(/Approved public celebration name/).value).toBe(
    '',
  )
  expect(screen.getByLabelText('Celebration picture').value).toBe('')
  fireEvent.click(
    screen.getByRole('checkbox', { name: /keys have been handed over/ }),
  )
  confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and preview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save campaign draft' }))
  await waitFor(() =>
    expect(input.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_builder: expect.objectContaining({
          details: {
            area: 'Sea Point',
            transactionId: tx,
            variant: 'buyer',
            publicName: '',
            imageId: '',
          },
          permission: true,
        }),
      }),
    ),
  )
  expect(runtime.load).toHaveBeenLastCalledWith(
    'agency',
    agentId,
    'key-handover',
    agentId,
    expect.objectContaining({ transactionId: tx }),
  )
})
it('requires permission again after changing handover public material', async () => {
  const tx = '11111111-1111-4111-8111-111111111111'
  const details = {
    area: 'Gardens',
    transactionId: tx,
    variant: 'buyer',
    publicName: '',
    imageId: '',
  }
  runtime.load.mockResolvedValue({
    agentId,
    source,
    areas: ['Gardens'],
    defaults: details,
    transaction: { id: tx, area: 'Gardens' },
    transactions: [{ id: tx, area: 'Gardens', reference: 'A9-100' }],
    images: [],
  })
  render(<GeneralCampaignBuilder {...props('key-handover')} />)
  await continueSaved()
  const permission = screen.getByRole('checkbox', {
    name: /keys have been handed over/,
  })
  fireEvent.click(permission)
  fireEvent.change(screen.getByLabelText(/Approved public celebration name/), {
    target: { value: 'Approved Alex' },
  })
  expect(permission.checked).toBe(false)
  expect(
    screen.getByRole('button', { name: 'Confirm and preview' }).disabled,
  ).toBe(true)
})
