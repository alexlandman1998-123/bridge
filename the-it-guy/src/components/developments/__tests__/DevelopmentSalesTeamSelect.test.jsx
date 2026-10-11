// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DevelopmentSalesTeamSelect from '../DevelopmentSalesTeamSelect.jsx'

afterEach(cleanup)
const agents = [
  { id: 'alex', userId: 'alex', name: 'Alex Agent', email: 'alex@example.test', avatarUrl: '/alex.jpg' },
  { id: 'sam', name: 'Sam Agent', email: 'sam@example.test' },
]
function Team() {
  const [selected, setSelected] = useState([{ name: 'Alex Agent', email: 'ALEX@example.test' }])
  return <DevelopmentSalesTeamSelect agents={agents} value={selected} onChange={setSelected} />
}

it('keeps bulk selection unique for a seeded agent, lets checkbox deselection remove cards and restores focus on Escape', () => {
  const escape = vi.fn()
  render(<div onKeyDown={escape}><Team /></div>)
  const trigger = screen.getByRole('button', { name: /Choose sales team/ })
  fireEvent.click(trigger)
  expect(screen.getByRole('checkbox', { name: 'Select Alex Agent' }).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Select all agents' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select all agents' }))
  expect(within(screen.getByRole('list', { name: 'Selected sales team' })).getAllByRole('listitem')).toHaveLength(2)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Sam Agent' }))
  expect(screen.queryByRole('button', { name: 'Remove Sam Agent from sales team' })).toBeNull()
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(escape).not.toHaveBeenCalled()
})

it('uses initials for broken photos, accepts a refreshed photo and closes when clicking outside', () => {
  const view = render(<DevelopmentSalesTeamSelect agents={agents} value={[agents[0]]} onChange={vi.fn()} />)
  const card = screen.getByRole('listitem')
  fireEvent.error(card.querySelector('img'))
  expect(card.querySelector('img')).toBeNull()
  expect(within(card).getByText('AA')).toBeTruthy()
  const updated = { ...agents[0], avatarUrl: '/new-alex.jpg' }
  view.rerender(<DevelopmentSalesTeamSelect agents={[updated]} value={[updated]} onChange={vi.fn()} />)
  expect(card.querySelector('img').getAttribute('src')).toBe('/new-alex.jpg')
  fireEvent.click(screen.getByRole('button', { name: /Choose sales team/ }))
  fireEvent.mouseDown(document.body)
  expect(screen.queryByRole('dialog')).toBeNull()
})
