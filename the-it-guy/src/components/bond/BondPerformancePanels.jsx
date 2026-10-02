import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import BondSectionCard from './BondSectionCard'
import { bondMoney } from '../../services/bondDashboardPerformanceModel'

const format = (value, money) => money ? bondMoney(value) : new Intl.NumberFormat('en-ZA').format(value)

export function RegistrationTargets({ performance = {}, canConfigure = false }) {
  return <BondSectionCard title="Monthly targets" className="bond-performance-panel bond-target-panel" action={canConfigure ? <Link className="bond-panel-link" to="/settings/organisation#targets">Edit targets <ArrowUpRight size={14} /></Link> : null}>
    <p className="bond-panel-caption">{performance.period} · {performance.canCompareTargets ? 'Organisation' : 'Your scope'}</p>
    <div className="bond-target-list">{(performance.targets || []).map((target) => <div key={target.key}>
      <div className="bond-target-label"><span>{target.label}</span><span>{target.progress === null ? 'Target not set' : `${target.progress}% achieved`}</span></div>
      <div className="bond-target-total"><strong>{format(target.actual, target.money)}</strong>{target.target > 0 ? <span>of {format(target.target, target.money)}</span> : null}</div>
      <div className="bond-progress-track" role={target.target > 0 ? 'progressbar' : undefined} aria-label={target.target > 0 ? target.label : undefined} aria-valuemin={target.target > 0 ? 0 : undefined} aria-valuemax={target.target > 0 ? 100 : undefined} aria-valuenow={target.target > 0 ? Math.min(target.progress, 100) : undefined} aria-valuetext={target.target > 0 ? `${target.progress}% achieved` : undefined}><span style={{ width: `${Math.min(target.progress || 0, 100)}%` }} /></div>
    </div>)}</div>
    <p className="bond-panel-footnote">{performance.canCompareTargets ? 'Based on recorded registration dates.' : 'Organisation targets are shown in the organisation dashboard.'}</p>
  </BondSectionCard>
}

export function ApplicationConversion({ performance = {} }) {
  const data = performance.conversion || {}
  const steps = [{ label: 'Submitted', count: data.submitted }, { label: 'Approved', count: data.approved, rate: data.approvalRate }, { label: 'Registered', count: data.registered, rate: data.registrationRate }]
  return <BondSectionCard title="Application conversion" className="bond-performance-panel">
    <p className="bond-panel-caption">First submitted in {performance.period}</p>
    {performance.bankAvailable === false ? <p className="bond-data-message">Bank submission records are unavailable. Refresh to try again.</p> : <div className="bond-conversion-steps">{steps.map((step, index) => <div className="bond-conversion-step" key={step.label}>
      <div className="bond-step-heading"><span className="bond-step-number">0{index + 1}</span>{index < 2 ? <ChevronRight size={16} /> : null}</div>
      <strong>{step.count || 0}</strong><span className="bond-step-label">{step.label}</span>
      <div className="bond-conversion-bar"><span style={{ width: `${data.submitted ? (step.count || 0) / data.submitted * 100 : 0}%` }} /></div>
      <span className="bond-step-rate">{index === 0 ? 'Unique applications' : step.rate === null || step.rate === undefined ? 'No cohort data yet' : `${step.rate}% of ${index === 1 ? 'submitted' : 'approved'}`}</span>
    </div>)}</div>}
    <p className="bond-panel-footnote">Outcomes to date for the same applications. Multiple bank submissions count once.</p>
  </BondSectionCard>
}

export function BankTurnaround({ performance = {} }) {
  const rows = performance.banks || []
  return <BondSectionCard title="Bank turnaround" className="bond-performance-panel" action={<Link className="bond-panel-link" to="/bond/banks">View banks <ArrowUpRight size={14} /></Link>}>
    <p className="bond-panel-caption">Submissions made in {performance.period}</p>
    {performance.bankAvailable === false ? <p className="bond-data-message">Bank submission records are unavailable. Refresh to try again.</p> : rows.length ? <div className="bond-bank-table-wrap"><table className="bond-bank-table"><thead><tr><th>Bank</th><th>Submitted</th><th>Approved</th><th>Avg. decision time</th></tr></thead><tbody>{rows.map((bank) => <tr key={bank.name}><td><div className="bond-bank-name"><span>{bank.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><strong>{bank.name}</strong></div></td><td>{bank.submitted}</td><td>{bank.approved}<small>{bank.approvalRate === null ? 'No decisions' : `${bank.approvalRate}% of decisions`}</small></td><td><strong>{bank.days === null ? '—' : `${bank.days} days`}</strong><small>{bank.measured} dated {bank.measured === 1 ? 'decision' : 'decisions'}</small></td></tr>)}</tbody></table></div> : <div className="bond-data-message"><strong>No submissions this month</strong><p>Bank outcomes and decision times will appear after submissions are recorded.</p></div>}
    <p className="bond-panel-footnote">Calendar days from submission to dated approval or decline. Undated decisions are excluded.</p>
  </BondSectionCard>
}

export function CommissionBreakdown({ performance = {} }) {
  return <BondSectionCard title="Commission breakdown" className="bond-performance-panel">
    <p className="bond-panel-caption">Open commission ledger · paid in {performance.period}</p>
    {performance.commissionAvailable === false ? <p className="bond-data-message">Commission records are unavailable. Refresh to try again.</p> : <div className="bond-commission-grid">{(performance.commissions || []).map((bucket) => <div className={`bond-commission-item bond-commission-${bucket.key}`} key={bucket.key}>
      <span className="bond-commission-label"><i />{bucket.label}</span><strong>{bondMoney(bucket.amount)}</strong><span>{bucket.count} {bucket.count === 1 ? 'record' : 'records'}</span>
    </div>)}</div>}
    <p className="bond-panel-footnote">Pending → approved → processing → paid. Each ledger entry appears in one category.</p>
  </BondSectionCard>
}
