// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import DevelopmentLeadsKanban, { DevelopmentLeadViewSwitch } from '../DevelopmentLeadsKanban.jsx'

afterEach(cleanup)
const columns = [{ key: 'new', label: 'Captured' }, { key: 'viewing', label: 'Viewing' }, { key: 'otp', label: 'OTP' }]
const card = { id: 'developer-lead-1', columnKey: 'viewing', name: 'Buyer lead', contactLine: 'buyer@example.com', source: 'website', brand: {}, agent: { name: 'Alex Agent' }, stage: { label: 'Reserved', className: '' }, lastActivity: '09 Oct 2026', canOpen: true }

it('groups cards by stage without losing the actual status, source, agent or navigation', () => {
  const open = vi.fn()
  render(<DevelopmentLeadsKanban columns={columns} cards={[card]} onOpen={open} />)
  const viewing = screen.getByRole('region', { name: 'Viewing leads' })
  expect(within(viewing).getByText('Reserved')).toBeTruthy()
  expect(within(viewing).getByText('Alex Agent')).toBeTruthy()
  expect(within(viewing).getByText('buyer@example.com')).toBeTruthy()
  expect(screen.getAllByText('No leads in this stage')).toHaveLength(2)
  fireEvent.click(within(viewing).getByRole('button', { name: 'Open developer lead' }))
  expect(open).toHaveBeenCalledWith('developer-lead-1')
})

it('renders protected presentation without adding a navigation action for unlinked leads', () => {
  const open = vi.fn()
  render(<DevelopmentLeadsKanban columns={columns} cards={[{ ...card, id: 'source-only', columnKey: 'new', name: 'Protected buyer lead', contactLine: 'Contact hidden', canOpen: false, accessLabel: 'No developer lead link' }]} onOpen={open} />)
  expect(screen.getByText('Contact hidden')).toBeTruthy()
  expect(screen.getByText('No developer lead link')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  expect(open).not.toHaveBeenCalled()
})

it('switches views with accessible selected states and preserves the board cards on return', () => {
  function Workspace() {
    const [view, setView] = useState('list')
    return <><DevelopmentLeadViewSwitch value={view} onChange={setView} />{view === 'kanban' ? <DevelopmentLeadsKanban columns={columns} cards={[card]} /> : <table><tbody><tr><td>{card.name}</td></tr></tbody></table>}</>
  }
  render(<Workspace />)
  expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Kanban' }))
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.getByRole('button', { name: 'Kanban' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  expect(screen.getByRole('table')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Kanban' }))
  expect(within(screen.getByRole('region', { name: 'Viewing leads' })).getByText('Buyer lead')).toBeTruthy()
})

function transfer() {
  const values = new Map()
  return { setData: (key, value) => values.set(key, value), getData: key => values.get(key) || '', effectAllowed: '', dropEffect: '' }
}

it('moves an editable card by drag and drop and highlights its destination', () => {
  const move = vi.fn()
  render(<DevelopmentLeadsKanban columns={columns} cards={[{ ...card, canMove: true }]} onMove={move} />)
  const dataTransfer = transfer()
  fireEvent.dragStart(screen.getByRole('article', { name: 'Buyer lead' }), { dataTransfer })
  const captured = screen.getByRole('region', { name: 'Captured leads' })
  fireEvent.dragOver(captured, { dataTransfer })
  expect(captured.className).toContain('ring-2')
  fireEvent.drop(captured, { dataTransfer })
  expect(move).toHaveBeenCalledExactlyOnceWith(card.id, 'new')
  expect(captured.className).not.toContain('ring-2')
})

it('ignores external drops, its current column, protected cards and moves during saving', () => {
  const move = vi.fn()
  const view = render(<DevelopmentLeadsKanban columns={columns} cards={[{ ...card, canMove: true }]} onMove={move} />)
  const dataTransfer = transfer()
  dataTransfer.setData('application/x-arch9-development-lead', card.id)
  fireEvent.drop(screen.getByRole('region', { name: 'Captured leads' }), { dataTransfer })
  fireEvent.dragStart(screen.getByRole('article'), { dataTransfer })
  fireEvent.drop(screen.getByRole('region', { name: 'Viewing leads' }), { dataTransfer })
  expect(move).not.toHaveBeenCalled()
  view.rerender(<DevelopmentLeadsKanban columns={columns} cards={[{ ...card, canMove: false }]} onMove={move} />)
  expect(screen.getByRole('article').getAttribute('draggable')).toBe('false')
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.dragStart(screen.getByRole('article'), { dataTransfer })
  fireEvent.drop(screen.getByRole('region', { name: 'Captured leads' }), { dataTransfer })
  view.rerender(<DevelopmentLeadsKanban columns={columns} cards={[{ ...card, canMove: true }]} movingId={card.id} onMove={move} />)
  expect(screen.getByRole('combobox').disabled).toBe(true)
  expect(screen.getByRole('article').getAttribute('aria-busy')).toBe('true')
  expect(screen.getByText('Saving…')).toBeTruthy()
  fireEvent.dragStart(screen.getByRole('article'), { dataTransfer })
  fireEvent.drop(screen.getByRole('region', { name: 'Captured leads' }), { dataTransfer })
  expect(move).not.toHaveBeenCalled()
})

it('provides the same move action through a keyboard and touch select', () => {
  const move = vi.fn()
  render(<DevelopmentLeadsKanban columns={columns} cards={[{ ...card, canMove: true }]} onMove={move} />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Move Buyer lead to stage' }), { target: { value: 'otp' } })
  expect(move).toHaveBeenCalledExactlyOnceWith(card.id, 'otp')
  expect(screen.queryByRole('option', { name: 'Viewing' })).toBeNull()
})
