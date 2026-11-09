// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BondApplicationActionCentrePage from '../BondApplicationActionCentrePage.jsx'
const api = vi.hoisted(() => Object.fromEntries(['createBondOriginatorWorkspaceDocumentRequest','fetchBondApplicationOriginatorActionCentre','fetchBondApplicationPortalOriginatorDocumentContinuity','fetchBondApplicationSubmissionReadiness','fetchBondApplicationExternalSubmissions','fetchBondApplicationHandoff','fetchBondApplicationPortalDeliveryActionCentre','issueBondApplicationPortalAccessLinkForOriginator','revokeBondApplicationPortalAccessLinkForOriginator','sendBondApplicationPortalDeliveryForOriginator','assessBondApplicationSubmissionReadiness','recordBondApplicationExternalSubmission'].map(key => [key, vi.fn()])))
vi.mock('../../../domains/bond/portalApi.js', () => api)
vi.mock('../../../components/bond/BondApplicationHandoff.jsx', () => ({ default: () => <p>Document review remains accessible</p> }))
vi.mock('../../../components/bond/BondWetInkReviewQueue.jsx', () => ({ default: () => null }))
vi.mock('../../../components/bond/BondSubmissionPackPanel.jsx', () => ({ BondSubmissionPackWorkspace: () => null }))
const item = { exportPackageId: 'pkg', transactionId: 'tx', recipientName: 'Current buyer', actions: {} }
const open = () => render(<MemoryRouter><BondApplicationActionCentrePage /></MemoryRouter>)
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset().mockResolvedValue({ items: [] })
  api.fetchBondApplicationOriginatorActionCentre.mockResolvedValue({ items: [item] })
  api.fetchBondApplicationSubmissionReadiness.mockResolvedValue({ items: [{ exportPackageId: 'pkg', assessment: { status: 'ready', blockers: [] } }] })
})
afterEach(cleanup)
it('keeps accessible applications visible when an independent read fails, and names the failed section', async () => {
  api.fetchBondApplicationSubmissionReadiness.mockRejectedValue(new Error('Read interrupted'))
  open()
  await screen.findByText('Current buyer')
  expect(screen.getByText(/Submission readiness: Read interrupted/)).toBeTruthy()
  expect(screen.getByText('Document review remains accessible')).toBeTruthy()
  expect(screen.queryByText('No document handoff packages yet')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Record external submission' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Open assigned applications' }).getAttribute('href')).toBe('/bond/applications')
})
it('invalidates a previous ready result when a later readiness check fails', async () => {
  open()
  await screen.findByRole('button', { name: 'Record external submission' })
  api.fetchBondApplicationSubmissionReadiness.mockRejectedValue(new Error('Refresh failed'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }))
  await screen.findByText(/Submission readiness: Refresh failed/)
  expect(screen.queryByRole('button', { name: 'Record external submission' })).toBeNull()
  expect(screen.getByText('Current buyer')).toBeTruthy()
})
it('discards a slow older read after a newer refresh completes', async () => {
  let finishOld
  api.fetchBondApplicationOriginatorActionCentre.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }))
  await screen.findByText('Current buyer')
  await act(async () => { finishOld({ items: [{ ...item, recipientName: 'Outdated buyer' }] }) })
  expect(screen.queryByText('Outdated buyer')).toBeNull()
  expect(screen.getByText('Current buyer')).toBeTruthy()
})
it('refreshes cross-party changes when the user returns to the page', async () => {
  open()
  await screen.findByText('Current buyer')
  api.fetchBondApplicationOriginatorActionCentre.mockResolvedValue({ items: [{ ...item, recipientName: 'Updated buyer' }] })
  fireEvent.focus(window)
  await waitFor(() => expect(screen.getByText('Updated buyer')).toBeTruthy())
})
