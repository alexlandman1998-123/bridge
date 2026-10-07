// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DemoMaintenanceWorkspace from '../DemoMaintenanceWorkspace'
import DemoMoveWorkspace from '../DemoMoveWorkspace'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('filters maintenance providers and supports keyboard category navigation', () => {
  render(<DemoMaintenanceWorkspace propertyAddress="2 Pine Avenue" />)
  expect(screen.getByText('2 Pine Avenue')).toBeTruthy()
  expect(within(screen.getByRole('tabpanel')).getAllByRole('button')).toHaveLength(3)
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Plumbers' }), { key: 'ArrowRight' })
  const electrical = screen.getByRole('tab', { name: 'Electrical' })
  expect(electrical.getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(electrical)
  expect(screen.getByRole('button', { name: 'View Bright Spark services' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'View Flow & Co. services' })).toBeNull()
  fireEvent.keyDown(electrical, { key: 'End' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Garden' }))
  expect(screen.getByRole('button', { name: 'View Green Hands services' })).toBeTruthy()
  fireEvent.keyDown(document.activeElement, { key: 'Home' })
  expect(screen.getByRole('tab', { name: 'Plumbers' }).getAttribute('aria-selected')).toBe('true')
})

it('shows a service cost breakdown and resets selection when opening a different provider', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<DemoMaintenanceWorkspace />)
  fireEvent.click(screen.getByRole('button', { name: 'View Flow & Co. services' }))
  const dialog = screen.getByRole('dialog', { name: 'Flow & Co.' })
  expect(within(dialog).getByText('A little clarity on cost.')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('radio', { name: /Repair a leaking tap/ }))
  const estimate = within(dialog).getByRole('region', { name: 'Service estimate' })
  expect(within(estimate).getByText(/R\s+1\s+150/)).toBeTruthy()
  expect(within(estimate).getByText(/R\s+550/)).toBeTruthy()
  expect(within(estimate).getByText(/R\s+250/)).toBeTruthy()
  expect(within(estimate).getByText(/R\s+350/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('radio', { name: /Unblock a drain/ }))
  expect(within(estimate).getByText(/R\s+1\s+300/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }))
  fireEvent.click(screen.getByRole('button', { name: 'View The Tap Team services' }))
  const nextDialog = screen.getByRole('dialog', { name: 'The Tap Team' })
  expect(within(nextDialog).getByText('A little clarity on cost.')).toBeTruthy()
  fireEvent.click(within(nextDialog).getByRole('radio', { name: /Repair a leaking tap/ }))
  expect(within(nextDialog).getByText(/R\s+1\s+250/)).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
})

it('closes maintenance details with Escape and restores the provider card focus', async () => {
  render(<DemoMaintenanceWorkspace />)
  const trigger = screen.getByRole('button', { name: 'View Flow & Co. services' })
  trigger.focus()
  fireEvent.click(trigger)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' })))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

function enterRoute() {
  fireEvent.change(screen.getByRole('textbox', { name: 'From address' }), { target: { value: '18 Oak Road' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: truck size' }))
}

it('prefills the destination, validates both addresses and focuses the missing field', () => {
  render(<DemoMoveWorkspace propertyAddress="2 Pine Avenue" />)
  expect(screen.getByRole('textbox', { name: 'To address' }).value).toBe('2 Pine Avenue')
  fireEvent.click(screen.getByRole('button', { name: 'Next: truck size' }))
  expect(screen.getByRole('alert').textContent).toBe('Add both addresses to plan your move.')
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'From address' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'From address' }), { target: { value: '  2 pine avenue  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: truck size' }))
  expect(screen.getByRole('alert').textContent).toBe('Choose a different destination for your move.')
  expect(screen.queryByRole('button', { name: 'See quotes' })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'To address' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: truck size' }))
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'To address' }))
})

it('compares three quotes for each truck size and preserves the route when going back', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<DemoMoveWorkspace propertyAddress="2 Pine Avenue" />)
  enterRoute()
  expect(screen.getByRole('radio', { name: /Medium truck/ }).checked).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'A little space. Or a lot.' }))
  const prices = { Small: [2400, 2850, 3300], Medium: [3900, 4450, 5100], Large: [5600, 6300, 7100] }
  for (const [label, amounts] of Object.entries(prices)) {
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`${label} truck`) }))
    fireEvent.click(screen.getByRole('button', { name: 'See quotes' }))
    expect(screen.getAllByRole('button', { name: /View .* quote/ })).toHaveLength(3)
    for (const amount of amounts) {
      const formatted = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
      expect(screen.getByText(formatted.replace(/\s/g, ' '))).toBeTruthy()
    }
    expect(screen.getByText('18 Oak Road')).toBeTruthy()
    expect(screen.getByText('2 Pine Avenue')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
    expect(screen.getByRole('radio', { name: new RegExp(`${label} truck`) }).checked).toBe(true)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  expect(screen.getByRole('textbox', { name: 'From address' }).value).toBe('18 Oak Road')
  expect(screen.getByRole('textbox', { name: 'To address' }).value).toBe('2 Pine Avenue')
  expect(fetch).not.toHaveBeenCalled()
})

