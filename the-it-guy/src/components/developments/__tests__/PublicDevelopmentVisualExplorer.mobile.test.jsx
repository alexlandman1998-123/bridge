// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PublicDevelopmentVisualExplorer from '../PublicDevelopmentVisualExplorer.jsx'

const inventory = [
  { id: 'one', unitNumber: '001', unitType: 'Residence', bedrooms: 3, sizeSqm: 230, price: 2800000, status: 'Available' },
  { id: 'two', unitNumber: '002', unitType: 'Residence', bedrooms: 3, sizeSqm: 230, price: 2900000, status: 'Reserved' },
  { id: 'three', unitNumber: '003', unitType: 'Residence', bedrooms: 3, sizeSqm: 230, price: 3000000, status: 'Sold' },
]
const visualMap = { defaultSceneId: 'plan', scenes: [{ id: 'plan', name: 'Masterplan', type: 'masterplan', background: { url: '/plan.png', width: 1800, height: 1000 }, hotspots: inventory.map((unit, index) => ({ id: unit.id, type: 'unit', target: { type: 'unit', id: unit.id }, geometry: { type: 'point', coordinates: [20 + index * 30, 45] }, label: { text: unit.unitNumber } })) }] }
const props = { inventory, media: { coverImageUrl: '/home.png' }, visualMapOverride: visualMap, mobile: true, estatePresentation: true, initialResidentialFocus: true }
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

beforeEach(() => {
  window.history.replaceState({ preserved: 'router state' }, '', '/development/example')
  window.localStorage.clear()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('Image', class { naturalWidth = 1800; naturalHeight = 1000; set src(value) { if (value) queueMicrotask(() => this.onload?.()) } })
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { this.callback = callback } observe() { this.callback([{ contentRect: { width: 390, height: 500 } }]) } disconnect() {} })
  vi.stubGlobal('PointerEvent', class extends MouseEvent { constructor(type, options) { super(type, options); this.pointerId = options.pointerId } })
})
afterEach(async () => { cleanup(); await settle(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.style.overflow = '' })

async function open(extra = {}) {
  const view = render(<StrictMode><PublicDevelopmentVisualExplorer {...props} {...extra} /></StrictMode>)
  await settle()
  const trigger = screen.getByRole('button', { name: /Explore units on the full-screen/ })
  trigger.focus()
  fireEvent.click(trigger)
  await settle()
  return { ...view, trigger, dialog: screen.getByRole('dialog', { name: 'Explore residences' }) }
}

it('opens a genuine modal in StrictMode, preserves router state, and restores focus and scrolling on close', async () => {
  const { dialog, trigger } = await open()
  expect(dialog.parentElement).toBe(document.body)
  expect(document.documentElement.style.overflow).toBe('hidden')
  expect(window.history.state.preserved).toBe('router state')
  expect(window.history.state.estateMap).toBeTruthy()
  expect(within(dialog).getByRole('group', { name: 'Map availability legend' })).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close estate map' }))
  await settle()
  expect(screen.queryByRole('dialog', { name: 'Explore residences' })).toBeNull()
  expect(document.documentElement.style.overflow).toBe('')
  expect(document.activeElement).toBe(trigger)
  expect(window.scrollTo).not.toHaveBeenCalled()
})

it('keeps map position and unit selection while opening and closing full details, and reflects current stock', async () => {
  const { dialog, rerender } = await open()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
  const layer = dialog.querySelector('[data-residential-plan-layer]').parentElement
  const transform = layer.style.transform
  fireEvent.click(within(dialog).getByRole('button', { name: '001. Open details' }))
  expect(screen.queryByRole('button', { name: 'Close residence details' })).toBeNull()
  expect(within(dialog).getByRole('region', { name: 'Selected unit 001' })).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'View unit details' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close residence details' }))
  expect(layer.style.transform).toBe(transform)
  expect(document.documentElement.style.overflow).toBe('hidden')
  expect(within(dialog).getByRole('region', { name: 'Selected unit 001' })).toBeTruthy()
  rerender(<StrictMode><PublicDevelopmentVisualExplorer {...props} inventory={inventory.map(unit => unit.id === 'one' ? { ...unit, status: 'Reserved' } : unit)} /></StrictMode>)
  expect(within(within(dialog).getByRole('region', { name: 'Selected unit 001' })).getByText('Reserved')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reset view' }))
  expect(layer.style.transform).toContain('translate(0px, 0px) scale(1)')
})

it('filters the real residence list and returns to the same map without reopening the modal', async () => {
  const { dialog } = await open()
  const state = window.history.state.estateMap
  fireEvent.click(within(dialog).getByRole('button', { name: 'Filters' }))
  const filters = within(dialog).getByRole('region', { name: 'Filter residences' })
  const availability = within(filters).getByLabelText('Availability')
  const sold = [...availability.options].find(option => option.textContent.toLowerCase() === 'sold')
  fireEvent.change(availability, { target: { value: sold.value } })
  fireEvent.click(within(filters).getByRole('button', { name: 'Show 1 home' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'List', exact: true }))
  const list = within(dialog).getByRole('region', { name: 'Residence list' })
  expect(list.querySelectorAll('article')).toHaveLength(1)
  expect(within(list).getByText('003')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Map', exact: true }))
  expect(window.history.state.estateMap).toBe(state)
  expect(within(dialog).getByRole('button', { name: '003. Open details' })).toBeTruthy()
  expect(within(dialog).queryByRole('button', { name: '001. Open details' })).toBeNull()
})

it('supports pinch zoom and dragging from unit markers without treating the drag as a selection', async () => {
  const { dialog } = await open()
  const canvas = within(dialog).getByRole('application')
  canvas.setPointerCapture = vi.fn()
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 200 })
  fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 200, clientY: 200 })
  fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 250, clientY: 200 })
  expect(canvas.querySelector('[data-residential-plan-layer]').parentElement.style.transform).toContain('scale(1.5)')
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 2 })
  const marker = within(dialog).getByRole('button', { name: '001. Open details' })
  fireEvent.pointerDown(marker, { pointerId: 3, clientX: 200, clientY: 200 })
  fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 180, clientY: 200 })
  fireEvent.pointerUp(canvas, { pointerId: 3 })
  fireEvent.click(marker)
  expect(within(dialog).queryByRole('region', { name: 'Selected unit 001' })).toBeNull()
  fireEvent.pointerDown(marker, { pointerId: 4, clientX: 200, clientY: 200 })
  fireEvent.pointerUp(marker, { pointerId: 4 })
  fireEvent.click(marker)
  expect(within(dialog).getByRole('region', { name: 'Selected unit 001' })).toBeTruthy()
})

