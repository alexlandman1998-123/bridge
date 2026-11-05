// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BuyerJourneyOverviewPanel from '../BuyerJourneyOverviewPanel.jsx'

afterEach(cleanup)

it('opens and closes setup without selecting or completing a journey stage', () => {
  const onStageSelect = vi.fn()
  function Journey() {
    const [open, setOpen] = useState(false)
    return <>
      <BuyerJourneyOverviewPanel stages={[{ key: 'qualified', label: 'Qualified', state: 'current' }]}
        transactionSetupOpen={open} onTransactionSetup={() => setOpen(true)}
        onCloseTransactionSetup={() => setOpen(false)} onStageSelect={onStageSelect} />
      {open ? <section id="buyer-journey-transaction-setup">Setup checklist</section> : null}
    </>
  }
  render(<Journey />)
  expect(screen.queryByText('Setup checklist')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Transaction setup' }))
  expect(screen.getByText('Setup checklist')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Close transaction setup' }).getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Close transaction setup' }))
  expect(screen.queryByText('Setup checklist')).toBeNull()
  expect(screen.getByRole('button', { name: 'Transaction setup' }).getAttribute('aria-expanded')).toBe('false')
  expect(onStageSelect).not.toHaveBeenCalled()
})