it('prefills the current home, allows corrections and retains them in the moving quote', () => {
  render(<DemoMoveWorkspace currentAddress="14 Ocean View Drive" propertyAddress="2 Pine Avenue" />)
  expect(screen.getByRole('textbox', { name: 'From address' }).value).toBe('14 Ocean View Drive')
  expect(screen.getByRole('textbox', { name: 'To address' }).value).toBe('2 Pine Avenue')
  expect(screen.getByText(/Your current and new home are already filled in/)).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: 'From address' }), { target: { value: '16 Ocean View Drive' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: truck size' }))
  fireEvent.click(screen.getByRole('button', { name: 'See quotes' }))
  fireEvent.click(screen.getByRole('button', { name: 'View Easy Street Movers quote' }))
  expect(within(screen.getByRole('dialog')).getByText('16 Ocean View Drive')).toBeTruthy()
  expect(within(screen.getByRole('dialog')).getByText('2 Pine Avenue')).toBeTruthy()
})

it('swaps the route and updates the quote summary after an edit', () => {
  render(<DemoMoveWorkspace propertyAddress="2 Pine Avenue" />)
  fireEvent.change(screen.getByRole('textbox', { name: 'From address' }), { target: { value: '18 Oak Road' } })
  fireEvent.click(screen.getByRole('button', { name: 'Swap from and to addresses' }))
  expect(screen.getByRole('textbox', { name: 'From address' }).value).toBe('2 Pine Avenue')
  expect(screen.getByRole('textbox', { name: 'To address' }).value).toBe('18 Oak Road')
  fireEvent.click(screen.getByRole('button', { name: 'Next: truck size' }))
  fireEvent.click(screen.getByRole('button', { name: 'See quotes' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit route' }))
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Where are we taking you?' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'To address' }), { target: { value: '20 Maple Lane' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next: truck size' }))
  fireEvent.click(screen.getByRole('button', { name: 'See quotes' }))
  expect(screen.getByText('20 Maple Lane')).toBeTruthy()
  expect(screen.queryByText('18 Oak Road')).toBeNull()
})

it('opens the selected moving quote with the exact size, route and price', async () => {
  render(<DemoMoveWorkspace propertyAddress="2 Pine Avenue" />)
  enterRoute()
  fireEvent.click(screen.getByRole('radio', { name: /Large truck/ }))
  fireEvent.click(screen.getByRole('button', { name: 'See quotes' }))
  const trigger = screen.getByRole('button', { name: 'View Nest to Nest quote' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Nest to Nest' })
  expect(within(dialog).getByText(/R\s+6\s+300/)).toBeTruthy()
  expect(within(dialog).getByText('Large truck · 24 m³')).toBeTruthy()
  expect(within(dialog).getByText('4 movers')).toBeTruthy()
  expect(within(dialog).getByText('18 Oak Road')).toBeTruthy()
  expect(within(dialog).getByText(/Sample local move within 30 km/)).toBeTruthy()
  expect(within(dialog).getByText(/Nothing is booked or sent/)).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' })))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
