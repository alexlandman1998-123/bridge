// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BranchTopPerformers from '../BranchTopPerformers'

afterEach(cleanup)
const agents = Array.from({ length: 7 }, (_, index) => ({ id: `agent-${index}`, name: `Agent ${index}`, transactions: index, listings: 7 - index, commission: 12000 }))

it('ranks registered deals before listings, limits to five and preserves source order', () => {
  const { rerender } = render(<BranchTopPerformers agents={agents} />)
  expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([6, 5, 4, 3, 2].map((index) => `View Agent ${index}'s performance`))
  expect(agents[0].id).toBe('agent-0')
  rerender(<BranchTopPerformers agents={[{ id: 'b', name: 'B', transactions: 1, listings: 2 }, { id: 'a', name: 'A', transactions: 1, listings: 3 }]} />)
  expect(screen.getAllByRole('button')[0].getAttribute('aria-label')).toBe("View A's performance")
})

it('opens the selected agent and respects commission visibility', () => {
  const onOpenAgent = vi.fn()
  const { rerender } = render(<BranchTopPerformers agents={agents} onOpenAgent={onOpenAgent} />)
  expect(screen.getAllByRole('button')).toHaveLength(5)
  expect(screen.queryByText('Agent commission')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: "View Agent 6's performance" }))
  expect(onOpenAgent).toHaveBeenCalledWith(agents[6])
  rerender(<BranchTopPerformers agents={agents} canViewFinancials onOpenAgent={onOpenAgent} />)
  expect(screen.getAllByText('Agent commission')).toHaveLength(5)
})

it('keeps five places without inventing winners from zero or unavailable activity', () => {
  render(<BranchTopPerformers agents={[{ id: 'empty', name: 'No activity', transactions: 0, listings: 0 }, { id: 'unknown', transactions: null, listings: null }]} />)
  expect(screen.getAllByText('Awaiting performance')).toHaveLength(5)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByText('Leading the branch')).toBeNull()
})
