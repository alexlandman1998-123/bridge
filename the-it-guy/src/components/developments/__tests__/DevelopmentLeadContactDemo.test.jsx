// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DevelopmentLeadContactDemo from '../DevelopmentLeadContactDemo.jsx'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const tick = (milliseconds) => act(() => vi.advanceTimersByTime(milliseconds))
function open(channel) {
  render(<DevelopmentLeadContactDemo />)
  fireEvent.click(screen.getByRole('button', { name: 'Contact' }))
  tick(0)
  if (channel) fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${channel}`) }))
}

it('opens the sample buyer and three channels without opening the underlying lead', () => {
  const navigate = vi.fn()
  render(<div onClick={navigate}><DevelopmentLeadContactDemo /></div>)
  screen.getByRole('button', { name: 'Contact' }).focus()
  fireEvent.click(screen.getByRole('button', { name: 'Contact' }))
  tick(0)
  expect(screen.getByRole('dialog', { name: 'Contact lead' })).toBeTruthy()
  expect(screen.getByText('Sarah Williams')).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Contact channels' }).querySelectorAll('button')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: /^WhatsApp/ }))
  expect(navigate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Contact options' }))
  expect(screen.getByRole('dialog', { name: 'Contact lead' })).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Contact' }))
})

it('sends an editable WhatsApp message and simulates delivery, read receipt and a reply', () => {
  const request = vi.spyOn(globalThis, 'fetch')
  const external = vi.spyOn(window, 'open')
  open('WhatsApp')
  fireEvent.change(screen.getByRole('textbox', { name: 'WhatsApp message' }), { target: { value: 'Would Saturday suit you?' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send WhatsApp demo message' }))
  expect(screen.getByText('Would Saturday suit you?')).toBeTruthy()
  expect(screen.getByLabelText('Delivered in demo')).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'WhatsApp message' }).value).toBe('')
  tick(1800)
  expect(screen.getByLabelText('Read in demo')).toBeTruthy()
  expect(screen.getByText(/Saturday at 10:00 works perfectly/)).toBeTruthy()
  expect(request).not.toHaveBeenCalled()
  expect(external).not.toHaveBeenCalled()
})

it('edits an email, adds a sample brochure and simulates sending without contacting a service', () => {
  const request = vi.spyOn(globalThis, 'fetch')
  open('Email')
  fireEvent.change(screen.getByRole('textbox', { name: 'Subject' }), { target: { value: 'Your Saturday viewing' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Email message' }), { target: { value: 'See you on Saturday, Sarah.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add sample brochure' }))
  expect(screen.getByText('Harbour Heights brochure.pdf')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Send email' }))
  expect(screen.getByRole('button', { name: 'Sending…' }).disabled).toBe(true)
  tick(900)
  expect(screen.getByText('Email sent in demo')).toBeTruthy()
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Write another message' }))
  expect(screen.getByRole('textbox', { name: 'Email message' }).value).toBe('See you on Saturday, Sarah.')
})

it('simulates ringing and a connected call with working timer, mute, speaker, keypad and hangup', () => {
  const external = vi.spyOn(window, 'open')
  open('Phone')
  expect(screen.getByText('Dialling…')).toBeTruthy()
  tick(700)
  expect(screen.getByText('Ringing…')).toBeTruthy()
  tick(1800)
  expect(screen.getByText('Connected')).toBeTruthy()
  tick(3000)
  expect(screen.getByLabelText('Call duration').textContent).toBe('00:03')
  for (const label of ['Mute', 'Speaker', 'Keypad']) {
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true')
  }
  fireEvent.click(screen.getByRole('button', { name: 'Dial 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Dial #' }))
  expect(screen.getByLabelText('Dialled digits').textContent).toBe('1#')
  fireEvent.click(screen.getByRole('button', { name: 'End call' }))
  tick(3000)
  expect(screen.getByText('Call ended')).toBeTruthy()
  expect(screen.getByLabelText('Call duration').textContent).toBe('00:03')
  expect(external).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Call again' }))
  expect(screen.getByText('Dialling…')).toBeTruthy()
})

it('stops call timers when leaving the screen or closing the demo and resets on reopening', () => {
  const timer = vi.spyOn(globalThis, 'setTimeout')
  const cancel = vi.spyOn(globalThis, 'clearTimeout')
  open('Phone')
  const firstCallTimer = timer.mock.results[timer.mock.calls.findIndex((args) => args[1] === 700)].value
  fireEvent.click(screen.getByRole('button', { name: 'Contact options' }))
  expect(cancel).toHaveBeenCalledWith(firstCallTimer)
  tick(5000)
  timer.mockClear()
  fireEvent.click(screen.getByRole('button', { name: /^Phone/ }))
  expect(screen.getByText('Dialling…')).toBeTruthy()
  const secondCallTimer = timer.mock.results[timer.mock.calls.findIndex((args) => args[1] === 700)].value
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(cancel).toHaveBeenCalledWith(secondCallTimer)
  fireEvent.click(screen.getByRole('button', { name: 'Contact' }))
  expect(screen.getByRole('dialog', { name: 'Contact lead' })).toBeTruthy()
})
