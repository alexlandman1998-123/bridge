// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DemoInsuranceWorkspace from '../DemoInsuranceWorkspace'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('starts with combined cover and changes all three quotes to the selected category', () => {
  render(<DemoInsuranceWorkspace propertyAddress="2 Pine Avenue" />)
  expect(screen.getByText('2 Pine Avenue')).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Combined' }).getAttribute('aria-selected')).toBe('true')
  expect(within(screen.getByRole('tabpanel')).getAllByText('Building cover')).toHaveLength(3)
  expect(within(screen.getByRole('tabpanel')).getAllByText('Contents cover')).toHaveLength(3)
  fireEvent.click(screen.getByRole('tab', { name: 'Building' }))
  expect(within(screen.getByRole('tabpanel')).getAllByText('Building cover')).toHaveLength(3)
  expect(within(screen.getByRole('tabpanel')).queryByText('Contents cover')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Household contents' }))
  expect(within(screen.getByRole('tabpanel')).getAllByText('Contents cover')).toHaveLength(3)
  expect(within(screen.getByRole('tabpanel')).queryByText('Building cover')).toBeNull()
  expect(screen.getAllByRole('button', { name: /View .* household contents demo quote/ })).toHaveLength(3)
})

it('moves selection and focus together with arrow, Home and End keys', () => {
  render(<DemoInsuranceWorkspace />)
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Combined' }), { key: 'ArrowRight' })
  const building = screen.getByRole('tab', { name: 'Building' })
  expect(document.activeElement).toBe(building)
  expect(building.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(building, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Household contents' }))
  fireEvent.keyDown(document.activeElement, { key: 'End' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Combined' }))
  fireEvent.keyDown(document.activeElement, { key: 'Home' })
  expect(document.activeElement).toBe(building)
})

it('opens the exact insurer quote and restores focus when the dialog closes', async () => {
  render(<DemoInsuranceWorkspace />)
  const trigger = screen.getByRole('button', { name: 'View King Price combined demo quote' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'King Price · Combined' })
  expect(within(dialog).getByText(/R\s+579/)).toBeTruthy()
  expect(within(dialog).getByText('Building cover')).toBeTruthy()
  expect(within(dialog).getByText('Contents cover')).toBeTruthy()
  expect(within(dialog).getByText('Illustrative demo quote. No cover is purchased through this demo.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' })))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('prepares only selected extra cover locally and resets the summary when choices change', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<DemoInsuranceWorkspace />)
  const action = screen.getByRole('button', { name: 'Explore selected cover' })
  expect(action.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Car insurance' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Gap cover' }))
  fireEvent.click(action)
  expect(screen.getByRole('status').textContent).toContain('Demo selection ready: Car insurance, Gap cover.')
  expect(screen.getByRole('status').textContent).toContain('Nothing has been sent.')
  expect(screen.getByRole('checkbox', { name: 'Life insurance' }).checked).toBe(false)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Car insurance' }))
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Gap cover' }))
  expect(action.disabled).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})
