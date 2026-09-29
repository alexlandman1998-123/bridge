// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentConveyancingJourney from '../AgentConveyancingJourney.jsx'

const emptyJourney = { status: 'ready', snapshot: { lanes: [] } }
const partner = { id: 'firm-1', companyName: 'Transfer Firm', organisationId: 'org-1' }
afterEach(cleanup)

describe('imported transaction conveyancing', () => {
  it('allocates the selected partner without requiring buyer onboarding', async () => {
    const onAssignPartner = vi.fn().mockResolvedValue(undefined)
    render(<AgentConveyancingJourney result={emptyJourney} canAssignPartner partnerOptions={[partner]} onAssignPartner={onAssignPartner} onOpenActivity={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Allocate partner' })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Transfer partner'), { target: { value: partner.id } })
    fireEvent.click(button)
    await waitFor(() => expect(onAssignPartner).toHaveBeenCalledWith(partner))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Transfer firm nominated'))
    expect(screen.queryByText(/Send Onboarding/)).toBeNull()
  })

  it('shows a save error and allows another attempt', async () => {
    const onAssignPartner = vi.fn().mockRejectedValueOnce(new Error('Partner assignment failed')).mockResolvedValueOnce(undefined)
    render(<AgentConveyancingJourney result={emptyJourney} canAssignPartner partnerOptions={[partner]} onAssignPartner={onAssignPartner} />)
    fireEvent.change(screen.getByLabelText('Transfer partner'), { target: { value: partner.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Allocate partner' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Partner assignment failed')
    fireEvent.click(screen.getByRole('button', { name: 'Allocate partner' }))
    await waitFor(() => expect(onAssignPartner).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Transfer firm nominated'))
  })

  it('shows the pending firm state instead of offering a duplicate nomination', () => {
    render(<AgentConveyancingJourney result={emptyJourney} partnerPending assignedPartner="Transfer Firm" partnerOptions={[partner]} />)
    expect(screen.getByRole('status').textContent).toContain('Transfer Firm')
    expect(screen.queryByRole('button', { name: 'Allocate partner' })).toBeNull()
  })
})
