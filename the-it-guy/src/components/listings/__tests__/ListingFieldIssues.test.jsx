// @vitest-environment jsdom
import { useState } from 'react'
import { getListingFieldIssues } from '../../../services/listings/listingFieldRequirements'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import ListingFieldIssues from '../ListingFieldIssues'
const issues = [
 { field:'listingPrice', step:'property', message:'Enter a price.', channels:['property24'] },
 { field:'listingDescription', step:'marketing', message:'Remove website links.', channels:['private_property'] },
]
afterEach(cleanup)
it('keeps untouched required fields quiet, then shows errors when leaving the section', () => {
 const view=render(<ListingFieldIssues issues={issues} step="property" form={{}} />)
 expect(screen.queryByText('Check these details')).toBeNull()
 view.rerender(<ListingFieldIssues issues={issues} step="property" form={{}} attempted />)
 expect(screen.getByText('Enter a price.', {exact:false})).toBeTruthy()
 expect(screen.queryByText('Remove website links.', {exact:false})).toBeNull()
})
it('keeps invalid entered data quiet until Next is clicked', () => {
 const view=render(<ListingFieldIssues issues={issues} step="marketing" form={{listingDescription:'www.example.test'}} />)
 expect(screen.queryByText('Remove website links.', {exact:false})).toBeNull()
 view.rerender(<ListingFieldIssues issues={issues} step="marketing" attempted />)
 expect(screen.getByText('Remove website links.', {exact:false})).toBeTruthy()
 expect(screen.queryByText('Enter a price.', {exact:false})).toBeNull()
})
it.each(['syndication','review'])('shows selected-channel requirements in %s only after Next or Submit', step => {
 const view=render(<ListingFieldIssues issues={issues} step={step} form={{}} />)
 expect(screen.queryByText('Check these details')).toBeNull()
 view.rerender(<ListingFieldIssues issues={issues} step={step} attempted />)
 expect(screen.getByText('Enter a price.', {exact:false})).toBeTruthy()
 expect(screen.getByText('Remove website links.', {exact:false})).toBeTruthy()
})

it('hides corrected errors and keeps a newly opened step quiet', () => {
 const view=render(<ListingFieldIssues issues={issues} step="marketing" attempted />)
 view.rerender(<ListingFieldIssues issues={[]} step="marketing" attempted />)
 expect(screen.queryByText('Check these details')).toBeNull()
 view.rerender(<ListingFieldIssues issues={issues} step="property" />)
 expect(screen.queryByText('Check these details')).toBeNull()
})

it.each([false, true])('headline correction focuses the title for rental=%s', async rental => {
 const field = rental ? 'title' : 'listingTitle'
 const issues = getListingFieldIssues({ [field]: 'Home & garden', selectedSyndicationChannels: ['private_property'] }, { rental }).filter(issue => issue.field === field)
 let destination
 render(<><input name={field} aria-label="Listing title" /><ListingFieldIssues issues={issues} step="review" attempted onGoToStep={(step, name) => { destination = [step, name] }} /></>)
 fireEvent.click(screen.getByRole('button', { name: 'Edit listing title' }))
 expect(destination).toEqual(['marketing', field])
 await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Listing title')))
})

it('opens the correction step, focuses a collapsed field and keeps one message until fixed', async () => {
 function Host() {
  const [step, setStep] = useState('review')
  const [value, setValue] = useState('')
  return <main><ListingFieldIssues issues={value ? [] : [issues[0]]} step={step} attempted={step === 'review'} onGoToStep={setStep} />{step === 'property' ? <details><summary>Price details</summary><input name="listingPrice" aria-label="Price" value={value} onChange={event => setValue(event.target.value)} /></details> : null}</main>
 }
 render(<Host />)
 fireEvent.click(screen.getByRole('button', { name: 'Edit price' }))
 const input = await screen.findByLabelText('Price')
 await waitFor(() => expect(document.activeElement).toBe(input))
 expect(input.closest('details').open).toBe(true)
 expect(screen.getAllByText('Enter a price.', { exact: false })).toHaveLength(1)
 fireEvent.change(input, { target: { value: '1500000' } })
 expect(screen.queryByText('Enter a price.', { exact: false })).toBeNull()
})


it('shows draft safety, selected website counts and one correction per field before attempting', () => {
 const repeated = [...issues, { ...issues[0], message: 'Enter at least R10,000.', channels: ['private_property'] }]
 render(<ListingFieldIssues completion issues={repeated} channels={['property24', 'private_property']} step="property" onGoToStep={() => {}} />)
 const panel = screen.getByRole('region', { name: 'Listing completion checklist' })
 expect(screen.getByText('2 fields to finish')).toBeTruthy()
 expect(screen.getByText(/Save draft keeps your progress private/)).toBeTruthy()
 expect(screen.getByText('Property24: 1 field to fix')).toBeTruthy()
 expect(screen.getByText('Private Property: 2 fields to fix')).toBeTruthy()
 expect(panel.querySelector('details').open).toBe(false)
 panel.querySelector('details').open = true
 expect(screen.getAllByRole('button', { name: 'Edit price' })).toHaveLength(1)
})

it('separates listing details from website requirements and clears corrected items immediately', () => {
 const base = { field: 'propertyAddress', step: 'property', message: 'Property address is required.', channels: [] }
 const view = render(<ListingFieldIssues completion issues={[base, ...issues]} channels={['property24','private_property']} step="review" />)
 expect(screen.getByText('Listing details')).toBeTruthy()
 expect(screen.getByText('For your selected websites')).toBeTruthy()
 view.rerender(<ListingFieldIssues completion issues={[]} channels={['property24']} step="review" />)
 expect(screen.queryByText('Property address is required.')).toBeNull()
 expect(screen.getByText('Details ready for selected websites')).toBeTruthy()
 expect(screen.getByText(/Connection and publishing confirmation are checked separately/)).toBeTruthy()
})

it('does not show unselected websites or imply publication when nothing is selected', () => {
 render(<ListingFieldIssues completion issues={[]} channels={[]} step="property" />)
 expect(screen.getByText('No websites selected. This listing will stay private.')).toBeTruthy()
 expect(screen.queryByText(/Property24:/)).toBeNull()
})

it('moves directly to a later missing field without submitting, and retains correction until fixed', async () => {
 function Host() {
  const [step,setStep] = useState('property')
  const [value,setValue] = useState('')
  return <main><ListingFieldIssues completion issues={value ? [] : [issues[1]]} channels={['private_property']} step={step} onGoToStep={setStep} />{step === 'marketing' ? <textarea name="listingDescription" aria-label="Description" value={value} onChange={event => setValue(event.target.value)} /> : null}</main>
 }
 render(<Host />)
 document.querySelector('[data-listing-checklist] details').open = true
 fireEvent.click(screen.getByRole('button', { name: 'Edit description' }))
 const input = await screen.findByLabelText('Description')
 await waitFor(() => expect(document.activeElement).toBe(input))
 expect(document.querySelector('[data-listing-checklist] details').open).toBe(true)
 fireEvent.change(input, { target: { value: 'Plain description' } })
 expect(screen.queryByText('Remove website links.', { exact: false })).toBeNull()
})
