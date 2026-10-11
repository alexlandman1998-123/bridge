// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DevelopmentWebsiteAnalytics from '../DevelopmentWebsiteAnalytics'
import { buildHarbourHeightsWebsiteAnalyticsDemo, isHarbourHeightsAnalyticsDemo } from '../../../core/developments/harbourHeightsWebsiteAnalyticsDemo'

afterEach(cleanup)
const harbour = { id: '8b8d5c35-ba13-4175-a26b-cdec8f4c1891', name: 'Harbour Heights' }
const tracked = sessions => ({ summary: { sessions, sceneViews: sessions * 2, unitOpens: 3, enquiries: 1 }, units: [], scenes: [], dropoffs: [], devices: [{ device: 'mobile', sessions }] })

it('keeps Harbour Heights sample data labelled and separate from the real reader', async () => {
  const load = vi.fn().mockResolvedValue(tracked(17))
  render(<DevelopmentWebsiteAnalytics development={harbour} loadAnalytics={load} />)
  expect(screen.getByRole('status').textContent).toContain('Demo data · Harbour Heights')
  fireEvent.change(screen.getByLabelText('Analytics period'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(load).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Analytics data source'), { target: { value: 'tracked' } })
  await waitFor(() => expect(load).toHaveBeenCalledWith(harbour.id, { days: 7 }))
  await waitFor(() => expect(screen.getByRole('button', { name: /17 Sessions Recorded/ }).textContent).toContain('17'))
  expect(screen.getByRole('status').textContent).not.toContain('Demo data')
  fireEvent.change(screen.getByLabelText('Analytics data source'), { target: { value: 'demo' } })
  expect(screen.getByRole('status').textContent).toContain('Demo data')
  expect(screen.queryByRole('button', { name: /17 Sessions Recorded/ })).toBeNull()
})

it('ignores an older period response arriving after the newer one', async () => {
  const pending = new Map()
  const load = vi.fn((id, { days }) => new Promise(resolve => pending.set(days, resolve)))
  render(<DevelopmentWebsiteAnalytics development={{ id: 'real-development', name: 'Another development' }} loadAnalytics={load} />)
  await waitFor(() => expect(pending.has(30)).toBe(true))
  fireEvent.change(screen.getByLabelText('Analytics period'), { target: { value: '90' } })
  await waitFor(() => expect(pending.has(90)).toBe(true))
  await act(async () => pending.get(90)(tracked(901)))
  expect(screen.getByRole('button', { name: /901 Sessions Recorded/ })).toBeTruthy()
  await act(async () => pending.get(30)(tracked(301)))
  expect(screen.getByRole('button', { name: /901 Sessions Recorded/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /301 Sessions Recorded/ })).toBeNull()
  expect(screen.queryByLabelText('Analytics data source')).toBeNull()
})

it('shows unavailable data as unavailable and recovers from a read failure on refresh', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce(null).mockResolvedValueOnce(tracked(0))
  render(<DevelopmentWebsiteAnalytics development={{ id: 'real-development', name: 'Another development' }} loadAnalytics={load} />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: /— Sessions Recorded/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText(/Website analytics are unavailable/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText(/No website activity recorded in this period/)).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('provides coherent sample totals for every selectable period without broadening the demo to other developments', () => {
  expect(isHarbourHeightsAnalyticsDemo({ name: 'Harbour Heights Residences' })).toBe(true)
  expect(isHarbourHeightsAnalyticsDemo({ name: 'Harbour Heights Annex' })).toBe(false)
  expect(isHarbourHeightsAnalyticsDemo({ name: 'Another development' })).toBe(false)
  for (const days of [7, 30, 90]) {
    const data = buildHarbourHeightsWebsiteAnalyticsDemo(days)
    expect(data.periodDays).toBe(days)
    expect(data.devices.reduce((sum, device) => sum + device.sessions, 0)).toBe(data.summary.sessions)
    expect(data.units.reduce((sum, unit) => sum + unit.opens, 0)).toBe(data.summary.unitOpens)
    expect(data.scenes.reduce((sum, scene) => sum + scene.views, 0)).toBe(data.summary.sceneViews)
    expect(data.scenes.reduce((sum, scene) => sum + scene.enquiries, 0)).toBe(data.summary.enquiries)
    expect(data.dropoffs.reduce((sum, row) => sum + row.abandonments, 0)).toBe(data.summary.abandonments)
  }
})
