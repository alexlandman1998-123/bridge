// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ListingLandSizeInput from '../ListingLandSizeInput'
import ListingAdvertisingChoices from '../ListingAdvertisingChoices'
import ListingReviewDetails from '../ListingReviewDetails'
import ListingSaveStatus from '../ListingSaveStatus'
afterEach(cleanup)
it('converts hectare entry without changing stored square metres on a unit switch', () => {
 const changed = vi.fn()
 function Form() { const [value, setValue] = useState('25000'); return <ListingLandSizeInput value={value} onChange={next => { changed(next); setValue(next) }} /> }
 render(<Form />)
 fireEvent.change(screen.getByLabelText('Land size unit'), { target: { value: 'ha' } })
 expect(screen.getByRole('spinbutton').value).toBe('2.5'); expect(changed).not.toHaveBeenCalled()
 fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3.25' } })
 expect(changed).toHaveBeenLastCalledWith('32500')
 fireEvent.change(screen.getByLabelText('Land size unit'), { target: { value: 'm2' } })
 expect(screen.getByRole('spinbutton').value).toBe('32500')
 fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
 expect(changed).toHaveBeenLastCalledWith('')
})
it('distinguishes checking a connection from a confirmed missing connection', () => {
 const { rerender } = render(<ListingAdvertisingChoices loading />)
 expect(screen.queryByText(/connection needed/)).toBeNull()
 expect(screen.getAllByText(/checking connection/)).toHaveLength(3)
 rerender(<ListingAdvertisingChoices />)
 expect(screen.getAllByText(/connection needed/)).toHaveLength(3)
})
it('shows actual photo progress in the main save status', () => {
 render(<ListingSaveStatus cloud={{ status: 'saving', message: 'Saving photos: 2 of 5…' }} />)
 expect(screen.getByRole('status').textContent).toBe('Saving photos: 2 of 5…')
})
it('lets an agent review a description mismatch before publishing', () => {
 const onEdit = vi.fn()
 render(<ListingReviewDetails form={{ bathrooms: 2, listingDescription: 'A one-bathroom home.' }} onEdit={onEdit} />)
 expect(screen.getByRole('alert').textContent).toContain('description says 1')
 fireEvent.click(screen.getByRole('button', { name: 'Review description' }))
 expect(onEdit).toHaveBeenCalledWith('marketing')
})
