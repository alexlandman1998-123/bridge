import { lazy, Suspense } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, Megaphone, Store } from 'lucide-react'
import { MobileLoadingState } from '../../components/mobile-shell/MobileShellStates'
import './mobile-marketing.css'

const MarketingWorkspace = lazy(() => import('../MarketingComingSoonPage.jsx'))

const WORKSPACES = [
  { key: 'overview', label: 'Marketing overview', query: '' },
  { key: 'campaigns', label: 'Campaigns', query: 'section=campaigns' },
  { key: 'templates', label: 'Template shop / Studio', query: 'section=campaigns&page=studio' },
  { key: 'calendar', label: 'Marketing calendar', query: 'section=campaigns&page=calendar' },
  { key: 'email', label: 'Email campaigns', query: 'section=email' },
  { key: 'whatsapp', label: 'WhatsApp campaigns', query: 'section=whatsapp' },
  { key: 'meta', label: 'Meta', query: 'section=meta' },
  { key: 'show-days', label: 'Show days', query: 'section=show-days' },
  { key: 'launches', label: 'Launches & auctions', query: 'section=launches' },
  { key: 'website', label: 'Website', query: 'section=website' },
]

function activeWorkspace(params) {
  const section = params.get('section')
  if (section !== 'campaigns') return WORKSPACES.some((item) => item.key === section) ? section : 'overview'
  const view = params.get('view') || ''
  if (params.get('page') === 'studio' || view === 'templates' || view.includes('template-') || params.has('channelTemplate')) return 'templates'
  return params.get('page') === 'calendar' ? 'calendar' : 'campaigns'
}

export default function MobileMarketingPage() {
  const [params, setParams] = useSearchParams()
  const active = activeWorkspace(params)

  return (
    <section className="mobile-marketing" aria-label="Mobile marketing">
      <nav className="mobile-marketing-nav" aria-label="Marketing workspaces">
        <label htmlFor="mobile-marketing-workspace">Marketing workspace</label>
        <select id="mobile-marketing-workspace" value={active} onChange={(event) => {
          const item = WORKSPACES.find((workspace) => workspace.key === event.target.value)
          if (item) setParams(item.query)
        }}>
          {WORKSPACES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <div className="mobile-marketing-shortcuts">
          <Link to="?section=campaigns" aria-current={active === 'campaigns' ? 'page' : undefined}><Megaphone size={16} aria-hidden="true" />Campaigns</Link>
          <Link to="?section=campaigns&page=studio" aria-current={active === 'templates' ? 'page' : undefined}><Store size={16} aria-hidden="true" />Templates</Link>
          <Link to="?section=campaigns&page=calendar" aria-current={active === 'calendar' ? 'page' : undefined}><CalendarDays size={16} aria-hidden="true" />Calendar</Link>
        </div>
      </nav>
      <div className="mobile-marketing-content">
        <Suspense fallback={<MobileLoadingState label="Opening marketing workspace…" />}>
          <MarketingWorkspace />
        </Suspense>
      </div>
    </section>
  )
}
