// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CampaignAnalytics from '../CampaignAnalytics'
afterEach(cleanup)
const data = {
  campaigns: [{ id: 'one', name: 'Seller drive' }],
  activities: [
    { campaign_id: 'one', channel: 'email', email_campaign_id: 'e' },
    { campaign_id: 'one', channel: 'whatsapp', whatsapp_campaign_id: 'w' },
  ],
  channels: {
    email: { data: [{ id: 'e', delivered: 100, clicked: 25, status: 'sent' }] },
    whatsapp: { data: [{ id: 'w', delivered: 50, read: 40, status: 'sent' }] },
  },
}
const mount = (workspace) =>
  render(
    <MemoryRouter>
      <CampaignAnalytics workspace={workspace} />
    </MemoryRouter>,
  )
it('switches ranking measures without comparing clicks to reads, and explains the recommendation', () => {
  mount(data)
  expect(screen.getByText('25 clicks / 100 delivered')).toBeTruthy()
  expect(screen.getByText('Click rate')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'WhatsApp', exact: true }))
  expect(screen.getByText('40 reads / 50 delivered')).toBeTruthy()
  expect(screen.getByText('Read rate')).toBeTruthy()
  expect(screen.queryByText('25 clicks / 100 delivered')).toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: 'Why this recommendation?' }),
  )
  expect(screen.getByText(/it is not a prediction/)).toBeTruthy()
  expect(
    screen
      .getByRole('link', { name: 'Explore campaign results' })
      .getAttribute('href'),
  ).toContain('id=one')
  expect(screen.getAllByText('Not connected')).toHaveLength(2)
})
it('renders useful empty states without invented metrics or recommendations', () => {
  mount({ campaigns: [], activities: [], channels: {} })
  expect(screen.getByRole('heading', { name: 'Arch9 recommends' })).toBeTruthy()
  expect(screen.getByText('Give your next campaign a head start.')).toBeTruthy()
  expect(
    screen
      .getByRole('link', { name: 'Explore campaign templates' })
      .getAttribute('href'),
  ).toContain('view=templates')
  expect(screen.queryByText('0.0%')).toBeNull()
})
