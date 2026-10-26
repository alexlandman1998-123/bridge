// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PublicDevelopmentVisualExplorer from '../PublicDevelopmentVisualExplorer.jsx'

const inventory = Array.from({ length: 63 }, (_, index) => ({
  id: `unit-${index + 1}`, unitNumber: String(index + 1).padStart(3, '0'),
  unitType: '3 Bedroom Residence', bedrooms: 3, sizeSqm: 230,
  status: 'Available', price: 2750000,
}))
const media = { coverImageUrl: '/unit.png' }
const failedScenes = []
const visualMap = { defaultSceneId: 'site', scenes: [{
  id: 'site', name: 'Masterplan', type: 'masterplan',
  background: { url: '/plan.png', width: 1800, height: 1682 },
  hotspots: inventory.map((unit, index) => ({
    id: `hotspot-${unit.id}`, type: 'unit', target: { type: 'unit', id: unit.id },
    geometry: { type: 'point', coordinates: [10 + index % 8 * 10, 10 + Math.floor(index / 8) * 10] },
    label: { text: unit.unitNumber },
  })),
}] }
let outerScroll, scrollIntoView

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
  outerScroll = vi.fn()
  scrollIntoView = vi.fn()
  vi.stubGlobal('scrollTo', outerScroll)
  vi.stubGlobal('Image', class {
    naturalWidth = 1800
    naturalHeight = 1682
    set src(value) { if (value) queueMicrotask(() => this.onload?.()) }
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.getAttribute('aria-label') === 'Residence list') return { top: 100, bottom: 500, height: 400 }
    if (this.tagName === 'ARTICLE') {
      const number = Number(this.querySelector('b')?.textContent)
      return number === 63 ? { top: 650, bottom: 750, height: 100 } : { top: 140, bottom: 240, height: 100 }
    }
    return { top: 0, bottom: 0, height: 0 }
  })
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete Element.prototype.scrollIntoView })

async function mount(props = {}) {
  render(<PublicDevelopmentVisualExplorer inventory={inventory} media={media} visualMapOverride={visualMap} simulatedFailedSceneIds={failedScenes} {...props} />)
  await act(async () => {})
  const list = screen.getByRole('region', { name: 'Residence list', hidden: true })
  list.scrollBy = vi.fn()
  return list
}

it('opens a visible residence without scrolling the page or moving the list', async () => {
  const list = await mount()
  fireEvent.click(screen.getByRole('button', { name: /001 3 Bedroom Residence/ }))
  expect(screen.getByRole('button', { name: 'Close residence details' })).toBeTruthy()
  expect(list.scrollBy).not.toHaveBeenCalled()
  expect(outerScroll).not.toHaveBeenCalled()
  expect(scrollIntoView).not.toHaveBeenCalled()
  expect(new URLSearchParams(window.location.search).get('unit')).toBe('unit-1')
})

it('reveals a selected distant residence within the 63-unit list only', async () => {
  const list = await mount()
  fireEvent.click(screen.getByRole('button', { name: /063 3 Bedroom Residence/ }))
  expect(list.scrollBy).toHaveBeenCalledWith({ top: 250, behavior: 'smooth' })
  expect(scrollIntoView).not.toHaveBeenCalled()
  expect(outerScroll).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Close residence details' }))
  expect(outerScroll).not.toHaveBeenCalled()
  expect(list.querySelectorAll('article')).toHaveLength(63)
})

it('does not scroll a hidden mobile residence list when choosing a map hotspot', async () => {
  const list = await mount({ mobile: true })
  const hotspot = document.querySelector('[data-hotspot-button][aria-label*="063"]')
  expect(hotspot).toBeTruthy()
  fireEvent.click(hotspot)
  expect(screen.getByRole('button', { name: 'Close residence details' })).toBeTruthy()
  expect(list.scrollBy).not.toHaveBeenCalled()
  expect(outerScroll).not.toHaveBeenCalled()
})


it('focuses the homes reversibly while keeping all unit markers attached to the plan', async () => {
  const residentialMap = { ...visualMap, scenes: [{
    ...visualMap.scenes[0],
    hotspots: visualMap.scenes[0].hotspots.map((hotspot) => ({
      ...hotspot,
      geometry: { ...hotspot.geometry, coordinates: [hotspot.geometry.coordinates[0], 45 + hotspot.geometry.coordinates[1] * .5] },
    })),
  }] };
  const originalMap = JSON.stringify(residentialMap);
  await mount({ visualMapOverride: residentialMap, initialResidentialFocus: true });
  const layer = document.querySelector('[data-residential-plan-layer]');
  const marker = screen.getByRole('button', { name: '063. Open details' });
  const markerTop = marker.style.top;
  const focusedHeight = layer.style.height;
  expect(Number.parseFloat(focusedHeight)).toBeGreaterThan(100);
  expect(document.querySelectorAll('[data-hotspot-button]')).toHaveLength(63);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  fireEvent.click(screen.getByRole('button', { name: 'View full estate' }));
  expect(layer.style.height).toBe('100%');
  expect(layer.parentElement.style.transform).toBe('translate(0px, 0px) scale(1)');
  expect(marker.style.top).toBe(markerTop);
  fireEvent.click(screen.getByRole('button', { name: 'Focus on homes' }));
  expect(layer.style.height).toBe(focusedHeight);
  expect(marker.style.top).toBe(markerTop);
  expect(JSON.stringify(residentialMap)).toBe(originalMap);
  expect(outerScroll).not.toHaveBeenCalled();
});

it('keeps the full plan for developments without the residential focus option', async () => {
  await mount();
  expect(screen.queryByRole('button', { name: 'View full estate' })).toBeNull();
  expect(document.querySelector('[data-residential-plan-layer]').style.inset).toBe('0');
});

it.each([false, true])('updates a reserved marker to match the legend, including selection and reset (mobile: %s)', async mobile => {
  const props = { inventory, media, visualMapOverride: visualMap, simulatedFailedSceneIds: failedScenes, mobile };
  const view = render(<PublicDevelopmentVisualExplorer {...props} />);
  await act(async () => {});
  const legend = screen.getByRole('group', { name: 'Availability legend' });
  const colour = label => within(legend).getByText(label).querySelector('i').style.background;
  const marker = screen.getByRole('button', { name: '042. Open details' });
  expect(marker.style.backgroundColor).toBe(colour('Available'));
  const reservedInventory = inventory.map(unit => unit.unitNumber === '042' ? { ...unit, status: 'reserved' } : unit);
  view.rerender(<PublicDevelopmentVisualExplorer {...props} inventory={reservedInventory} />);
  expect(marker.style.backgroundColor).toBe(colour('Reserved'));
  expect(marker.title).toBe('Unit 042 · Reserved');
  expect(marker.getAttribute('aria-description')).toBe('Reserved');
  fireEvent.click(marker);
  expect(marker.style.backgroundColor).toBe(colour('Reserved'));
  fireEvent.click(screen.getByRole('button', { name: 'Close residence details' }));
  view.rerender(<PublicDevelopmentVisualExplorer {...props} />);
  expect(marker.style.backgroundColor).toBe(colour('Available'));
  expect(marker.title).toBe('Unit 042 · Available');
});
