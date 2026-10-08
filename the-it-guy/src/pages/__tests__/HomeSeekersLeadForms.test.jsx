// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomeSeekersDemo from '../HomeSeekersDemo'
import HomeSeekersContact from '../HomeSeekersContact'
import HomeSeekersValuationModal from '../HomeSeekersValuationModal'
import HomeSeekersLeadForm from '../HomeSeekersLeadForm'
import HomeSeekersProperty from '../HomeSeekersProperty'
import { submitHomeSeekersLead, useHomeSeekersLeadSubmission } from '../homeSeekersWebsiteData'

const id = 'ffec99be-27f8-4bba-ae3f-76b37b4bd9c1'
const details = { type: 'general_enquiry', name: 'Fixture Visitor', email: 'visitor@example.test', privacyAccepted: true, message: 'Please help with my next move.' }
const response = (status = 201, body = { accepted: true }) => ({ ok: status < 400, status, json: async () => body })
let requests
beforeEach(() => {
  requests = []
  window.history.replaceState({}, '', '/demo/homeseekers')
  sessionStorage.clear()
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn(() => true) })
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url === '/api/home-seekers/site') return response(200, { listings: [{ id, title: 'Approved property', transactionType: 'rental', price: 12000, images: [], description: 'Published rental description' }] })
    requests.push(JSON.parse(options.body))
    return response()
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function fill(form, changes = {}) {
  const values = { name: 'Fixture Visitor', email: 'visitor@example.test', phone: '0820000000', message: 'Please help with my next move.', propertyAddress: '12 Fixture Road, Pretoria', ...changes }
  for (const [name, value] of Object.entries(values)) {
    const field = form.querySelector(`[name="${name}"]`)
    if (field) fireEvent.change(field, { target: { value } })
  }
  fireEvent.click(form.querySelector('[name="privacy"]'))
}

it.each(['buy', 'sell', 'rent'])('homepage records the visitor’s %s intent with consent', async (intent) => {
  render(<HomeSeekersDemo />)
  const form = screen.getByRole('button', { name: 'Send enquiry' }).closest('form')
  fill(form, { interest: intent })
  fireEvent.submit(form)
  await screen.findByText('Message received. We will be in touch shortly.')
  expect(requests[0]).toMatchObject({ type: 'general_enquiry', leadIntent: intent, privacyAccepted: true })
  expect(requests[0].pageUrl).toContain('/demo/homeseekers')
  expect(requests[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
})

it.each([['Renting a home', 'rent'], ['Selling a home', 'sell'], ['Buying a home', 'buy']])('contact enquiry retains %s', async (interest, intent) => {
  window.history.replaceState({}, '', '/demo/homeseekers/contact')
  render(<HomeSeekersContact />)
  const form = screen.getByRole('button', { name: 'Send enquiry' }).closest('form')
  fill(form, { interest })
  fireEvent.submit(form)
  await screen.findByText('Your enquiry has reached the Home Seekers team.')
  expect(requests[0]).toMatchObject({ leadIntent: intent, pageUrl: 'http://localhost:3000/demo/homeseekers/contact' })
})

it('valuation requests include the property address and preserve it after failure', async () => {
  fetch.mockRejectedValueOnce(new Error('Fixture connection lost'))
  render(<HomeSeekersValuationModal onClose={() => {}} />)
  const form = screen.getByRole('button', { name: 'Request a valuation' }).closest('form')
  fill(form)
  fireEvent.submit(form)
  await screen.findByText('Fixture connection lost')
  expect(form.querySelector('[name="propertyAddress"]').value).toBe('12 Fixture Road, Pretoria')
  fireEvent.submit(form)
  await screen.findByText('Thank you. A Home Seekers agent will be in touch shortly.')
  expect(requests[0]).toMatchObject({ type: 'valuation_request', message: 'Property address: 12 Fixture Road, Pretoria', privacyAccepted: true })
})

it('a property enquiry identifies the published rental and viewing request', async () => {
  window.history.replaceState({}, '', `/demo/homeseekers/properties/${id}`)
  render(<MemoryRouter initialEntries={[`/demo/homeseekers/properties/${id}`]}><Routes><Route path="/demo/homeseekers/properties/:propertyId" element={<HomeSeekersProperty />} /></Routes></MemoryRouter>)
  const form = (await screen.findByRole('button', { name: 'Request a private viewing' })).closest('form')
  fill(form)
  fireEvent.submit(form)
  await screen.findByText('Thank you. Your viewing request has reached the Home Seekers team.')
  expect(requests[0]).toMatchObject({ type: 'property_enquiry', listingId: id, email: 'visitor@example.test', phone: '0820000000' })
})

it('an enquiry form joins overlapping requests and retains one key after a lost response', async () => {
  let reject
  fetch.mockImplementationOnce(async (_url, options) => { requests.push(JSON.parse(options.body)); return new Promise((_resolve, fail) => { reject = fail }) })
  render(<HomeSeekersLeadForm leadIntent="rent" />)
  const form = screen.getByRole('button', { name: 'Send enquiry' }).closest('form')
  fill(form)
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => reject(new Error('Fixture connection lost')))
  await screen.findByText('Fixture connection lost')
  expect(form.querySelector('[name="email"]').value).toBe('visitor@example.test')
  fireEvent.submit(form)
  await screen.findByText('Thank you. Your enquiry has reached the Home Seekers team.')
  expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey)
  expect(requests[1].leadIntent).toBe('rent')
})

it('an edited enquiry gets a new key after an uncertain failure', async () => {
  fetch.mockImplementationOnce(async (_url, options) => { requests.push(JSON.parse(options.body)); throw new Error('Fixture lost response') })
  const { result } = renderHook(useHomeSeekersLeadSubmission)
  await act(async () => { await expect(result.current(details)).rejects.toThrow('Fixture lost response') })
  await act(async () => result.current({ ...details, message: 'Changed requirement' }))
  expect(requests[1].idempotencyKey).not.toBe(requests[0].idempotencyKey)
})

it('a rate-limit rejection starts a fresh attempt when the visitor retries', async () => {
  fetch.mockImplementationOnce(async (_url, options) => { requests.push(JSON.parse(options.body)); return response(429, { error: 'Please wait before sending another enquiry.' }) })
  const { result } = renderHook(useHomeSeekersLeadSubmission)
  await act(async () => { await expect(result.current(details)).rejects.toThrow('Please wait') })
  await act(async () => result.current(details))
  expect(requests[1].idempotencyKey).not.toBe(requests[0].idempotencyKey)
})

it('a server error retains the submission key and never reports success', async () => {
  fetch.mockImplementationOnce(async (_url, options) => { requests.push(JSON.parse(options.body)); return response(503, { error: 'Enquiries unavailable' }) })
  const { result } = renderHook(useHomeSeekersLeadSubmission)
  await act(async () => { await expect(result.current(details)).rejects.toThrow('Enquiries unavailable') })
  await act(async () => result.current(details))
  expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey)
})

it('an empty or malformed success response cannot clear a visitor’s enquiry', async () => {
  await expect(submitHomeSeekersLead(details, { fetcher: async () => response(200, {}) })).rejects.toThrow('Your enquiry could not be sent')
  await expect(submitHomeSeekersLead(details, { fetcher: async () => ({ ok: true, status: 200, json: async () => { throw new Error('Fixture HTML response') } }) })).rejects.toThrow('Your enquiry could not be sent')
})

it('a stalled request times out so the visitor can retry with their details', async () => {
  await expect(submitHomeSeekersLead(details, { timeoutMs: 5, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Fixture aborted')), { once: true })) })).rejects.toThrow('The connection took too long')
})
