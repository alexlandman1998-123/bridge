'use client'

import { useState } from 'react'
import Link from 'next/link'
import { propertyAffordability } from '@/lib/finance'
import styles from './property-affordability.module.css'

const money = (amount: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
const loanFields = ['price', 'deposit', 'rate', 'years'] as const
const budgetFields = [
  { key: 'income', label: 'Take-home household income', hint: 'Combined income after tax.', placeholder: 'e.g. 45 000' },
  { key: 'expenses', label: 'Monthly living costs', hint: 'Include rates, levies, insurance and utilities.', placeholder: 'e.g. 18 000' },
  { key: 'debt', label: 'Existing debt repayments', hint: 'Car finance, credit cards and other loans.', placeholder: '0' },
  { key: 'reserve', label: 'Savings & safety buffer', hint: 'An amount to keep aside each month.', placeholder: '0' },
] as const

export function PropertyAffordability({ price }: { price?: number }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    price: price && price > 0 ? String(price) : '', deposit: '0', rate: '10', years: '20',
    income: '', expenses: '', debt: '0', reserve: '0',
  }))
  const update = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }))
  const loanComplete = loanFields.every(key => values[key].trim() !== '')
  const budgetComplete = budgetFields.every(({ key }) => values[key].trim() !== '')
  const loan = { price: Number(values.price), deposit: Number(values.deposit), rate: Number(values.rate), years: Number(values.years) }
  const estimate = loanComplete ? propertyAffordability({ ...loan, income: 0, expenses: 0, debt: 0, reserve: 0 }) : null
  const result = loanComplete && budgetComplete ? propertyAffordability({
    ...loan, income: Number(values.income), expenses: Number(values.expenses), debt: Number(values.debt), reserve: Number(values.reserve),
  }) : null
  const depositMax = Number.isFinite(loan.price) && loan.price > 0 && loan.price <= 1_000_000_000 ? loan.price : 0
  const sliderValue = (key: string, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(Number(values[key])) ? Number(values[key]) : min))
  const depositPercent = depositMax && Number.isFinite(loan.deposit) ? Math.round(loan.deposit / depositMax * 100) : 0
  const invalidFigures = (!estimate && loanComplete) || (budgetComplete && !result)

  return <section className={styles.calculator} id="property-affordability" aria-labelledby="property-affordability-title">
    <div className={styles.card}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>PLAN YOUR NEXT MOVE</p>
        <h2 id="property-affordability-title">Can I afford this property?</h2>
        <p>Adjust your home loan, then add your monthly budget to see how this home could fit.</p>
      </header>
      <div className={styles.layout}>
        <div className={styles.inputs}>
          <fieldset className={styles.group}>
            <legend><span>01</span>Your home loan</legend>
            <div className={styles.fields}>
              <label htmlFor="afford-price">Purchase price<span className={styles.amount}><span>R</span><input id="afford-price" type="number" inputMode="decimal" min="1" max="1000000000" step="any" value={values.price} onChange={event => update('price', event.target.value)} /></span></label>
              <label htmlFor="afford-deposit">Your deposit<span className={styles.amount}><span>R</span><input id="afford-deposit" type="number" inputMode="decimal" min="0" max={depositMax || 1_000_000_000} step="any" value={values.deposit} onChange={event => update('deposit', event.target.value)} /></span></label>
            </div>
            <div className={styles.sliderBlock}>
              <div className={styles.sliderHeading}><span>Adjust your deposit</span><b>{depositPercent}% of the price</b></div>
              <input className={styles.slider} aria-label="Adjust your deposit" aria-valuetext={money(sliderValue('deposit', 0, depositMax))} type="range" min="0" max={depositMax || 1} step="any" disabled={!depositMax} value={sliderValue('deposit', 0, depositMax)} onChange={event => update('deposit', event.target.value)} />
              <div className={styles.presets} aria-label="Deposit shortcuts">{[0, 10, 20].map(percent => <button type="button" key={percent} disabled={!depositMax} aria-pressed={depositMax > 0 && loan.deposit === Math.round(depositMax * percent / 100)} onClick={() => update('deposit', String(Math.round(depositMax * percent / 100)))}>{percent === 0 ? 'No deposit' : `${percent}% deposit`}</button>)}</div>
            </div>
            <div className={styles.fields}>
              <div className={styles.control}>
                <label htmlFor="afford-rate">Interest rate<span className={styles.amount}><input id="afford-rate" type="number" inputMode="decimal" min="0" max="30" step="any" value={values.rate} onChange={event => update('rate', event.target.value)} /><span>%</span></span></label>
                <input className={styles.slider} aria-label="Adjust interest rate" aria-valuetext={`${values.rate}% annually`} type="range" min="0" max="30" step="0.25" value={sliderValue('rate', 0, 30)} onChange={event => update('rate', event.target.value)} />
                <div className={styles.rangeEnds}><span>0%</span><span>30%</span></div>
              </div>
              <div className={styles.control}>
                <label htmlFor="afford-years">Loan term<span className={styles.amount}><input id="afford-years" type="number" inputMode="numeric" min="1" max="30" step="1" value={values.years} onChange={event => update('years', event.target.value)} /><span>years</span></span></label>
                <input className={styles.slider} aria-label="Adjust loan term" aria-valuetext={`${values.years} years`} type="range" min="1" max="30" step="1" value={sliderValue('years', 1, 30)} onChange={event => update('years', event.target.value)} />
                <div className={styles.rangeEnds}><span>1 year</span><span>30 years</span></div>
              </div>
            </div>
            <p className={styles.hint}>10% is an illustrative starting rate. Use the rate offered by your bank.</p>
          </fieldset>
          <fieldset className={styles.group}>
            <legend><span>02</span>Your monthly budget</legend>
            <div className={styles.fields}>{budgetFields.map(({ key, label, hint, placeholder }) => <div className={styles.control} key={key}>
              <label htmlFor={`afford-${key}`}>{label}<span className={styles.amount}><span>R</span><input id={`afford-${key}`} type="number" inputMode="decimal" min="0" max="1000000000" step="any" placeholder={placeholder} value={values[key]} aria-describedby={`afford-${key}-hint`} onChange={event => update(key, event.target.value)} /></span></label>
              <p className={styles.hint} id={`afford-${key}-hint`}>{hint}</p>
            </div>)}</div>
          </fieldset>
        </div>
        <aside className={styles.result} aria-label="Affordability estimate" aria-live="polite" aria-atomic="true">
          <p className={styles.resultLabel}>ESTIMATED MONTHLY REPAYMENT</p>
          <strong>{estimate ? money(estimate.payment) : '—'}</strong>
          <p className={styles.resultIntro}>{estimate ? `${money(estimate.principal)} bond over ${values.years} years at ${values.rate}% interest.` : 'Enter a valid price, deposit, interest rate and loan term to see your repayment.'}</p>
          <div className={styles.budgetResult}>
            {result ? <>
              <span className={result.remaining >= 0 ? styles.statusGood : styles.statusOver}>{result.remaining >= 0 ? 'Within your monthly budget' : 'Above your monthly budget'}</span>
              <dl>
                <div><dt>Available for your bond</dt><dd>{money(result.budget)}</dd></div>
                <div><dt>{result.remaining >= 0 ? 'Left after repayment' : 'Monthly shortfall'}</dt><dd>{money(Math.abs(result.remaining))}</dd></div>
              </dl>
              <p>Your living costs, existing debt and savings buffer are included in this comparison.</p>
            </> : <>
              <h3>{invalidFigures ? 'Check your figures' : 'How does it fit your budget?'}</h3>
              <p>{invalidFigures ? 'Use a positive price, a deposit no larger than the price, a whole term of 1–30 years and a rate of 0–30%. Monthly amounts must be zero or positive.' : 'Add your take-home income and monthly costs to see what you would have left after this repayment. Enter 0 where a cost does not apply.'}</p>
            </>}
          </div>
          <Link className={styles.button} href="/preapproval">Explore preapproval <span aria-hidden="true">↗</span></Link>
          <p className={styles.resultFootnote}>An estimate, not bank approval. Fees and upfront purchase costs are excluded.</p>
        </aside>
      </div>
      <footer className={styles.footer}>Based on an unchanged interest rate and equal monthly repayments. Your figures stay in this browser and are not submitted to the agency.</footer>
    </div>
  </section>
}
