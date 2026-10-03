// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import RentalDistributionChannel from '../RentalDistributionChannel'
import { rentalChannelStatus } from '../../../services/rentals/rentalChannelStatus'
afterEach(cleanup)
it('shows persisted portal references, valid live links, status and compact publication activity', () => {
  render(<RentalDistributionChannel channelKey="property24" name="Property24" reference="Ref: 12345" publicUrl="www.property24.com/to-rent/demo/12345" status="on_portal" savedAt="2h ago" lastSynced="1h ago" />)
  expect(screen.getByText('12345')).toBeTruthy()
  expect(screen.getByText('Live')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View listing' }).getAttribute('href')).toBe('https://www.property24.com/to-rent/demo/12345')
  expect(screen.getByText('Arch9 saved')).toBeTruthy()
  expect(screen.getByText('Portal updated')).toBeTruthy()
})
it('does not turn a submitted, expired or failed response into live publication', () => {
  expect(rentalChannelStatus('submitted')).toEqual({ label: 'Submitted', tone: 'syncing', live: false })
  expect(rentalChannelStatus('accepted').label).toBe('Awaiting verification')
  expect(rentalChannelStatus('expired').label).toBe('Expired')
  expect(rentalChannelStatus('failed').tone).toBe('attention')
  render(<RentalDistributionChannel channelKey="private_property" name="Private Property" status="expired" publicUrl="https://www.privateproperty.co.za/to-rent/demo/R123" />)
  expect(screen.getByText('Expired')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})
it('rejects unsafe or wrong-portal public URLs without inventing a reference', () => {
  render(<RentalDistributionChannel channelKey="property24" name="Property24" status="published" publicUrl="https://example.test/fake" />)
  expect(screen.getByText('Not assigned')).toBeTruthy()
  expect(screen.getByText('Listing link unavailable')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})