it('handles browser Back as closing the map and releases its scroll lock', async () => {
  await open()
  await act(async () => { window.history.back(); await new Promise(resolve => setTimeout(resolve, 30)) })
  expect(screen.queryByRole('dialog', { name: 'Explore residences' })).toBeNull()
  expect(document.documentElement.style.overflow).toBe('')
  expect(screen.getByRole('button', { name: /Explore units on the full-screen/ })).toBeTruthy()
})


it('hands an available unit to the existing reservation flow only after an explicit action and releases both modals', async () => {
  const reserve = vi.fn()
  const { dialog } = await open({ onReserveUnit: reserve })
  fireEvent.click(within(dialog).getByRole('button', { name: '001. Open details' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'View unit details' }))
  expect(reserve).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reserve unit 001' }))
  await settle()
  expect(reserve).toHaveBeenCalledExactlyOnceWith(inventory[0])
  expect(screen.queryByRole('dialog', { name: 'Explore residences' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Close residence details' })).toBeNull()
  expect(document.documentElement.style.overflow).toBe('')
  expect(document.body.style.overflow).toBe('')
})


it('keeps the loaded plan when selecting, searching, zooming and reopening the map', async () => {
  const loads = vi.fn()
  vi.stubGlobal('Image', class { naturalWidth = 1800; naturalHeight = 1000; set src(value) { if (value) { loads(value); queueMicrotask(() => this.onload?.()) } } })
  const { dialog, trigger } = await open()
  const loaded = loads.mock.calls.filter(([url]) => url === '/plan.png').length
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
  fireEvent.click(within(dialog).getByRole('button', { name: '001. Open details' }))
  fireEvent.change(within(dialog).getByLabelText('Search units'), { target: { value: '001' } })
  await settle()
  expect(loads.mock.calls.filter(([url]) => url === '/plan.png')).toHaveLength(loaded)
  expect(screen.queryByText('Loading interactive plan…')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close estate map' }))
  await settle()
  fireEvent.click(trigger)
  await settle()
  expect(loads.mock.calls.filter(([url]) => url === '/plan.png')).toHaveLength(loaded)
  expect(screen.queryByText('Loading interactive plan…')).toBeNull()
})
