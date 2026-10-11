import { ArrowUpRight, Building2, Home, Plus, Search, UserRound } from 'lucide-react'
import { useState } from 'react'
import Button from '../ui/Button'
import DataTable, { DataTableInner } from '../ui/DataTable'
import Field from '../ui/Field'
import SearchInput from '../ui/SearchInput'
import './development-transactions.css'

function label(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function Agency({ agency }) {
  const [failedUrl, setFailedUrl] = useState('')
  const name = agency?.name || 'Agency pending'
  return <div className="development-transaction-agency">
    <span className="development-transaction-agency-logo" aria-hidden="true">
      {agency?.logoUrl && failedUrl !== agency.logoUrl
        ? <img src={agency.logoUrl} alt="" loading="lazy" onError={() => setFailedUrl(agency.logoUrl)} />
        : agency ? initials(name) || 'AG' : <Building2 size={18} />}
    </span>
    <span title={name}>{name}</span>
  </div>
}

function PropertyImage({ src }) {
  const [failedUrl, setFailedUrl] = useState('')
  return <span className="transaction-property-thumb" aria-hidden="true">
    {src && failedUrl !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailedUrl(src)} /> : <span className="transaction-property-placeholder"><Home size={24} /></span>}
  </span>
}

function stageClass(key) {
  return ({ REG: 'green', XFER: 'blue', FIN: 'amber', DEP: 'amber', ATTY: 'purple', OTP: 'green' })[key] || 'neutral'
}

export default function DevelopmentTransactionsWorkspace({
  rows = [], search = '', onSearchChange, stageFilter = 'all', onStageChange,
  stages = [], developmentName = '', coverImageUrl = '', onCreateTransaction, onOpenTransaction,
  unlinkedCount = 0, backfillSaving = false, backfillProgress = {}, onBackfill,
}) {
  const filtered = Boolean(search.trim() || stageFilter !== 'all')
  function clearFilters() {
    onSearchChange('')
    onStageChange('all')
  }

  return <DataTable title="Transactions" className="table-panel agent-transactions-panel transactions-page-compact development-transactions-workspace" actions={
    <div className="agent-transactions-header-actions"><Button type="button" className="agent-transactions-create-button" onClick={onCreateTransaction}><Plus size={16} />Add Transaction</Button></div>
  }>
    <div className="development-transactions-toolbar" aria-label="Transaction filters">
      <SearchInput aria-label="Search development transactions" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search buyer, unit, or email" />
      <Field as="select" aria-label="Filter transactions by stage" value={stageFilter} onChange={event => onStageChange(event.target.value)}>
        <option value="all">All stages</option>
        {stages.map(stage => <option key={stage} value={stage}>{label(stage)}</option>)}
      </Field>
      <span className="development-transactions-count" role="status">{rows.length} {rows.length === 1 ? 'transaction' : 'transactions'}{filtered ? ' shown' : ''}</span>
      {filtered ? <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
    </div>

    {unlinkedCount ? <div className="development-transactions-backfill">
      <span className="development-transactions-backfill-icon" aria-hidden="true"><Building2 size={20} /></span>
      <div className="min-w-0 flex-1">
        <strong>{unlinkedCount} progressed {unlinkedCount === 1 ? 'unit needs a transaction' : 'units need transactions'}</strong>
        <p>Backfill creates one incomplete transaction per unit at its current status. Buyer, finance and attorney details remain ready for capture; no placeholder information is created.</p>
      </div>
      <Button type="button" size="sm" onClick={onBackfill} disabled={backfillSaving}><Plus size={15} />{backfillSaving ? `Backfilling ${backfillProgress.completed} of ${backfillProgress.total}…` : `Backfill ${unlinkedCount} transaction${unlinkedCount === 1 ? '' : 's'}`}</Button>
    </div> : null}

    {rows.length ? <DataTableInner className="units-table agent-transactions-table transaction-ops-table agent-transactions-compact-table">
      <thead><tr><th className="agent-transactions-sticky-first">Property</th><th>Buyer</th><th>Progress</th><th>Agency</th><th>Actions</th></tr></thead>
      <tbody>{rows.map(row => {
        const needsCapture = !row?.transaction?.id && Boolean(row?.unit?.id)
        const canOpen = Boolean(row?.transaction?.id || row?.unit?.id)
        const unit = `Unit ${row.unit?.unit_number || '—'}`
        const stage = label(row.transaction?.stage || row.unit?.status || 'available')
        const progress = Math.max(0, Math.min(100, Number(row.progressPercent) || 0))
        const buyer = needsCapture ? 'Buyer details pending' : row.buyerDisplayName
        const image = row.unit?.image_url || row.transaction?.property_image_url || coverImageUrl
        const open = () => canOpen && onOpenTransaction(row)
        return <tr key={row.transaction?.id || row.unit?.id} className={canOpen ? 'ui-data-row-clickable' : ''} onClick={open}>
          <td className="agent-transactions-sticky-first" data-label="Property"><div className="transaction-property-cell">
            <PropertyImage src={image} />
            <span className="transaction-property-copy"><strong className="transaction-property-title" title={unit}>{unit}</strong><small className="transaction-property-suburb" title={developmentName}>{developmentName}</small><span className={`transaction-property-badge transaction-property-badge-${stageClass(row.mainStageKey)}`}>{stage}</span></span>
          </div></td>
          <td data-label="Buyer"><div className="transaction-buyer-profile">
            <span className="transaction-buyer-avatar" aria-hidden="true">{needsCapture || !row.buyer?.name ? <UserRound size={18} /> : initials(buyer)}</span>
            <span className="transaction-buyer-copy"><strong className="transaction-buyer-name" title={buyer}>{buyer}</strong><small className="transaction-buyer-meta" title={needsCapture ? '' : row.buyerEmail}>{needsCapture ? 'Ready for capture' : row.buyerEmail}</small></span>
          </div></td>
          <td data-label="Progress"><div className="transaction-progress-cell"><div className="transaction-progress-summary"><strong>{progress}%</strong></div><span className="transaction-progress-stage">{stage}</span><div className="transaction-progress-track" role="progressbar" aria-label={`${unit} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div></div></td>
          <td data-label="Agency"><Agency agency={row.responsibleAgency} /></td>
          <td data-label="Actions" onClick={event => event.stopPropagation()}><div className="transaction-row-actions">{canOpen ? <Button type="button" variant="secondary" size="sm" className="table-action-button transaction-row-action-primary" onClick={open} aria-label={`${needsCapture ? 'Capture transaction for' : 'Open transaction for'} ${unit}`}><ArrowUpRight size={14} />{needsCapture ? 'Capture' : 'Open'}</Button> : null}</div></td>
        </tr>
      })}</tbody>
    </DataTableInner> : <div className="agent-transactions-empty-state">
      <span className="agent-transactions-empty-icon" aria-hidden="true">{filtered ? <Search size={24} /> : <Home size={24} />}</span>
      <div className="agent-transactions-empty-copy"><strong>{filtered ? 'No transactions match your filters' : 'No transactions yet'}</strong></div>
      <Button type="button" variant={filtered ? 'secondary' : 'primary'} onClick={filtered ? clearFilters : onCreateTransaction}>{filtered ? 'Clear filters' : 'Add Transaction'}</Button>
    </div>}
  </DataTable>
}
