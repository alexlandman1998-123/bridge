'use client'

import { useState } from 'react'
import Link from 'next/link'
import { propertyAffordability } from '@/lib/finance'
import styles from './resources.module.css'

const money = (amount: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
const fields = [
  ['price', 'Purchase price (R)'], ['deposit', 'Deposit (R)'],
  ['rate', 'Annual interest rate (%)'], ['years', 'Loan term (years)'],
  ['income', 'Monthly take-home household income (R)'], ['expenses', 'Living costs, rates, levies & insurance (R/month)'],
  ['debt', 'Existing debt repayments (R/month)'], ['reserve', 'Monthly savings & safety buffer (R)'],
] as const

export function PropertyAffordability({ price }: { price?: number }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    price: price && price > 0 ? String(price) : '', deposit: '0', rate: '10', years: '20',
    income: '', expenses: '', debt: '0', reserve: '',
  }))
  const complete = fields.every(([key]) => values[key].trim() !== '')
  const result = complete ? propertyAffordability({
    price: Number(values.price), deposit: Number(values.deposit), rate: Number(values.rate), years: Number(values.years),
    income: Number(values.income), expenses: Number(values.expenses), debt: Number(values.debt), reserve: Number(values.reserve),
  }) : null

  return <section className={`${styles.page} ${styles.propertyCalculator}`} id="property-affordability" aria-labelledby="property-affordability-title">
    <div className={styles.calcGrid}>
      <div>
        <h2 id="property-affordability-title">Can I afford this property?</h2>
        <p className={styles.note}>{price ? 'Start with this home’s asking price, then enter your household budget.' : 'Enter a purchase price and your household budget to explore the repayments.'} Adjust the deposit, interest rate and term to compare options.</p>
        <div className={styles.fields}>{fields.map(([key, label]) => <label key={key}>{label}<input type="number" inputMode="decimal" min={key === 'years' || key === 'price' ? 1 : 0} max={key === 'rate' ? 30 : key === 'years' ? 30 : 1_000_000_000} step={key === 'years' ? 1 : 'any'} value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
        <p className={styles.note}>10% is an illustrative starting rate. Enter the rate offered by your bank. Include ongoing property costs in your monthly expenses.</p>
      </div>
      <div className={styles.result} aria-live="polite" aria-atomic="true">
        {result ? <>
          <p>Estimated monthly bond repayment</p><strong>{money(result.payment)}</strong>
          <h3>{result.remaining >= 0 ? 'Within your entered monthly budget' : 'Above your entered monthly budget'}</h3>
          <dl>
            <div><dt>Bond amount</dt><dd>{money(result.principal)}</dd></div>
            <div><dt>Available for bond repayment</dt><dd>{money(result.budget)}</dd></div>
            <div><dt>{result.remaining >= 0 ? 'Monthly buffer after repayment' : 'Monthly shortfall'}</dt><dd>{money(Math.abs(result.remaining))}</dd></div>
          </dl>
          <p>Based on the figures you entered, with an unchanged interest rate and equal monthly repayments. Bank fees and upfront purchase costs are excluded.</p>
        </> : <><p>Your affordability estimate</p><h3>{complete ? 'Check your figures' : 'Let’s work out your monthly budget.'}</h3><p>{complete ? 'Use a positive purchase price, a deposit no larger than the price, a whole term of 1–30 years and a rate of 0–30%. All other amounts must be zero or positive.' : 'Complete the fields to compare this home’s estimated repayment with your income, expenses and savings. Enter 0 where a cost does not apply.'}</p></>}
        <Link className={styles.button} href="/preapproval">Explore preapproval <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
    <p className={styles.note}>Planning estimate only, not a loan offer or bank approval. Your figures stay in this browser and are not submitted to the agency.</p>
  </section>
}
