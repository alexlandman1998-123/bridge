// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MobileDailyMomentum from '../MobileDailyMomentum.jsx'
import { DEFAULT_MOBILE_SOUND } from '../../../services/mobileMomentumService.js'
afterEach(cleanup)
const momentum = { available: true, model: { percent: 60, doneTasks: 4, totalTasks: 6, contacted: 3 }, settings: DEFAULT_MOBILE_SOUND, changeSettings: vi.fn(), preview: vi.fn() }

it('shows saved progress without a home sound control', () => {
  render(<MobileDailyMomentum momentum={momentum} />)
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60')
  expect(screen.getByRole('heading', { name: 'Today’s progress' })).toBeTruthy()
  expect(screen.getByText('4 of 6 tasks done · 3 buyers contacted')).toBeTruthy()
  expect(screen.queryByText('Sound off')).toBeNull()
  expect(screen.queryByLabelText('Play Arch9 sounds')).toBeNull()
})

it('never presents failed source data as a completed day', () => {
  const onRefresh = vi.fn()
  render(<MobileDailyMomentum momentum={{ ...momentum, available: false }} onRefresh={onRefresh} />)
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()
  expect(screen.queryByText('60%')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRefresh).toHaveBeenCalledOnce()
})
