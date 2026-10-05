// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RevoPropertyExperience from '../RevoPropertyExperience'
import { previewProperties, previewWebsiteClient } from '../../../../../previews/revo-properties/previewData'

afterEach(cleanup)
const property = previewProperties[0]
const fillEnquiry = () => {
  const compose = document.querySelector('.revo-enquiry-compose')
  if (compose && !compose.open) fireEvent.click(screen.getByText('Send a message'))
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Example Buyer' } })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'buyer@example.test' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /use my details to respond/ }))
}

describe('Revo ready-made property experience', () => {
  it('filters the cards, clears a no-results search and opens the chosen property', async () => {
    const navigate = vi.fn()
    render(<RevoPropertyExperience client={previewWebsiteClient} onNavigate={navigate} showBrandFrame={false} />)
    expect(await screen.findByText('6 properties to explore')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Property collection' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Where would you like to live?'), { target: { value: 'Sea Point' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find properties' }))
    expect(await screen.findByText('1 property matching “Sea Point”')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Explore this property' }), { button: 0 })
    expect(navigate).toHaveBeenCalledWith(previewProperties[1].id)
    fireEvent.change(screen.getByLabelText('Where would you like to live?'), { target: { value: 'No such place' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find properties' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('6 properties to explore')).toBeTruthy()
    expect(screen.getByLabelText('Where would you like to live?').value).toBe('')
  })

  it('renders the detail and validates the preview enquiry without contacting the lead service', async () => {
    const enquiry = vi.fn()
    render(<RevoPropertyExperience client={{ ...previewWebsiteClient, enquiry }} propertyId={property.id} preview />)
    expect(await screen.findByRole('heading', { name: property.title })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open photo 1 of 3' })).toBeTruthy()
    expect(screen.getByText('285 m²')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sam Taylor' })).toBeTruthy()
    expect(document.querySelector('.revo-enquiry-compose').open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Arrange a viewing' }))
    expect(screen.getByLabelText('Your message').value).toContain('arrange a viewing')
    fillEnquiry()
    fireEvent.submit(screen.getByRole('form', { name: 'Property enquiry' }))
    expect(await screen.findByText('The form is ready. This design preview does not send or store enquiries.')).toBeTruthy()
    expect(enquiry).not.toHaveBeenCalled()
  })

  it('offers the matching application journey and returns focus after a preview', async () => {
    const rental = previewProperties[1]
    render(<RevoPropertyExperience client={previewWebsiteClient} propertyId={rental.id} preview />)
    await screen.findByRole('heading', { name: rental.title })
    expect(screen.queryByRole('button', { name: 'Apply for a bond' })).toBeNull()
    const application = screen.getByRole('button', { name: 'Apply to rent' })
    const dialog = document.querySelector('.revo-application-dialog')
    dialog.showModal = () => { dialog.open = true }
    dialog.close = () => { dialog.open = false }
    fireEvent.click(application)
    expect(screen.getByRole('dialog', { name: 'Your new chapter starts here.' })).toBeTruthy()
    expect(screen.getByText(/No application is submitted/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the property' }))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(application)
  })

  it('browses property photographs inline and wraps in both directions', async () => {
    render(<RevoPropertyExperience client={previewWebsiteClient} propertyId={property.id} preview />)
    await screen.findByRole('heading', { name: property.title })
    const next = screen.getByRole('button', { name: 'Next property photo' })
    const previous = screen.getByRole('button', { name: 'Previous property photo' })
    const gallery = document.querySelector('.revo-gallery')
    fireEvent.click(next)
    expect(gallery.firstElementChild.getAttribute('aria-label')).toBe('Open photo 2 of 3')
    expect(gallery.firstElementChild.querySelector('img').getAttribute('src')).toBe(property.photos[1].url)
    fireEvent.click(next)
    fireEvent.click(next)
    expect(gallery.firstElementChild.getAttribute('aria-label')).toBe('Open photo 1 of 3')
    fireEvent.click(previous)
    expect(gallery.firstElementChild.getAttribute('aria-label')).toBe('Open photo 3 of 3')
  })

  it('shows only the approved HTTPS application link for the property type', async () => {
    const { rerender } = render(<RevoPropertyExperience client={previewWebsiteClient} propertyId={property.id} bondApplicationUrl="https://finance.example.test/apply" rentalApplicationUrl="https://rent.example.test/apply" />)
    await screen.findByRole('heading', { name: property.title })
    expect(screen.getByRole('link', { name: 'Apply for a bond' }).href).toBe('https://finance.example.test/apply')
    expect(screen.queryByRole('link', { name: 'Apply to rent' })).toBeNull()
    const rental = previewProperties[1]
    rerender(<RevoPropertyExperience client={previewWebsiteClient} propertyId={rental.id} bondApplicationUrl="https://finance.example.test/apply" rentalApplicationUrl="https://rent.example.test/apply" />)
    await screen.findByRole('heading', { name: rental.title })
    expect(screen.getByRole('link', { name: 'Apply to rent' }).href).toBe('https://rent.example.test/apply')
    expect(screen.queryByRole('link', { name: 'Apply for a bond' })).toBeNull()
    rerender(<RevoPropertyExperience client={previewWebsiteClient} propertyId={rental.id} rentalApplicationUrl="javascript:alert(1)" />)
    expect(screen.queryByRole('link', { name: 'Apply to rent' })).toBeNull()
    expect(screen.queryByLabelText('Rental application')).toBeNull()
  })

  it('retains an enquiry retry key, records separate consent and waits for a confirmed CRM receipt', async () => {
    const enquiry = vi.fn().mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce({ accepted: true, leadId: 'confirmed-lead' })
    const development = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Example development' }
    render(<RevoPropertyExperience client={{ ...previewWebsiteClient, property: async () => ({ ...property, development }), enquiry }} propertyId={property.id} sourcePageUrl="https://revo.example.test/properties?utm_source=review" />)
    await screen.findByRole('heading', { name: property.title })
    fillEnquiry()
    const form = screen.getByRole('form', { name: 'Property enquiry' })
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Temporarily unavailable')
    fireEvent.submit(form)
    expect(await screen.findByText('Your enquiry has reached the Revo team. We will be in touch.')).toBeTruthy()
    expect(enquiry.mock.calls[0][0]).toEqual(enquiry.mock.calls[1][0])
    expect(enquiry.mock.calls[0][0]).toMatchObject({ listingId: property.id, developmentId: development.id, consent: { privacyAccepted: true, marketingConsent: false, wordingVersion: 'revo-property-enquiry-v1' }, utm: { utmSource: 'review' } })
    expect(enquiry.mock.calls[0][0].idempotencyKey).toMatch(/^revo-/)
  })

  it('does not show a sent confirmation when the server response lacks a lead receipt', async () => {
    render(<RevoPropertyExperience client={{ ...previewWebsiteClient, enquiry: async () => ({ accepted: true }) }} propertyId={property.id} sourcePageUrl="https://revo.example.test/properties" />)
    await screen.findByRole('heading', { name: property.title })
    fillEnquiry()
    fireEvent.submit(screen.getByRole('form', { name: 'Property enquiry' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'We could not confirm your enquiry. Please try again.')
    expect(screen.queryByText(/Your enquiry has reached/)).toBeNull()
  })

  it('shows API failures with retry and a withdrawn deep link without an enquiry form', async () => {
    const listings = vi.fn().mockRejectedValueOnce(new Error('Connection unavailable')).mockImplementation(previewWebsiteClient.listings)
    const { rerender } = render(<RevoPropertyExperience client={{ ...previewWebsiteClient, listings }} />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Connection unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('6 properties to explore')
    rerender(<RevoPropertyExperience client={previewWebsiteClient} propertyId="withdrawn" />)
    expect(await screen.findByRole('heading', { name: 'This property has moved on.' })).toBeTruthy()
    await waitFor(() => expect(within(document.body).queryByRole('form', { name: 'Property enquiry' })).toBeNull())
  })
})
