// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientActivityPanel from './ClientActivityPanel'
import ClientAttributionPanel from './ClientAttributionPanel'
import ClientCampaignPanel from './ClientCampaignPanel'
import { getLocalClientPreview } from '../../core/clients/localClientPreview'
import { loadClientActivity, logClientInteraction } from '../../services/clientActivityService'
import { loadClientAttribution } from '../../services/clientAttributionService'
import { loadClientCampaigns, logClientCampaignResponse } from '../../services/clientCampaignService'

vi.mock('../../services/clientActivityService', async original => ({ ...await original(), loadClientActivity: vi.fn(), logClientInteraction: vi.fn() }))
vi.mock('../../services/clientAttributionService', async original => ({ ...await original(), loadClientAttribution: vi.fn() }))
vi.mock('../../services/clientCampaignService', async original => ({ ...await original(), loadClientCampaigns: vi.fn(), logClientCampaignResponse: vi.fn() }))
const { client, preview } = getLocalClientPreview({ client: { organisationId: '322c3853-2d82-4413-97e6-b4cd8bc32a7c', email: 'alexlandman1998@gmail.com', name: 'Alexander Landman' } }, { development: true, hostname: 'localhost' })
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('preview activity filters locally and cannot log real interactions', async () => {
  render(<MemoryRouter><ClientActivityPanel client={client} previewData={preview.activity} /></MemoryRouter>)
  await screen.findByText('Bond approval received')
  expect(screen.getByRole('button', { name: 'Log interaction' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Activity filter'), { target: { value: 'appointment' } })
  await screen.findByText('Property viewing completed')
  expect(screen.queryByText('Bond approval received')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(loadClientActivity).not.toHaveBeenCalled()
  expect(logClientInteraction).not.toHaveBeenCalled()
})

test('preview sources show their full history without linking to fake enquiries', async () => {
  render(<MemoryRouter><ClientAttributionPanel client={client} previewData={preview.sources} /></MemoryRouter>)
  await screen.findByText('First known source')
  expect(screen.getAllByText('Preview enquiry')).toHaveLength(4)
  expect(screen.queryByRole('link', { name: 'Open enquiry' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' }))
  expect(loadClientAttribution).not.toHaveBeenCalled()
})

test('preview campaigns show delivery, tracking and replies without enabling real response writes', async () => {
  render(<ClientCampaignPanel client={client} previewData={preview.campaigns} />)
  await screen.findByText('Spring show-day invitation')
  expect(screen.getByText('Weekend property edit')).toBeTruthy()
  expect(screen.getByText('1 confirmed response')).toBeTruthy()
  expect(screen.getByText('3 recorded opens · 2 recorded clicks')).toBeTruthy()
  const responses = screen.getAllByRole('button', { name: /Record response for/ })
  expect(responses).toHaveLength(3)
  expect(responses.every(button => button.disabled)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh campaigns' }))
  expect(loadClientCampaigns).not.toHaveBeenCalled()
  expect(logClientCampaignResponse).not.toHaveBeenCalled()
})
