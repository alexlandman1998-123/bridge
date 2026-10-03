// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SellerPortalPasswordGate from '../SellerPortalPasswordGate.jsx'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const base = { form: { password: '', confirmPassword: '', termsAccepted: false }, onChange: vi.fn(), onSubmit: vi.fn(), onRequestRecovery: vi.fn() }
it('keeps fee consent out of password setup and exposes privacy wording', () => {
  const { container } = render(<SellerPortalPasswordGate {...base} authState={{propertyTitle: '694 Cicely Street'}} />)
  expect(container.textContent).not.toMatch(/fee|750/i)
  expect(screen.getByLabelText('Create password').type).toBe('password')
  fireEvent.click(screen.getByRole('button', {name: 'Show password'}))
  expect(screen.getByLabelText('Create password').type).toBe('text')
  expect(screen.getByLabelText('Confirm password').type).toBe('text')
  fireEvent.click(screen.getByRole('checkbox'))
  expect(base.onChange).toHaveBeenCalledWith('termsAccepted', true)
  expect(container.querySelector('details').textContent).toMatch(/POPI/)
})
it('preserves sign-in and recovery flows without requiring new acceptance', () => {
  const { rerender } = render(<SellerPortalPasswordGate {...base} authState={{passwordSet: true, sessionExpired: true}} />)
  expect(screen.queryByLabelText('Confirm password')).toBeNull()
  expect(screen.queryByRole('checkbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', {name:'Forgot your password?'}))
  expect(base.onRequestRecovery).toHaveBeenCalled()
  rerender(<SellerPortalPasswordGate {...base} authState={{passwordSet: true, tokenKind:'recovery'}} feedback="Passwords do not match." saving />)
  expect(screen.getByLabelText('Confirm password')).toBeTruthy()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByRole('alert').textContent).toBe('Passwords do not match.')
  expect(screen.getByRole('button', {name:'Please wait…'}).disabled).toBe(true)
})

it('loads the agency identity from the seller link and falls back to its name when the logo fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ branding: {
    agencyName: 'Only Realty', logoDarkUrl: '/only-realty.svg', primaryColour: '#f4cc23', secondaryColour: '#101820',
  } }) }))
  const { container } = render(<SellerPortalPasswordGate {...base} token="seller-one" />)
  const logo = await screen.findByAltText('Only Realty logo')
  expect(fetch).toHaveBeenCalledWith('/api/public/seller-onboarding-branding?token=seller-one', expect.objectContaining({signal: expect.any(AbortSignal)}))
  expect(container.querySelector('main').style.getPropertyValue('--seller-brand-primary')).toBe('#f4cc23')
  expect(container.querySelector('main').style.getPropertyValue('--seller-brand-intro-text')).toBe('#142132')
  expect(container.textContent).not.toMatch(/Powered by Arch9|arch9\./)
  fireEvent.error(logo)
  await waitFor(() => expect(screen.queryByAltText('Only Realty logo')).toBeNull())
  expect(container.querySelector('header').textContent).toContain('Only Realty')
})
