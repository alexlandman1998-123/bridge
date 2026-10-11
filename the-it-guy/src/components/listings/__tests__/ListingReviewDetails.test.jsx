// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ListingReviewDetails from '../ListingReviewDetails'
afterEach(cleanup)
it('shows complete rental details and routes edits to their capture sections', () => {
 const onEdit = vi.fn()
 const description = 'A complete description. '.repeat(30)
 render(<ListingReviewDetails rental onEdit={onEdit} form={{ propertyCategory: 'residential', propertyType: 'apartment', propertyAddress: '12 Example Road', exactAddressVisibility: 'hide_street_number', bedrooms: '0', bathrooms: '1.5', floorSize: '98.5', erfSize: '500.5', monthlyRent: '12500.75', rentalPriceFrequency: 'weekly', depositPolicy: 'deposit_required', depositAmount: '25001.5', description }} />)
 const value = label => screen.getByText(label, { selector: 'dt' }).nextElementSibling.textContent
 expect(value('Bedrooms')).toBe('0')
 expect(value('Bathrooms')).toBe('1.5')
 expect(value('Property type')).toBe('Apartment')
 expect(value('Floor size')).toBe('98.5 m²')
 expect(value('Land size')).toBe('500.5 m²')
 expect(value('Rent').replace(/\s/g, '')).toBe('R12500,75')
 expect(value('Deposit').replace(/\s/g, '')).toBe('R25001,5')
 expect(value('Frequency')).toBe('Per week')
 expect(value('Public address setting')).toBe('Contact agent for street address')
 expect(value('Description')).toBe(description)
 fireEvent.click(screen.getByRole('button', { name: 'Edit rent and deposit' }))
 fireEvent.click(screen.getByRole('button', { name: 'Edit photos and description' }))
 expect(onEdit.mock.calls).toEqual([['terms'], ['marketing']])
})
it('reviews vacant land without room counts and uses the advertised POA setting', () => {
 render(<ListingReviewDetails onEdit={() => {}} form={{ propertyCategory: 'vacant_land', propertyType: 'vacant_land', bedrooms: '3', priceOnApplication: true, listingPrice: '1500000', erfSize: '500' }} />)
 expect(screen.queryByText('Bedrooms')).toBeNull()
 expect(screen.getByText('Price on Application')).toBeTruthy()
 expect(screen.getByText('500 m²')).toBeTruthy()
})

it('combines price with the property card and stacks the compact sales review', () => {
 render(<ListingReviewDetails compact form={{ propertyCategory: 'residential', listingPrice: '1250000' }} onEdit={() => {}} />)
 expect(screen.queryByRole('heading', { name: 'Price', exact: true })).toBeNull()
 const price = screen.getByText('Advertised price').closest('section')
 expect(price.querySelector('h3').textContent).toBe('Property and address')
 expect(screen.getByRole('button', { name: 'Edit photos and description' })).toBeTruthy()
})


it('lets an agent correct the property, price and advert from the sales review', () => {
 const onEdit = vi.fn()
 render(<ListingReviewDetails form={{ propertyCategory: 'residential', listingPrice: '1000000' }} onEdit={onEdit} />)
 fireEvent.click(screen.getByRole('button', { name: 'Edit property and address' }))
 fireEvent.click(screen.getByRole('button', { name: 'Edit price' }))
 fireEvent.click(screen.getByRole('button', { name: 'Edit photos and description' }))
 expect(onEdit.mock.calls).toEqual([['property'], ['property'], ['marketing']])
})
