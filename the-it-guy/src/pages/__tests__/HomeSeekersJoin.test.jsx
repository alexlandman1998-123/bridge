// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import HomeSeekersJoin from '../HomeSeekersJoin'

afterEach(cleanup)

it('presents individual subscriptions and reveals team pricing in the option popup', () => {
  render(<HomeSeekersJoin />)
  for (const option of ['Prepaid', 'Upfront']) {
    const card = screen.getByRole('article', { name: option })
    expect(card.textContent).not.toMatch(/team|leader/i)
    expect(screen.queryByRole('dialog', { name: option })).toBeNull()

    fireEvent.click(within(card).getByRole('button', { name: `View details for ${option}` }))
    const popup = screen.getByRole('dialog', { name: option })
    expect(within(popup).getByRole('heading', { name: 'Bringing a team?' })).toBeTruthy()
    expect(within(popup).getByRole('rowheader', { name: 'Team leader' })).toBeTruthy()
    expect(within(popup).getByRole('rowheader', { name: 'Seats 2 to 5' })).toBeTruthy()
    expect(within(popup).getByRole('rowheader', { name: 'Seat 6 onwards' })).toBeTruthy()
    fireEvent.click(within(popup).getByRole('button', { name: 'Back to options' }))
  }
})

it('bases rental fees on collected rent in the page and rental book popup', () => {
  render(<HomeSeekersJoin />)
  const rentals = screen.getByRole('region', { name: 'Build a rental book. Keep it yours.' })
  expect(within(rentals).getByText('3.5% of rent collected')).toBeTruthy()
  expect(within(rentals).getByText(/Home Seekers’ fee: R12[,\s]000 × 3\.5%/)).toBeTruthy()
  expect(within(rentals).getByText('R420', { selector: 'dd' })).toBeTruthy()
  expect(within(rentals).getByText('R780 / month', { selector: 'dd' })).toBeTruthy()

  fireEvent.click(within(rentals).getByRole('button', { name: 'Explore the rental offering' }))
  const popup = screen.getByRole('dialog', { name: 'Build a rental book.' })
  expect(within(popup).getByText('3.5% of rent collected')).toBeTruthy()
  expect(within(popup).getByText('R420', { selector: 'dd' })).toBeTruthy()
  expect(within(popup).getByText('R780 / month', { selector: 'dd' })).toBeTruthy()
  expect(within(popup).getByText(/Home Seekers’ fee: R600[,\s]000 × 3\.5%/)).toBeTruthy()
  expect(within(popup).getByText(/R21[,\s]000/, { selector: 'dd' })).toBeTruthy()
  expect(within(popup).getByText(/remaining each month, R468[,\s]000 a year/).parentElement.textContent).toMatch(/R39[,\s]000/)
})

it('calculates the requested growth illustration using 6% commission', () => {
  render(<HomeSeekersJoin />)
  const growth = screen.getByRole('region', { name: /The better you get,.*the cheaper we get\./i })
  for (const [sales, percentage] of [[5, 26], [8, 17], [10, 14], [15, 10], [20, 8]]) {
    const row = within(growth).getByText(`${sales} sales a year`).parentElement
    expect(row.querySelector('strong').textContent).toBe(`${percentage}%`)
  }
  expect(within(growth).getByText(/R123[,\s]000 for the year/)).toBeTruthy()
  expect(within(growth).getByText('Rounded percentages using option 2, an average R1.5 million sale price and 6% commission, excluding VAT.')).toBeTruthy()
})
