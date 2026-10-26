// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileLayout from '../MobileLayout.jsx'

vi.mock('../MobileHeader', () => ({ default: () => null }))
vi.mock('../MobileBottomNav', () => ({ default: () => null }))
vi.mock('../MobileLeadCreateProvider.jsx', () => ({ default: ({ children }) => children }))
vi.mock('../MobileAppointmentCreateProvider.jsx', () => ({ default: ({ children }) => children }))

let resize
let height
beforeEach(() => {
  height = 2000
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback }
    observe() {}
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
  HTMLElement.prototype.scrollTo = vi.fn(function ({ top }) {
    this.scrollTop = Math.min(top, Math.max(0, height - 500))
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function Page() {
  const navigate = useNavigate()
  const location = useLocation()
  return <>
    <output>{location.pathname}{location.search}</output>
    <button onClick={() => navigate('/mobile/lead/one')}>Open lead</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate('?create=lead')}>Open create</button>
    <button onClick={() => navigate('?section=campaigns&view=detail&id=one')}>Open campaign</button>
    <button onClick={() => navigate('?section=campaigns&filter=active')}>Filter campaigns</button>
    <button onClick={() => navigate('?section=campaigns&view=create&id=saved', { replace: true })}>Remember campaign draft</button>
  </>
}
function setup(path = '/mobile/leads') {
  const view = render(<MemoryRouter initialEntries={[path]}>
    <Routes><Route element={<MobileLayout />}><Route path="/mobile/*" element={<Page />} /></Route></Routes>
  </MemoryRouter>)
  return view.container.querySelector('[data-mobile-scroll-root]')
}
function scroll(root, top) { root.scrollTop = top; fireEvent.scroll(root) }

it('starts a new detail at the top and restores the list on Back', () => {
  const root = setup()
  scroll(root, 650)
  fireEvent.click(screen.getByText('Open lead'))
  expect(root.scrollTop).toBe(0)
  scroll(root, 200)
  fireEvent.click(screen.getByText('Back'))
  expect(root.scrollTop).toBe(650)
})

it('keeps the current position when query parameters open and close a sheet', () => {
  const root = setup()
  scroll(root, 420)
  fireEvent.click(screen.getByText('Open create'))
  expect(root.scrollTop).toBe(420)
  fireEvent.click(screen.getByText('Back'))
  expect(root.scrollTop).toBe(420)
})

it('waits for returning list content to load before completing restoration', () => {
  const root = setup()
  scroll(root, 900)
  fireEvent.click(screen.getByText('Open lead'))
  height = 600
  fireEvent.click(screen.getByText('Back'))
  expect(root.scrollTop).toBe(100)
  height = 2000
  act(() => resize())
  expect(root.scrollTop).toBe(900)
})

it('does not pull the user back after they start a new swipe while content loads', () => {
  const root = setup()
  scroll(root, 900)
  fireEvent.click(screen.getByText('Open lead'))
  height = 600
  fireEvent.click(screen.getByText('Back'))
  fireEvent.touchStart(root)
  scroll(root, 50)
  height = 2000
  act(() => resize())
  expect(root.scrollTop).toBe(50)
})

it('opens query-driven marketing pages at the top and restores the campaign list on Back', () => {
  const root = setup('/mobile/marketing?section=campaigns')
  scroll(root, 650)
  fireEvent.click(screen.getByText('Open campaign'))
  expect(root.scrollTop).toBe(0)
  scroll(root, 200)
  fireEvent.click(screen.getByText('Back'))
  expect(root.scrollTop).toBe(650)
})

it('keeps marketing filter changes and a newly assigned draft ID at the current position', () => {
  const root = setup('/mobile/marketing?section=campaigns')
  scroll(root, 420)
  fireEvent.click(screen.getByText('Filter campaigns'))
  expect(root.scrollTop).toBe(420)
  cleanup()
  const editor = setup('/mobile/marketing?section=campaigns&view=create')
  scroll(editor, 550)
  fireEvent.click(screen.getByText('Remember campaign draft'))
  expect(editor.scrollTop).toBe(550)
})
