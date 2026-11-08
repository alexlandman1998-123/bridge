import { Link } from 'react-router-dom'
import { Clock3, FileText, UserRound } from 'lucide-react'

const date = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ')
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${text(item)}`).join(', ')
  return String(value ?? '').trim()
}
const money = value => value == null || value === '' ? '' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value))
const budget = (min, max) => [money(min), money(max)].filter(Boolean).join(' – ')
function Facts({ rows }) {
  return <dl className="wa-contact-facts">{rows.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{text(value)}</dd></div>)}</dl>
}
export function InboxContactProfile({ info, current, onManage, actions }) {
  const { contact, lead, context } = info
  return <>
    <section className="wa-info-section"><h3>Contact</h3><Facts rows={[
      ['Name', contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : current.contact_name],
      ['Phone', contact?.phone || current.contact_phone], ['Email', contact?.email], ['Contact type', contact?.contact_type],
      ['Added', date(contact?.created_at)],
    ]}/></section>
    {info.loading && <section className="wa-info-section"><p role="status">Loading profile…</p></section>}
    {info.error && <section className="wa-info-section"><p role="alert">{info.error}</p></section>}
    {lead && <section className="wa-info-section"><h3>Preferences</h3><Facts rows={[
      ['Budget', budget(lead.min_budget, lead.budget)], ['Areas', text(lead.area_interest)], ['Property interest', text(lead.property_interest)],
      ['Finance', lead.finance_type], ['Priority', lead.priority], ['Source', lead.lead_source],
    ]}/>{!lead.budget && !lead.area_interest && !lead.property_interest && !lead.finance_type && <p className="wa-empty-value">No preferences recorded</p>}</section>}
    {Boolean(info.requirements?.length) && <section className="wa-info-section"><h3>Requirements</h3>{info.requirements.map(requirement => <article className="wa-requirement" key={requirement.requirement_id}><h4>{requirement.title || 'Property requirements'}</h4><Facts rows={[
      ['Property types', text(requirement.property_types)], ['Locations', text([requirement.areas, requirement.suburbs])],
      ['Budget', budget(requirement.budget_min, requirement.budget_max)], ['Bedrooms', requirement.bedrooms_min], ['Bathrooms', requirement.bathrooms_min],
      ['Must-haves', text(requirement.must_haves)], ['Finance', requirement.finance_status], ['Timeframe', requirement.timeline], ['Preferred contact', requirement.communication_preference],
    ]}/>{requirement.notes && <p className="wa-contact-notes">{requirement.notes}</p>}</article>)}</section>}
    {(contact?.notes || lead?.notes) && <section className="wa-info-section"><h3>Saved notes</h3>{contact?.notes && <p className="wa-contact-notes">{contact.notes}</p>}{lead?.notes && lead.notes !== contact?.notes && <p className="wa-contact-notes">{lead.notes}</p>}</section>}
    <section className="wa-info-section"><h3>Linked records</h3>{context?.linked && <Link className="wa-record-link" to={context.linked.path}><UserRound size={15}/><span>{context.linked.name || 'Open CRM record'}<small>{context.linked.kind}</small></span></Link>}{info.linkedLeads?.filter(record => record.lead_id !== context?.linked?.recordId).map(record => <Link key={record.lead_id} className="wa-record-link" to={`/pipeline/leads/${record.lead_id}`}><FileText size={15}/><span>{record.lead_category || 'Lead'}<small>{record.stage || record.status}</small></span></Link>)}{!context?.linked && !info.loading && !info.error && <><p className="wa-empty-value">No CRM record linked. Link one to see the full profile.</p>{!actions&&<button type="button" className="wa-panel-text-action" onClick={onManage}>Link a record in Manage</button>}</>}{actions}</section>
    {info.issues?.filter(issue => ['Profile', 'Requirements', 'Linked records'].includes(issue.section)).map((issue, index) => <p className="wa-panel-warning" role="alert" key={index}>{issue.section} could not be loaded: {issue.message}</p>)}
  </>
}
export function InboxContactActivity({ info, messages, nextCursor, loadingOlder, onLoadOlder, onManage }) {
  const events = [
    ...(info.activities || []),
    ...messages.map(message => ({ id: `whatsapp:${message.id}`, at: message.event_at, title: message.direction === 'inbound' ? 'WhatsApp received' : 'WhatsApp outbound', body: message.revoked_at ? 'Message deleted' : message.body_text || message.media_json?.filename || (message.message_type === 'media_placeholder' ? 'Historical attachment unavailable' : message.message_type), status: message.delivery_status })),
    ...(info.lead?.created_at ? [{ id: `lead-created:${info.lead.lead_id}`, at: info.lead.created_at, title: 'CRM record created', body: info.context?.linked?.name || '' }] : []),
  ].filter(event => event.at && Number.isFinite(Date.parse(event.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
  const unique = [...new Map(events.map(event => [event.id, event])).values()]
  return <section className="wa-info-section wa-activity-section"><h3>Activity</h3><p className="wa-activity-intro">Conversations and recorded activity, newest first.</p>
    {info.loading && <p role="status">Loading linked activity…</p>}{info.error && <p role="alert">{info.error}</p>}
    <ol className="wa-activity-timeline">{unique.map(event => <li key={event.id}><span className="wa-activity-dot" aria-hidden="true"/><div><strong>{event.title}</strong><time dateTime={event.at}>{date(event.at)}</time>{event.path ? <Link to={event.path}>{text(event.body).slice(0, 180)}</Link> : event.body && <p>{text(event.body).slice(0, 180)}{text(event.body).length > 180 ? '…' : ''}</p>}{event.outcome && <small>{event.outcome}</small>}{event.status && <small>{event.status === 'unknown' ? 'Delivery unconfirmed' : event.status}</small>}</div></li>)}</ol>
    {!unique.length && <div className="wa-contact-empty"><Clock3 size={18}/><span>No activity recorded</span></div>}
    {!info.loading && !info.context?.linked && <p className="wa-activity-intro">Link a CRM record to include related enquiries, calls and notes. <button type="button" className="wa-panel-text-action" onClick={onManage}>Open Manage</button></p>}
    {info.issues?.filter(issue => ['Activity', 'Enquiries', 'Related conversations', 'Related messages'].includes(issue.section)).map((issue, index) => <p role="alert" className="wa-panel-warning" key={index}>{issue.section} could not be loaded: {issue.message}</p>)}
    <div className="wa-activity-loaders">{nextCursor && <button type="button" disabled={loadingOlder} onClick={onLoadOlder}>{loadingOlder ? 'Loading…' : 'Load older chat history'}</button>}{info.activityHasMore && <button type="button" disabled={info.loadingMore} onClick={info.loadMoreActivity}>{info.loadingMore ? 'Loading…' : 'Load older linked activity'}</button>}</div>
  </section>
}
