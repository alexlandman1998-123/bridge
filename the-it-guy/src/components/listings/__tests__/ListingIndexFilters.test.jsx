// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ListingIndexFilters, { ListingIndexTabs } from '../ListingIndexFilters.jsx'
import { DEFAULT_LISTING_INDEX_FILTERS } from '../../../services/listings/listingIndexFilterModel.js'
afterEach(cleanup)

it('offers four accessible categories with their counts', () => {
  const change = vi.fn()
  render(<ListingIndexTabs value="all" counts={{ all: 5, residential: 1, commercial: 2, developments: 2 }} onChange={change} />)
  expect(screen.getAllByRole('tab')).toHaveLength(4)
  expect(screen.getByRole('tab', { name: 'All 5' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('tab', { name: 'Commercial 2' }))
  expect(change).toHaveBeenCalledWith('commercial')
})
it('offers only relevant fields and keeps selected advanced filters visible as removable chips', () => {
  const change = vi.fn()
  render(<ListingIndexFilters tab="residential" value={{ ...DEFAULT_LISTING_INDEX_FILTERS, bathrooms: '2' }} onChange={change} />)
  expect(screen.getByLabelText('Bedrooms')).toBeTruthy()
  expect(screen.queryByLabelText('Min area (m²)')).toBeNull()
  expect(screen.queryByLabelText('Bathrooms')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Bathrooms filter' }))
  expect(change.mock.calls[0][0].bathrooms).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'More filters' }))
  expect(screen.getByLabelText('Bathrooms').value).toBe('2')
})
it('clears the selected tab filters and search together', () => {
  const change = vi.fn(), clear = vi.fn()
  render(<ListingIndexFilters tab="commercial" value={{ ...DEFAULT_LISTING_INDEX_FILTERS, minArea: '90', location: 'Sea Point' }} search="office" onChange={change} onClearSearch={clear} />)
  expect(screen.queryByLabelText('Bedrooms')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(change).toHaveBeenCalledWith({ ...DEFAULT_LISTING_INDEX_FILTERS })
  expect(clear).toHaveBeenCalled()
})
