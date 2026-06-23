import { Plus, Upload } from 'lucide-react'
import { MobileEmptyState, MobileErrorState, MobileLoadingState, MobileSearchPlaceholder } from '../../components/mobile-shell/MobileShellStates'

const MODULE_COPY = {
  transactions: {
    title: 'Transactions',
    intro: 'Track live deals and the next field action.',
    search: 'Search transactions or filter by status',
    emptyTitle: 'No active transactions yet.',
    emptyBody: 'Your transactions will appear here once created.',
  },
  leads: {
    title: 'Leads',
    intro: 'A mobile-safe list shell for new and active leads.',
    search: 'Search leads or filter by source',
    emptyTitle: 'No leads yet.',
    emptyBody: 'New leads will appear here once they are captured.',
    actionLabel: 'New Lead',
    actionIcon: Plus,
  },
  documents: {
    title: 'Documents',
    intro: 'Review document requests and pending uploads.',
    search: 'Search documents or filter by status',
    emptyTitle: 'No documents awaiting review.',
    emptyBody: 'Document requests and uploads will appear here.',
    actionLabel: 'Upload',
    actionIcon: Upload,
  },
  notifications: {
    title: 'Notifications',
    intro: 'Unread updates and workspace alerts.',
    emptyTitle: 'No notifications.',
    emptyBody: 'You are all caught up for now.',
  },
  reports: {
    title: 'Reports',
    intro: 'Management reporting will be simplified for mobile in a later phase.',
    emptyTitle: 'No mobile reports yet.',
    emptyBody: 'A focused report view will appear here once enabled.',
  },
  matters: {
    title: 'Matters',
    intro: 'A field-ready matter list for attorney users.',
    search: 'Search matters or filter by priority',
    emptyTitle: 'No active matters yet.',
    emptyBody: 'Your matters will appear here once assigned.',
  },
  applications: {
    title: 'Applications',
    intro: 'A mobile queue for bond applications.',
    search: 'Search applications or filter by stage',
    emptyTitle: 'No active applications yet.',
    emptyBody: 'Bond applications will appear here once created.',
  },
  pipeline: {
    title: 'Pipeline',
    intro: 'A mobile view for commercial pipeline movement.',
    search: 'Search pipeline or filter by stage',
    emptyTitle: 'No pipeline items yet.',
    emptyBody: 'Commercial pipeline activity will appear here.',
  },
  listings: {
    title: 'Listings',
    intro: 'Commercial listing work packaged for mobile follow-up.',
    search: 'Search listings or filter by status',
    emptyTitle: 'No listings yet.',
    emptyBody: 'Listings will appear here once available.',
  },
  deals: {
    title: 'Deals',
    intro: 'Commercial deal flow for quick field checks.',
    search: 'Search deals or filter by status',
    emptyTitle: 'No active deals yet.',
    emptyBody: 'Deals will appear here once created.',
  },
}

export default function MobileModulePage({ moduleKey }) {
  const copy = MODULE_COPY[moduleKey] || MODULE_COPY.transactions
  const ActionIcon = copy.actionIcon
  const state = { loading: false, error: '', rows: [] }

  if (state.loading) return <MobileLoadingState label={`Loading ${copy.title}`} />
  if (state.error) return <MobileErrorState body={state.error} />

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight text-[#10243a]">{copy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">{copy.intro}</p>
        </div>
        {copy.actionLabel ? (
          <button type="button" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-[#1f7a5a] px-4 text-sm font-semibold text-white">
            {ActionIcon ? <ActionIcon className="h-4 w-4" /> : null}
            {copy.actionLabel}
          </button>
        ) : null}
      </section>

      {copy.search ? <MobileSearchPlaceholder label={copy.search} /> : null}

      <section className="space-y-3">
        {state.rows.length ? null : (
          <MobileEmptyState title={copy.emptyTitle} body={copy.emptyBody} />
        )}
      </section>
    </div>
  )
}
