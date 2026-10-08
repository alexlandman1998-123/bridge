// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppErrorBoundary from '../AppErrorBoundary.jsx'

vi.mock('../../services/observability/errorTracking', () => ({ reportError: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function FailedPage({ error }) {
  throw error
}

function renderFailure(error, props = {}) {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  return render(<MemoryRouter><AppErrorBoundary {...props}><FailedPage error={error} /></AppErrorBoundary></MemoryRouter>)
}

it('shows local module failures without claiming a new release or starting automatic recovery', () => {
  vi.stubEnv('DEV', true)
  const recover = vi.spyOn(AppErrorBoundary.prototype, 'recoverFromStaleChunk').mockImplementation(() => {})
  renderFailure(new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1:5174/src/pages/Dashboard.jsx'))
  expect(screen.getByRole('heading', { name: 'This page couldn’t load locally' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Refresh Page' })).toBeTruthy()
  expect(screen.getByText(/Check the server output/)).toBeTruthy()
  expect(screen.queryByText(/newer version of Arch9/)).toBeNull()
  expect(recover).not.toHaveBeenCalled()
})

it('retains automatic recovery and the refresh action for production chunk failures', () => {
  vi.stubEnv('DEV', false)
  const recover = vi.spyOn(AppErrorBoundary.prototype, 'recoverFromStaleChunk').mockImplementation(() => {})
  renderFailure(new TypeError('Failed to fetch dynamically imported module: https://app.arch9.co.za/assets/Dashboard-old.js'))
  expect(recover).toHaveBeenCalledExactlyOnceWith()
  expect(screen.getByRole('heading', { name: 'Loading the latest app version' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Refresh App' })).toBeTruthy()
})

it('continues to honour the production recovery opt-out', () => {
  vi.stubEnv('DEV', false)
  const recover = vi.spyOn(AppErrorBoundary.prototype, 'recoverFromStaleChunk').mockImplementation(() => {})
  renderFailure(new TypeError('Failed to fetch dynamically imported module: /assets/Dashboard-old.js'), { autoRecoverStaleChunks: false })
  expect(recover).not.toHaveBeenCalled()
})
