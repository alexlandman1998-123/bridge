import { useState } from 'react'
import { Building2, Check, Clock3, Plus, Scale } from 'lucide-react'
import { sortPreferredPartners } from '../../lib/preferredPartners'

function FirmLogo({ partner }) {
  const [failedUrl, setFailedUrl] = useState('')
  const url = partner.logoUrl || partner.logoIconUrl
  return <span className="transaction-role-logo">{url && failedUrl !== url ? <img src={url} alt={`${partner.companyName} logo`} onError={() => setFailedUrl(url)} /> : <Building2 size={27} aria-hidden="true" />}</span>
}

export default function TransactionRolePicker({ title, description, partners = [], mode, selectedId, external, onSelect, onExternalChange, errors = {}, loading, unavailable, children }) {
  const sorted = sortPreferredPartners(partners)
  const featured = sorted.slice(0, 3)
  const selected = sorted.find((partner) => String(partner.id) === String(selectedId))
  return (
    <section className="transaction-role-card" aria-label={title}>
      <header className="transaction-role-heading"><span className="transaction-role-icon"><Scale size={21} aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p></div><span className="transaction-role-optional">Optional</span></header>
      {children}
      {loading ? <p className="transaction-role-hint">Loading firms…</p> : null}
      {featured.length ? <div className="transaction-role-firms">{featured.map((partner) => {
        const chosen = mode === 'agency' && String(selectedId) === String(partner.id)
        return <button type="button" className="transaction-role-firm" key={partner.id} aria-pressed={chosen} onClick={() => onSelect('agency', partner.id)}>
          <FirmLogo partner={partner} />
          <strong>{partner.companyName}</strong><span>{partner.contactPerson || 'Firm allocation'}</span>{chosen ? <Check className="transaction-role-check" size={17} aria-hidden="true" /> : null}
        </button>
      })}</div> : null}
      {sorted.length > 3 ? <label className="transaction-role-more">More firms<select value={mode === 'agency' ? selectedId : ''} onChange={(event) => event.target.value && onSelect('agency', event.target.value)}><option value="">Choose a firm</option>{sorted.map((partner) => <option value={partner.id} key={partner.id}>{partner.companyName}</option>)}</select></label> : null}
      <div className="transaction-role-actions"><button type="button" aria-pressed={mode === 'buyer'} onClick={() => onSelect('buyer')}><Plus size={16} aria-hidden="true" />Another firm</button><button type="button" aria-pressed={mode === 'none'} onClick={() => onSelect('none')}><Clock3 size={16} aria-hidden="true" />Allocate later</button></div>
      {unavailable ? <p className="transaction-role-hint">Saved firms couldn’t be loaded. Enter your firm or allocate later.</p> : null}
      {mode === 'agency' && selected ? <p className="transaction-role-hint">{selected.companyName} will receive the matter for allocation.</p> : null}
      {mode === 'buyer' ? <div className="transaction-role-external"><p>An invitation will be sent when you create the transaction.</p><div className="transaction-role-fields">{[['CompanyName', 'Firm name', 'text'], ['ContactPerson', 'Contact person', 'text'], ['Email', 'Invitation email', 'email'], ['Phone', 'Phone', 'tel']].map(([key, label, type]) => <label key={key}>{label}<input type={type} value={external[key] || ''} onChange={(event) => onExternalChange(key, event.target.value)} aria-invalid={Boolean(errors[key])} />{errors[key] ? <span role="alert">{errors[key]}</span> : null}</label>)}</div></div> : null}
    </section>
  )
}
