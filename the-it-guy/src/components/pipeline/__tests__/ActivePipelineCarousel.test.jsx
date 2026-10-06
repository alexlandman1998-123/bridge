// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActivePipelineCard, StageProgressTracker } from '../ActivePipelineCarousel.jsx'
import { deriveResidentialDashboardMetrics } from '../../../services/residentialDashboardService.js'

afterEach(cleanup)

const record = {
  id: 'tx-1',
  title: 'Junoah Estate · Unit 002',
  value: 2200000,
  clientName: 'Buyer One',
}

function expectProgress(percent, label) {
  expect(document.querySelector('[style*="width"]').style.width).toBe(`calc(${percent / 100} * (100% - 24px))`)
  const progress = screen.getByRole('progressbar', { name: 'Transaction progress' })
  expect(progress.getAttribute('aria-valuenow')).toBe(String(percent))
  expect(progress.getAttribute('aria-valuetext')).toBe(label)
  expect(progress.querySelector('[aria-current="step"]').nextElementSibling.textContent).toBe(label === 'Unconditional' ? 'Uncond.' : label === 'Settled / Pending Reg.' ? 'Settled' : label)
}

describe('desktop transaction card progress', () => {
  it.each([
    ['AVAIL', 'Available', 0, 'New Listing'],
    ['DEP', 'Deposit', 25, 'Under Offer'],
    ['OTP', 'OTP', 25, 'Under Offer'],
    ['FIN', 'Finance', 50, 'Conditional'],
    ['ATTY', 'Transfer Preparation', 75, 'Unconditional'],
    ['XFER', 'Transfer', 75, 'Unconditional'],
    ['REG', 'Registered', 100, 'Settled / Pending Reg.'],
  ])('renders the developer dashboard stage %s', (stageKey, status, percent, label) => {
    const model = deriveResidentialDashboardMetrics({
      scope: 'agent',
      source: { activeTransactions: [{ ...record, stageKey, status }] },
    })
    const row = model.activeTransactions.rows[0]
    render(<ActivePipelineCard mode="residential_sales" record={{ ...record, ...row, statusLabel: row.status }} />)
    expect(screen.getByText(status)).toBeTruthy()
    expectProgress(percent, label)
  })

  it.each([
    ['Offer Accepted', 25, 'Under Offer'],
    ['OTP Signed', 25, 'Under Offer'],
    ['Finance Pending', 50, 'Conditional'],
    ['Bond Approved / Proof of Funds', 50, 'Conditional'],
    ['Proceed to Attorneys', 75, 'Unconditional'],
    ['Transfer in Progress', 75, 'Unconditional'],
    ['Transfer Lodged', 100, 'Settled / Pending Reg.'],
    ['Registration', 100, 'Settled / Pending Reg.'],
    ['ready_for_registration', 100, 'Settled / Pending Reg.'],
  ])('uses the status %s when a dashboard row has no stage key', (statusLabel, percent, label) => {
    render(<ActivePipelineCard mode="residential_sales" record={{ ...record, statusLabel }} />)
    expectProgress(percent, label)
  })

  it('advances when the saved transaction stage changes', () => {
    const { rerender } = render(<ActivePipelineCard mode="residential_sales" record={{ ...record, stageKey: 'OTP' }} />)
    expectProgress(25, 'Under Offer')
    rerender(<ActivePipelineCard mode="residential_sales" record={{ ...record, stageKey: 'FIN' }} />)
    expectProgress(50, 'Conditional')
    rerender(<ActivePipelineCard mode="residential_sales" record={{ ...record, stageKey: 'XFER' }} />)
    expectProgress(75, 'Unconditional')
    rerender(<ActivePipelineCard mode="residential_sales" record={{ ...record, stageKey: 'REG' }} />)
    expectProgress(100, 'Settled / Pending Reg.')
  })

  it('prefers a recognised stage key over an older display label', () => {
    render(<ActivePipelineCard mode="residential_sales" record={{ ...record, stageKey: 'unconditional', statusLabel: 'Finance' }} />)
    expectProgress(75, 'Unconditional')
  })

  it('resolves canonical codes for the standalone tracker too', () => {
    render(<StageProgressTracker mode="residential_sales" currentStageKey=" xfer " />)
    expectProgress(75, 'Unconditional')
  })

  it.each([
    ['residential_leasing', 'lease_signed', 75, 'Lease Signed'],
    ['commercial_sales', 'under_offer', 50, 'Under Offer'],
    ['commercial_leasing', 'heads_of_terms', 50, 'Heads of Terms'],
  ])('preserves %s stage ordering', (mode, stageKey, percent, label) => {
    render(<ActivePipelineCard mode={mode} record={{ ...record, stageKey }} />)
    const progress = screen.getByRole('progressbar', { name: 'Transaction progress' })
    expect(progress.getAttribute('aria-valuenow')).toBe(String(percent))
    expect(progress.getAttribute('aria-valuetext')).toBe(label)
  })
})
