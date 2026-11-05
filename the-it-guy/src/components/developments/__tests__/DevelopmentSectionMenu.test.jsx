// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Users, ShieldCheck } from 'lucide-react'
import DevelopmentSectionMenu from '../DevelopmentSectionMenu.jsx'
afterEach(cleanup)
it('renders exactly two matching menu buttons with the selected section and working navigation', () => {
  const onChange = vi.fn()
  const items = [{ id: 'leads', label: 'Leads', icon: Users }, { id: 'reservations', label: 'Reservations', icon: ShieldCheck }]
  const view = render(<DevelopmentSectionMenu label="Lead workspace sections" items={items} value="leads" onChange={onChange} />)
  const nav = screen.getByRole('navigation', { name: 'Lead workspace sections' })
  expect(within(nav).getAllByRole('button')).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Leads' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('button', { name: 'Reservations' }))
  expect(onChange).toHaveBeenCalledWith('reservations')
  view.rerender(<DevelopmentSectionMenu label="Lead workspace sections" items={items} value="reservations" onChange={onChange} />)
  expect(screen.getByRole('button', { name: 'Reservations' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('button', { name: 'Leads' }).hasAttribute('aria-current')).toBe(false)
})
