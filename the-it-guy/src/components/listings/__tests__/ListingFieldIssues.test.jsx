// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ListingFieldIssues from '../ListingFieldIssues'
const issues = [
 { field:'listingPrice', step:'property', message:'Enter a price.', channels:['property24'] },
 { field:'listingDescription', step:'marketing', message:'Remove website links.', channels:['private_property'] },
]
afterEach(cleanup)
it('keeps untouched required fields quiet, then shows errors when leaving the section', () => {
 const view=render(<ListingFieldIssues issues={issues} step="property" form={{}} />)
 expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
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
 expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
 view.rerender(<ListingFieldIssues issues={issues} step={step} attempted />)
 expect(screen.getByText('Enter a price.', {exact:false})).toBeTruthy()
 expect(screen.getByText('Remove website links.', {exact:false})).toBeTruthy()
})

it('hides corrected errors and keeps a newly opened step quiet', () => {
 const view=render(<ListingFieldIssues issues={issues} step="marketing" attempted />)
 view.rerender(<ListingFieldIssues issues={[]} step="marketing" attempted />)
 expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
 view.rerender(<ListingFieldIssues issues={issues} step="property" />)
 expect(screen.queryByText('Check these fields for your selected channels')).toBeNull()
})
