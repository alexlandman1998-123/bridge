// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import CampaignSummaryCards from '../CampaignSummaryCards'
afterEach(cleanup)
const workspace = {
  campaigns: [
    { id: 'active', status: 'active' },
    { id: 'scheduled', status: 'scheduled' },
    { id: 'draft', status: 'draft' },
  ],
  activities: [],
  channels: {},
}
const card = (label) => within(screen.getByText(label).closest('div'))
it('counts current plans and keeps absent results unknown', () => {
  render(<CampaignSummaryCards workspace={workspace} />)
  expect(card('Active campaigns').getByText('1')).toBeTruthy()
  expect(card('Scheduled campaigns').getByText('1')).toBeTruthy()
  expect(card('Messages delivered').getByText('—')).toBeTruthy()
  expect(card('Email clicks').getByText('—')).toBeTruthy()
})
it('uses linked recorded results and preserves a real zero click count', () => {
  render(
    <CampaignSummaryCards
      workspace={{
        ...workspace,
        activities: [
          {
            campaign_id: 'active',
            channel: 'email',
            email_campaign_id: 'email',
          },
        ],
        channels: {
          email: {
            data: [
              { id: 'email', delivered: 120, clicked: 0, status: 'sent' },
              { id: 'unlinked', delivered: 900, clicked: 900 },
            ],
          },
        },
      }}
    />,
  )
  expect(card('Messages delivered').getByText('120')).toBeTruthy()
  expect(card('Email clicks').getByText('0')).toBeTruthy()
  expect(screen.queryByText('900')).toBeNull()
})

it('labels local mock totals as demo analytics', () => {
  render(
    <CampaignSummaryCards
      workspace={{
        ...workspace,
        campaigns: [
          {
            id: '2772ee16-2b06-47f3-afa7-322ebeefc303',
            organisation_id: '13c6b79f-1d8b-4886-aabf-42ea49565ef5',
            status: 'active',
          },
        ],
      }}
    />,
  )
  expect(screen.getByText('2,360')).toBeTruthy()
  expect(screen.getByText('186')).toBeTruthy()
  expect(screen.getAllByText('Demo')).toHaveLength(2)
  expect(screen.getAllByText('Demo data · 1 mock campaign')).toHaveLength(2)
})
