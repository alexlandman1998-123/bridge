import { BarChart3, CalendarDays, ChevronRight, Plus, RefreshCw, Users } from 'lucide-react'
import ListingChannelStatistics from '../../components/listings/ListingChannelStatistics'
import './rental-listing-overview.css'

const money = (value) => value === null || value === undefined || value === '' ? 'Not captured' : `R ${Number(value).toLocaleString('en-ZA')}`
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-ZA') : 'Not captured'
const panel = 'rental-overview-panel'

function Header({ title, action, onClick }) {
  return <div className="rental-overview-panel-heading"><h2>{title}</h2>{action ? <button type="button" data-rental-control="overview-link" className="rental-overview-link" onClick={onClick}>{action}<ChevronRight size={14} /></button> : null}</div>
}

export default function RentalListingOverview({ detail, snapshot, agentPanel, onOpenTab, onOpenEdit, onRefresh, onNavigate, onAddLead, onScheduleViewing }) {
  const row = detail.row
  const loaded = Boolean(snapshot)
  const value = (number) => number == null ? '—' : number
  const progress = snapshot?.documentProgress
  const documentProgressUnavailable = snapshot?.documentMatrix
    ? Boolean(snapshot.documentMatrix.issues?.length)
    : snapshot?.issues.some((issue) => ['Documents', 'Document requirements'].includes(issue))
  const gallery = (detail.listing.listingMedia || detail.listing.galleryImages || []).filter((image) => String(image.media_type || image.mediaType || 'image').toLowerCase() === 'image')
  const imageCount = gallery.length || (row.imageUrl ? 1 : 0)
  const metrics = [
    { label: 'Total leads', value: value(snapshot?.leadCount), meta: loaded ? snapshot.leadCount == null ? 'Lead data unavailable' : `${snapshot.newLeadCount} new this week` : 'Loading linked leads…', icon: Users },
    { label: 'Viewings', value: value(snapshot?.viewingCount), meta: loaded ? snapshot.viewingCount == null ? 'Viewing data unavailable' : `${snapshot.upcoming.length} upcoming` : 'Loading viewings…', icon: CalendarDays },
    { label: 'Days on market', value: value(snapshot?.daysOnMarket), meta: snapshot?.daysOnMarket == null ? 'Listing date unavailable' : 'Current listing period', icon: BarChart3 },
  ]
  return <section className="rental-overview-stack">
    <section className="min-w-0 rounded-[22px] border border-[#e1e7ec] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.035)] sm:p-6">
      <ListingChannelStatistics
        organisationId={detail.listing.organisationId || detail.listing.organisation_id}
        listingId={row.id || detail.listing.id}
        refreshKey={snapshot?.refreshedAt}
        summaryCards={metrics}
      />
      <div className="rental-overview-refresh"><span>{!loaded ? 'Loading overview…' : snapshot.issues.length ? `Could not load: ${snapshot.issues.join(', ')}` : 'Overview up to date'}</span><button type="button" data-rental-control="overview-refresh" onClick={onRefresh}><RefreshCw size={15} />Refresh</button></div>
    </section>
    <div className="rental-overview-activity-grid">
      <article className={`${panel} rental-overview-latest-activity`}>
        <Header title="Latest Tenant Activity" action="View all leads" onClick={() => onOpenTab('leads')} />
        {snapshot?.leads.length ? (
          <ul className="rental-overview-lead-list">
            {snapshot.leads.slice(0, 3).map((lead) => (
              <li key={lead.id}>
                <button
                  className="rental-overview-lead-row"
                  data-rental-control="overview-lead"
                  type="button"
                  aria-label={`Open tenant lead for ${lead.name || 'Tenant'}`}
                  onClick={() => onNavigate(`/agent/rentals/pipeline/leads/${encodeURIComponent(lead.id)}`)}
                >
                  <span className="rental-overview-lead-avatar" aria-hidden="true">{(lead.name || 'Tenant').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
                  <span className="rental-overview-lead-person">
                    <strong>{lead.name || 'Tenant'}</strong>
                    {lead.source ? <small>{lead.source}</small> : null}
                  </span>
                  <span className="rental-overview-lead-stage">{lead.stageLabel || 'Stage not recorded'}</span>
                  <ChevronRight size={14} aria-hidden="true" className="rental-overview-lead-chevron" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rental-overview-lead-empty" role={!loaded ? 'status' : snapshot.issues.includes('Leads') || snapshot.issues.includes('Overview') ? 'alert' : undefined}>
            {!loaded ? 'Loading tenant leads…' : snapshot.issues.includes('Leads') || snapshot.issues.includes('Overview') ? 'Tenant leads could not be loaded.' : 'No tenant leads yet.'}
          </p>
        )}
        <button type="button" className="rental-overview-action" data-rental-control="overview-add-lead" onClick={onAddLead}><Plus size={15} />Add Tenant Lead</button>
      </article>
      <article className={panel}><Header title="Upcoming Viewings" /><p className="rental-overview-caption">Open a viewing to see tenant and agent details.</p><div className="rental-overview-feed">{snapshot?.upcoming.length ? snapshot.upcoming.slice(0, 3).map((viewing) => <button type="button" data-rental-control="overview-viewing" key={viewing.id} onClick={onScheduleViewing}><strong>{viewing.tenantName || 'Tenant viewing'}</strong><span>{new Date(viewing.startsAt).toLocaleString('en-ZA')}</span></button>) : <p>{!loaded ? 'Loading viewings…' : snapshot.issues.includes('Viewings & activity') ? 'Viewings could not be loaded.' : 'No upcoming viewings.'}</p>}</div><button type="button" className="rental-overview-action" data-rental-control="overview-schedule" onClick={onScheduleViewing}><CalendarDays size={15} />Schedule Viewing</button></article>
    </div>
    <div className="rental-overview-columns">
      <article className={`${panel} rental-overview-tenant`} aria-label="Tenant">
        <Header title="Tenant" />
        {snapshot?.tenant ? (
          <>
            <div className="rental-overview-person">
              <span aria-hidden="true">{snapshot.tenant.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span>
              <div>
                <strong>{snapshot.tenant.name}</strong>
                {snapshot.tenant.email ? <p>{snapshot.tenant.email}</p> : null}
                {snapshot.tenant.phone ? <p>{snapshot.tenant.phone}</p> : null}
              </div>
            </div>
            <dl className="rental-overview-status-list">
              <div><dt>Tenancy</dt><dd>{snapshot.tenant.status.replaceAll('_', ' ')}</dd></div>
              <div><dt>Applications</dt><dd>{snapshot.applications.length + (snapshot.legacyApplications?.length || 0)}</dd></div>
            </dl>
          </>
        ) : (
          <div className="rental-overview-tenant-empty">
            <span className="rental-overview-tenant-icon" aria-hidden="true"><Users size={18} /></span>
            <div>
              <strong>{snapshot?.issues.includes('Tenant') || snapshot?.issues.includes('Applications') ? 'Tenant details unavailable' : 'No tenant placed'}</strong>
              <p>Tenant details appear here after an approved application becomes a tenancy.</p>
            </div>
          </div>
        )}
        <button type="button" data-rental-control="overview-tenant" className="rental-overview-action" onClick={() => snapshot?.tenant ? onNavigate(`/agent/rentals/tenancies/${encodeURIComponent(snapshot.tenant.id)}`) : onOpenTab('leads')}>
          {snapshot?.tenant ? 'Open Tenant' : 'View Tenant Applications'}<ChevronRight size={14} aria-hidden="true" />
        </button>
        <section className="rental-overview-owner" aria-label="Landlord">
          <div className="rental-overview-owner-heading">
            <h3>Landlord</h3>
            <button type="button" data-rental-control="overview-landlord" className="rental-overview-link" onClick={() => onOpenTab('landlord')}>Open landlord<ChevronRight size={14} aria-hidden="true" /></button>
          </div>
          <strong>{row.landlordName || 'Not captured'}</strong>
          <div className="rental-overview-owner-contact">
            {row.landlordEmail || row.landlordPhone ? <>
              {row.landlordEmail ? <p>{row.landlordEmail}</p> : null}
              {row.landlordPhone ? <p>{row.landlordPhone}</p> : null}
            </> : <p>{row.landlordContact || 'No contact captured'}</p>}
          </div>
          <dl className="rental-overview-status-list">
            <div><dt>Mandate</dt><dd>{detail.mandateStatusLabel}</dd></div>
            <div><dt>Marketing approval</dt><dd>{detail.marketingApprovalStatusLabel}</dd></div>
          </dl>
        </section>
      </article>
      <div className="rental-overview-column">{agentPanel}<article className={`${panel} rental-overview-marketing`}><div className="rental-overview-marketing-heading"><Header title="Marketing" action="Open marketing" onClick={() => onOpenTab('marketing')} /></div><div className="rental-overview-marketing-image">{row.imageUrl ? <img src={row.imageUrl} alt={row.title} /> : null}<span>{imageCount} image{imageCount === 1 ? '' : 's'}</span></div><div className="rental-overview-marketing-body"><strong className="rental-overview-price">{money(row.monthlyRent)}</strong><div className="rental-overview-facts">{[['Bedrooms', row.bedrooms], ['Bathrooms', row.bathrooms], ['Parking', row.parkingBays]].map(([label, count]) => `${label}: ${count == null || count === '' ? 'Not captured' : count}`).map((fact) => <span key={fact}>{fact}</span>)}</div><p>{detail.listing.description || detail.listing.listingPublicationData?.description || 'Add a public property description in Marketing to complete this listing preview.'}</p></div></article></div>
      <div className="rental-overview-column"><article className={panel}><Header title="Document Progress" action="Open documents" onClick={() => onOpenTab('mandate')} />{documentProgressUnavailable ? <p className="rental-overview-caption">Document progress could not be loaded.</p> : progress?.total ? <div className="rental-overview-document-progress"><span role="progressbar" aria-label="Rental document completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} style={{ background: `conic-gradient(#177556 ${progress.percent}%, #e5ebf2 ${progress.percent}% 100%)` }}><strong>{progress.percent}%</strong></span><div><strong>{progress.complete} of {progress.total} complete</strong><p>{progress.total - progress.complete} still outstanding</p></div></div> : <p className="rental-overview-caption">{loaded ? 'No confirmed document requirements yet. Check the Documents tab.' : 'Loading document progress…'}</p>}</article><article className={panel}><Header title="Price Position" action="Edit pricing" onClick={() => onOpenEdit('terms')} /><p className="rental-overview-caption">Current monthly rent</p><strong className="rental-overview-price">{money(row.monthlyRent)}</strong><dl><dt>Available from</dt><dd>{date(row.availableFrom)}</dd><dt>Deposit</dt><dd>{money(row.depositAmount)}</dd><dt>Lease term</dt><dd>{row.leasePeriodMonths ? `${row.leasePeriodMonths} months` : 'Not captured'}</dd></dl></article><article className={panel}><Header title="Published" action="Manage" onClick={() => onOpenTab('marketing')} /><dl>{detail.channels.map((channel) => <div key={channel.key}><dt>{channel.label}</dt><dd>{channel.status?.replaceAll('_', ' ') || 'Not published'}</dd></div>)}</dl></article></div>
    </div>
  </section>
}
