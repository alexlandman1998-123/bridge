// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DemoInsurancePromotion, DemoBondLifeProducts, DemoBondRepaymentIllustration, DemoInsuranceQuoteCard } from '../DemoInsuranceComponents'
import { DEMO_INSURANCE_QUOTES } from '../demoInsuranceData'
import DemoBondLifeSection from '../DemoBondLifeSection'

afterEach(cleanup)

it('updates the Plus estimate from the slider and retains the contribution when reopened', () => {
  const { container } = render(<DemoBondLifeSection />)
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life Plus' }))
  const slider = screen.getByRole('slider', { name: 'Extra towards your bond each month' })
  const initialResults = container.querySelector('.demo-insurance-estimates').textContent
  fireEvent.change(slider, { target: { value: '3000' } })
  expect(container.querySelector('.demo-insurance-estimates').textContent).not.toBe(initialResults)
  expect(container.querySelector('.demo-insurance-payment-breakdown').textContent).toContain('R\u00a03\u00a0329')
  fireEvent.change(slider, { target: { value: '0' } })
  expect(within(container.querySelector('.demo-insurance-estimates')).getByText('30 years')).toBeTruthy()
  expect(screen.getByText('0 months')).toBeTruthy()
  expect(container.querySelector('.demo-insurance-estimates').textContent).toContain('R\u00a00')
  fireEvent.change(slider, { target: { value: '1000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life', exact: true }))
  expect(screen.queryByRole('slider')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life Plus' }))
  expect(screen.getByRole('slider').value).toBe('1000')
})

it('opens, switches and closes the demo product explanation without buying cover', () => {
  render(<DemoBondLifeSection />)
  expect(screen.queryByRole('region')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life Plus' }))
  expect(screen.getByRole('region', { name: 'Bond Life Plus details' }).textContent).toContain('Retrenchment protection')
  expect(screen.getByText('Illustrative product information and pricing. No cover is purchased through this demo. Insurance premiums are separate from extra bond contributions.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life', exact: true }))
  expect(screen.queryByRole('region', { name: 'Bond Life Plus details' })).toBeNull()
  expect(screen.getByRole('region', { name: 'Bond Life details' }).textContent).toContain('outstanding bond if you pass away')
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life', exact: true }))
  expect(screen.queryByRole('region')).toBeNull()
})

it('uses amount shortcuts to update the bond estimate and monthly budget together', () => {
  const { container } = render(<DemoBondLifeSection />)
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life Plus' }))
  const shortcuts = screen.getByRole('group', { name: 'Quick extra contribution amounts' })
  const originalEstimate = container.querySelector('.demo-insurance-estimates').textContent
  const thousand = within(shortcuts).getByRole('button', { name: /R\s+1\s+000/ })
  fireEvent.click(thousand)
  expect(screen.getByRole('slider').value).toBe('1000')
  expect(thousand.getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('.demo-insurance-payment-breakdown').textContent).toContain('R\u00a01\u00a0329')
  expect(container.querySelector('.demo-insurance-estimates').textContent).not.toBe(originalEstimate)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '1100' } })
  expect(thousand.getAttribute('aria-pressed')).toBe('false')
  expect(container.querySelector('.demo-insurance-payment-breakdown').textContent).toContain('R\u00a01\u00a0429')
})

it('uses readable foregrounds for a light agency brand and delegates the promotion action', () => {
  const onExplore = vi.fn()
  const { container } = render(<DemoInsurancePromotion theme={{ primaryColour: '#fc3', secondaryColour: '#fc3' }} onExplore={onExplore} />)
  const section = container.querySelector('section')
  expect(section.style.getPropertyValue('--insurance-on-secondary')).toBe('#000000')
  fireEvent.click(screen.getByRole('button', { name: 'Explore home cover' }))
  expect(onExplore).toHaveBeenCalledOnce()
})

it('exposes the selected product details and supports closing them', () => {
  const onSelectProduct = vi.fn()
  const { rerender } = render(<DemoBondLifeProducts onSelectProduct={onSelectProduct}><p>Details</p></DemoBondLifeProducts>)
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life Plus' }))
  expect(onSelectProduct).toHaveBeenCalledWith('bond-life-plus')
  rerender(<DemoBondLifeProducts selectedProductId="bond-life-plus" onSelectProduct={onSelectProduct}><p>Details</p></DemoBondLifeProducts>)
  expect(screen.getByRole('region', { name: 'Bond Life Plus details' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Explore Bond Life Plus' }))
  expect(onSelectProduct).toHaveBeenLastCalledWith('')
})

it('keeps the insurance premium separate from the contribution and makes no repayment claim without an estimate', () => {
  const onContributionChange = vi.fn()
  const { container } = render(<DemoBondRepaymentIllustration monthlyPremium={329} extraContribution={500} onContributionChange={onContributionChange} />)
  expect(container.querySelector('.demo-insurance-payment-breakdown').textContent).toContain('R\u00a0829')
  expect(screen.queryByText('Interest saved')).toBeNull()
  fireEvent.change(screen.getByRole('slider', { name: 'Extra towards your bond each month' }), { target: { value: '1000' } })
  expect(onContributionChange).toHaveBeenCalledWith(1000)
})

it('passes the exact combined quote to its handler and labels the sample price', () => {
  const quote = DEMO_INSURANCE_QUOTES.find(item => item.category === 'combined')
  const onViewQuote = vi.fn()
  render(<DemoInsuranceQuoteCard quote={quote} onViewQuote={onViewQuote} />)
  expect(screen.getByText('Building cover')).toBeTruthy()
  expect(screen.getByText('Contents cover')).toBeTruthy()
  expect(screen.getByText('Illustrative demo quotes')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: `View ${quote.insurer} combined demo quote` }))
  expect(onViewQuote).toHaveBeenCalledWith(quote)
})
