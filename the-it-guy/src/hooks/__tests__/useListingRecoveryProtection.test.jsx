// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import useListingRecoveryProtection from '../useListingRecoveryProtection'

const photoStore = vi.hoisted(() => ({ save: vi.fn(() => new Promise(() => {})) }))
vi.mock('../../services/listings/listingDraftRecovery', async original => ({ ...await original(), saveListingRecoveryDraft: photoStore.save }))
const recovery = { step: 'property' }
const warning = vi.fn()
function Harness({ form, enabled = true, scope = 'agent:agency:sale', requireSaved = false }) {
 const protection = useListingRecoveryProtection({ enabled, scope, form, recovery, onWarning: warning, requireSaved })
 const navigate = useNavigate(); const location = useLocation()
 return <><p>{location.pathname}</p><button onClick={() => navigate('/away')}>Leave</button><button onClick={() => { protection.markSaved(); navigate('/saved') }}>Confirmed save</button></>
}
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); warning.mockClear(); photoStore.save.mockClear() })

it('captures the latest input synchronously and flushes photos when unmounted before the timer', () => {
 const view = render(<MemoryRouter><Harness form={{ title: 'First', listingImages: [] }} /></MemoryRouter>)
 view.rerender(<MemoryRouter><Harness form={{ title: 'Latest', listingImages: [] }} /></MemoryRouter>)
 expect(JSON.parse(localStorage.getItem('arch9:listing-recovery:v2:agent:agency:sale')).form.title).toBe('Latest')
 view.unmount()
 expect(photoStore.save.mock.calls.at(-1)[1].form.title).toBe('Latest')
})

it('does not overwrite a saved draft with defaults while hydration is pending', () => {
 localStorage.setItem('arch9:listing-recovery:v2:agent:agency:sale', 'retain existing copy')
 render(<MemoryRouter><Harness enabled={false} form={{ title: '', listingImages: [] }} /></MemoryRouter>)
 expect(localStorage.getItem('arch9:listing-recovery:v2:agent:agency:sale')).toBe('retain existing copy')
 expect(photoStore.save).not.toHaveBeenCalled()
})

it('protects refresh and route departure while original photo bytes are pending', () => {
 const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
 render(<MemoryRouter><Harness form={{ title: 'Latest', listingImages: [{ id: 'new', file: new File(['bytes'], 'new.jpg'), url: 'blob:new' }] }} /></MemoryRouter>)
 const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
 expect(unload.defaultPrevented).toBe(true)
 fireEvent.click(screen.getByText('Leave')); expect(confirm).toHaveBeenCalled(); expect(screen.getByText('/')).toBeTruthy()
 fireEvent.click(screen.getByText('Confirmed save')); expect(screen.getByText('/saved')).toBeTruthy()
})

it('warns and blocks route departure when synchronous recovery storage fails', () => {
 vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota full') })
 const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
 render(<MemoryRouter><Harness form={{ title: 'Keep typed input', listingImages: [] }} /></MemoryRouter>)
 expect(warning).toHaveBeenCalledWith(expect.stringContaining('could not save your latest changes'))
 fireEvent.click(screen.getByText('Leave')); expect(confirm).toHaveBeenCalled(); expect(screen.getByText('/')).toBeTruthy()
})

it('protects native browser Back when recovery has failed', () => {
 const previous = window.history.state
 window.history.replaceState({ idx: 1 }, '')
 try {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota full') })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
  render(<MemoryRouter><Harness form={{ title: 'Keep typed input', listingImages: [] }} /></MemoryRouter>)
  window.history.replaceState({ idx: 0 }, '')
  window.dispatchEvent(new PopStateEvent('popstate'))
  expect(confirm).toHaveBeenCalledOnce(); expect(go).toHaveBeenCalledWith(1)
  window.history.replaceState({ idx: 1 }, '')
  window.dispatchEvent(new PopStateEvent('popstate'))
  expect(confirm).toHaveBeenCalledOnce()
 } finally { window.history.replaceState(previous, '') }
})

it('keeps selected documents protected until a confirmed listing save', () => {
 render(<MemoryRouter><Harness form={{ title: 'Document', listingImages: [], manualMandateFile: new File(['document'], 'mandate.pdf') }} /></MemoryRouter>)
 const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
 expect(unload.defaultPrevented).toBe(true)
 fireEvent.click(screen.getByText('Confirmed save'))
 const saved = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(saved)
 expect(saved.defaultPrevented).toBe(false)
})


it('protects departure for device-only changes until a Listings save is confirmed', () => {
 const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
 render(<MemoryRouter><Harness requireSaved form={{ title: 'Device-only change', listingImages: [] }} /></MemoryRouter>)
 const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
 expect(unload.defaultPrevented).toBe(true)
 fireEvent.click(screen.getByText('Leave'))
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining('not been saved to Listings'))
 expect(screen.getByText('/')).toBeTruthy()
 fireEvent.click(screen.getByText('Confirmed save'))
 expect(screen.getByText('/saved')).toBeTruthy()
})
