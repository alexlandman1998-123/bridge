// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentConveyancingJourney from '../AgentConveyancingJourney.jsx'
import DeveloperConveyancingJourney from '../DeveloperConveyancingJourney.jsx'

afterEach(cleanup)
const result = {
  status: 'ready',
  planRequired: true,
  snapshot: {
    transactionId: 'tx-1', revision: 7,
    legalProgress: { percent: 33 },
    lanes: ['transfer', 'bond', 'cancellation'].map(key => ({
      key, progress: { completedCount: 1, applicableCount: 3 },
      phases: [
        { key: 'instruction', label: 'Instruction', progress: { completedCount: 1, applicableCount: 1, notApplicableCount: 0 }, tasks: [{ id: `${key}-instruction`, label: `${key} instruction received`, status: 'completed_externally' }] },
        { key: 'documents', label: 'Documents', progress: { completedCount: 0, applicableCount: 1, notApplicableCount: 1 }, tasks: [{ id: `${key}-documents`, label: `${key} document review`, status: 'waiting' }, { id: `${key}-na`, label: `${key} exemption`, status: 'not_applicable' }] },
        { key: 'lodgement', label: 'Lodgement', progress: { completedCount: 0, applicableCount: 1, notApplicableCount: 0 }, tasks: [{ id: `${key}-lodgement`, label: `${key} lodgement`, status: 'not_started' }] },
      ],
    })),
  },
}

describe.each([['agent', AgentConveyancingJourney], ['developer', DeveloperConveyancingJourney]])('%s horizontal conveyancing', (_role, Component) => {
  it('shows saved progress and switches phases independently for each legal lane', () => {
    const onOpenActivity = vi.fn()
    render(<Component result={result} onOpenActivity={onOpenActivity} />)
    const transfer = screen.getByRole('navigation', { name: 'Transfer phases' })
    expect(transfer.className).toContain('overflow-x-auto')
    expect(within(transfer).getByRole('button', { name: /Documents/ }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('transfer document review')).toBeTruthy()
    expect(screen.getByText('bond document review')).toBeTruthy()
    fireEvent.click(within(transfer).getByRole('button', { name: /Instruction/ }))
    expect(screen.getByText('transfer instruction received')).toBeTruthy()
    expect(screen.getByText('Completed externally')).toBeTruthy()
    expect(screen.queryByText('transfer document review')).toBeNull()
    expect(screen.getByText('bond document review')).toBeTruthy()
    expect(within(transfer).getByRole('button', { name: /Instruction/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Mark Complete' })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View updates' })).toBeNull()
    expect(screen.queryByText(/Saved conveyancing tasks are shown below/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Conveyancing', exact: true })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Legal journey', exact: true })).toBeNull()
    expect(screen.queryByText('33% complete')).toBeNull()
    for (const [label, heading, task] of [
      ['Transfer', 'Transfer workflow', 'transfer document review'],
      ['Bond registration', 'Bond workflow', 'bond document review'],
      ['Bond cancellation', 'Cancellation attorney workflow', 'cancellation document review'],
    ]) {
      const card = screen.getByRole('region', { name: label, exact: true })
      expect(card.className).toContain('rounded-xl border')
      expect(within(card).getByRole('heading', { name: heading })).toBeTruthy()
      if (label !== 'Transfer') expect(within(card).getByText(task)).toBeTruthy()
    }
  })

  it('retains ready saved tasks during refresh and reports unavailable data without inventing stages', () => {
    const { rerender } = render(<Component result={result} />)
    rerender(<Component result={result} loading />)
    expect(screen.getByText('transfer document review')).toBeTruthy()
    expect(screen.queryByText('Loading legal journey…')).toBeNull()
    rerender(<Component result={{ status: 'unavailable' }} />)
    expect(screen.getByText(/Legal journey unavailable/)).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Transfer phases' })).toBeNull()
  })

  it('follows the first unfinished attorney phase even when a later phase is waiting, then reflects saved completion', () => {
    const fresh = structuredClone(result)
    const first = fresh.snapshot.lanes[0].phases[0]
    first.tasks[0].status = 'not_started'
    first.progress.completedCount = 0
    const { rerender } = render(<Component result={fresh} />)
    const phases = screen.getByRole('navigation', { name: 'Transfer phases' })
    expect(within(phases).getByRole('button', { name: /Instruction/ }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('transfer instruction received')).toBeTruthy()
    const updated = structuredClone(fresh)
    updated.snapshot.revision += 1
    updated.snapshot.lanes[0].phases[0].tasks[0].status = 'completed_externally'
    updated.snapshot.lanes[0].phases[0].progress.completedCount = 1
    rerender(<Component result={updated} />)
    expect(within(phases).getByRole('button', { name: /Documents/ }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('transfer document review')).toBeTruthy()
  })
})
