// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
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
const runtime = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../../services/generalCampaignService', () => ({
  loadGeneralCampaignContext: runtime.load,
}))
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
