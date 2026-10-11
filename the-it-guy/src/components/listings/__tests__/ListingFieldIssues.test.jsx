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
