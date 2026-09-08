'use client'

import { useState } from 'react'
import Link from 'next/link'
import { loanFromBudget, repayment, savingsMonths } from '@/lib/finance'
import styles from './resources.module.css'

const money = (amount: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
type Mode = 'repayment' | 'affordability' | 'deposit'
const modes: { key: Mode; title: string; description: string }[] = [
  { key: 'repayment', title: 'Bond repayment', description: 'What could your monthly repayment look like?' },
  { key: 'affordability', title: 'Affordability', description: 'Explore a home budget that works for your life.' },
  { key: 'deposit', title: 'Deposit planner', description: 'Turn your deposit goal into a monthly plan.' },
]

export function FinanceCalculators() {
  const [mode, setMode] = useState<Mode>('repayment')
  const [values, setValues] = useState<Record<string, string>>({ price: '2000000', deposit: '200000', rate: '10', years: '20', income: '45000', expenses: '18000', debt: '3000', reserve: '8000', saved: '50000', monthly: '5000', target: '200000' })
  const n = (key: string) => Number(values[key])
  const fields = mode === 'repayment' ? ['price', 'deposit', 'rate', 'years'] : mode === 'affordability' ? ['income', 'expenses', 'debt', 'reserve', 'deposit', 'rate', 'years'] : ['target', 'saved', 'monthly']
  const valid = fields.every(key => values[key] !== '' && Number.isFinite(n(key)) && n(key) >= (key === 'years' ? 1 : 0) && n(key) <= (key === 'rate' ? 30 : key === 'years' ? 30 : 1_000_000_000))
  const depositValid = mode !== 'repayment' || n('deposit') <= n('price')
  const principal = Math.max(0, n('price') - n('deposit'))
  const payment = repayment(principal, n('rate'), n('years'))
  const budget = Math.max(0, n('income') - n('expenses') - n('debt') - n('reserve'))
  const affordableLoan = loanFromBudget(budget, n('rate'), n('years'))
  const months = savingsMonths(n('target'), n('saved'), n('monthly'))
  const labels: Record<string, string> = { price: 'Purchase price (R)', deposit: 'Deposit (R)', rate: 'Annual interest rate (%)', years: 'Loan term (years)', income: 'Monthly take-home income (R)', expenses: 'Living costs, rates, levies & insurance (R/month)', debt: 'Existing debt repayments (R/month)', reserve: 'Monthly savings & safety buffer (R)', target: 'Deposit savings goal (R)', saved: 'Already saved (R)', monthly: 'Monthly contribution (R)' }
  return <section className={styles.calculator}>
    <div className={styles.tabs} aria-label="Choose a calculator">{modes.map(item => <button key={item.key} type="button" aria-pressed={mode === item.key} onClick={() => setMode(item.key)}>{item.title}</button>)}</div>
    <div className={styles.calcGrid}>
      <div><h2>{modes.find(item => item.key === mode)?.description}</h2><div className={styles.fields}>{fields.map(key => <label key={key}>{labels[key]}<input type="number" inputMode="decimal" min={key === 'years' ? 1 : 0} max={key === 'rate' ? 30 : key === 'years' ? 30 : 1_000_000_000} step={key === 'years' ? 1 : 'any'} value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div>{mode !== 'deposit' && <p className={styles.note}>10% is an illustrative starting rate, not a current bank quote. Enter your offered rate.</p>}</div>
      <div className={styles.result} aria-live="polite" aria-atomic="true">
        {!valid || !depositValid ? <><p>Check your figures</p><h3>Let’s get the details right.</h3><p>{!depositValid ? 'The deposit cannot exceed the purchase price.' : 'Complete every field with a valid amount. Use a term of 1–30 years and an interest rate of 0–30%.'}</p></> : mode === 'repayment' ? <><p>Estimated monthly repayment</p><strong>{money(payment)}</strong><dl><div><dt>Bond amount</dt><dd>{money(principal)}</dd></div><div><dt>Total interest over the term</dt><dd>{money(Math.max(0, payment * n('years') * 12 - principal))}</dd></div><div><dt>Total bond repayments</dt><dd>{money(payment * n('years') * 12)}</dd></div></dl><p>Assumes an unchanged rate and equal monthly payments. Excludes bank fees, insurance, transfer costs, rates and levies.</p></> : mode === 'affordability' ? <><p>Illustrative purchase budget</p><strong>{money(affordableLoan + n('deposit'))}</strong><dl><div><dt>Available for monthly repayment</dt><dd>{money(budget)}</dd></div><div><dt>Estimated bond amount</dt><dd>{money(affordableLoan)}</dd></div><div><dt>Your deposit</dt><dd>{money(n('deposit'))}</dd></div></dl><p>{budget === 0 ? 'Your entered commitments leave no monthly repayment budget. Review your figures before planning a loan.' : 'Based on the repayment budget you entered, not a lender’s affordability or credit assessment. Allow separately for upfront purchase costs.'}</p></> : <><p>Your savings timeline</p><strong>{months === null ? 'Set a contribution' : months === 0 ? 'Goal reached' : `${months} ${months === 1 ? 'month' : 'months'}`}</strong><dl><div><dt>Still to save</dt><dd>{money(Math.max(0, n('target') - n('saved')))}</dd></div><div><dt>Monthly contribution</dt><dd>{money(n('monthly'))}</dd></div></dl><p>{months === null ? 'Add a monthly contribution to see when you could reach your goal.' : 'Assumes regular contributions and no savings interest. Keep a separate allowance for moving and purchase costs.'}</p></>}
        <Link className={styles.button} href="/preapproval">Explore preapproval <span aria-hidden="true">↗</span></Link>
      </div>
    </div>
    <p className={styles.note}>Planning estimates only, not a loan offer or approval. Your figures stay in this browser and are not submitted to the agency. <a href="https://www.standardbank.co.za/southafrica/personal/products-and-services/borrow-for-your-needs/home-loans/calculator" target="_blank" rel="noreferrer">Compare with a bank calculator ↗</a></p>
  </section>
}
