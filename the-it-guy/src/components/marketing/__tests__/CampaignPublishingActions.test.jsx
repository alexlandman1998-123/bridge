// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import CampaignPublishingActions from '../CampaignPublishingActions'
const campaign = {
  name: 'Valuations',
  channel_content: {
    meta: { title: 'Headline', body: 'Saved wording' },
    social: { body: 'Social caption' },
  },
}
const brief = {
  campaign: 'Valuations',
  revision: 2,
  channel: 'Meta ads',
  headline: 'Checked headline',
  message: 'Checked wording',
  objective: 'Get leads',
  audience: 'Homeowners',
}
it('copies a checked ChatGPT ad draft and links to its own Ads Manager', async () => {
  const onLoadBrief = vi.fn().mockResolvedValue({ ...brief, channel: 'ChatGPT Ads' })
  render(<CampaignPublishingActions channel="chatgpt" campaign={{ ...campaign, channel_content: { chatgpt: { title: 'Home', body: 'Draft copy' } } }} onLoadBrief={onLoadBrief} />)
  expect(screen.getByRole('link', { name: 'Open ChatGPT Ads Manager' }).getAttribute('href')).toBe('https://ads.openai.com/')
  fireEvent.click(screen.getByRole('button', { name: 'Copy ad copy' }))
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith('Checked wording'))
  expect(onLoadBrief).toHaveBeenCalledWith('chatgpt')
  expect(screen.queryByRole('button', { name: /^(publish|activate)( ad)?$/i })).toBeNull()
})
let clipboard, createUrl, revokeUrl, click
beforeEach(() => {
  clipboard = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboard },
    configurable: true,
  })
  createUrl = vi.fn().mockReturnValue('blob:brief')
  revokeUrl = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', {
    value: createUrl,
    configurable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeUrl,
    configurable: true,
  })
  click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('copies freshly checked channel copy and exposes the publishing tool separately', async () => {
  const load = vi.fn().mockResolvedValue(brief)
  render(
    <CampaignPublishingActions
      channel="meta"
      campaign={campaign}
      onLoadBrief={load}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Copy ad copy' }))
  await screen.findByText('Message copied.')
  expect(load).toHaveBeenCalledWith('meta')
  expect(clipboard).toHaveBeenCalledWith('Checked wording')
  const link = screen.getByRole('link', { name: 'Open Ads Manager' })
  expect(link.getAttribute('href')).toBe('https://adsmanager.facebook.com/')
  expect(link.rel).toContain('noopener')
  expect(click).not.toHaveBeenCalled()
})
it('downloads a text brief with no automatic remote publishing or artwork fetch', async () => {
  render(
    <CampaignPublishingActions
      channel="social"
      campaign={campaign}
      onLoadBrief={vi
        .fn()
        .mockResolvedValue({ ...brief, channel: 'Organic social' })}
    />,
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Download publishing brief' }),
  )
  await screen.findByText(/Publishing brief downloaded/)
  expect(click).toHaveBeenCalledOnce()
  expect(createUrl).toHaveBeenCalledOnce()
  const blob = createUrl.mock.calls[0][0]
  expect(blob.type).toBe('text/plain;charset=utf-8')
  const text = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsText(blob)
  })
  expect(text).toContain('Checked wording')
  expect(text).toContain('does not create an ad')
  expect(clipboard).not.toHaveBeenCalled()
})
it('retains revision and permission errors, allowing retry without exporting unchecked copy', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('This campaign changed. Reload it.'))
    .mockResolvedValue(brief)
  render(
    <CampaignPublishingActions
      channel="meta"
      campaign={campaign}
      onLoadBrief={load}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Copy headline' }))
  await screen.findByRole('alert')
  expect(clipboard).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Copy headline' }))
  await waitFor(() =>
    expect(clipboard).toHaveBeenCalledWith('Checked headline'),
  )
})
it('keeps empty drafts disabled and offers a clear clipboard fallback', async () => {
  const view = render(
    <CampaignPublishingActions
      channel="social"
      campaign={{ channel_content: {} }}
      onLoadBrief={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'Copy caption' }).disabled).toBe(
    true,
  )
  expect(
    screen.getByRole('button', { name: 'Download publishing brief' }).disabled,
  ).toBe(true)
  clipboard.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
  view.rerender(
    <CampaignPublishingActions
      channel="social"
      campaign={campaign}
      onLoadBrief={vi.fn().mockResolvedValue(brief)}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Copy caption' }))
  await screen.findByText(/Clipboard unavailable/)
})
