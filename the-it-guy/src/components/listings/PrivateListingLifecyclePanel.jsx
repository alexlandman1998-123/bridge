import {
  getAllowedPrivateListingTransitions,
  getPrivateListingLifecycleNextAction,
  getPrivateListingLifecycleState,
  getPrivateListingStatusDescription,
  getPrivateListingStatusLabel,
  getPrivateListingStatusGroup,
} from '../../lib/privateListingLifecycle'

function formatStatusGroupLabel(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'draft_intake') return 'Draft / Intake'
  if (key === 'mandate') return 'Mandate'
  if (key === 'active') return 'Active'
  if (key === 'under_offer') return 'Under Offer'
  if (key === 'sold_archived') return 'Sold / Archived'
  if (key === 'withdrawn') return 'Withdrawn'
  return 'Draft / Intake'
}

function formatVisibilityLabel(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'active_market') return 'Active Market'
  if (key === 'archived') return 'Archived'
  return 'Internal'
}

export default function PrivateListingLifecyclePanel({
  listing = {},
  blockers = [],
  compact = false,
  className = '',
}) {
  const status = getPrivateListingLifecycleState(listing)
  const statusLabel = getPrivateListingStatusLabel(status)
  const statusDescription = getPrivateListingStatusDescription(status)
  const group = getPrivateListingStatusGroup(status)
  const nextAction = getPrivateListingLifecycleNextAction(listing)
  const allowedTargets = getAllowedPrivateListingTransitions(status)
  const safeBlockers = Array.isArray(blockers) ? blockers.filter(Boolean) : []
  const resolvedClassName = [
    'rounded-[14px] border border-[#dbe6f2] bg-[#f8fbff]',
    compact ? 'p-3' : 'p-4',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={resolvedClassName}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Current Status</p>
          <p className="mt-1 text-sm font-semibold text-[#142132]">{statusLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Group</p>
          <p className="mt-1 text-xs font-semibold text-[#35546c]">{formatStatusGroupLabel(group)}</p>
        </div>
      </div>

      <p className="mt-2 text-xs text-[#607387]">{statusDescription}</p>

      <div className={`mt-3 grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <div className="rounded-[10px] border border-[#dbe6f2] bg-white px-2.5 py-2">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Visibility</p>
          <p className="mt-1 text-xs font-semibold text-[#35546c]">{formatVisibilityLabel(listing?.listingVisibility || listing?.listing_visibility)}</p>
        </div>
        <div className="rounded-[10px] border border-[#dbe6f2] bg-white px-2.5 py-2">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Onboarding</p>
          <p className="mt-1 text-xs font-semibold text-[#35546c]">{String(listing?.sellerOnboardingStatus || listing?.seller_onboarding_status || 'not_started').replace(/_/g, ' ')}</p>
        </div>
        {!compact ? (
          <div className="rounded-[10px] border border-[#dbe6f2] bg-white px-2.5 py-2">
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mandate</p>
            <p className="mt-1 text-xs font-semibold text-[#35546c]">{String(listing?.mandateStatus || listing?.mandate_status || 'not_started').replace(/_/g, ' ')}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Next Action</p>
        <p className="mt-1 text-xs text-[#35546c]">{nextAction || 'No further action is available for this listing.'}</p>
      </div>

      <div className="mt-3">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Next Allowed Actions</p>
        {allowedTargets.length ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {allowedTargets.map((item) => (
              <span key={item} className="inline-flex rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.66rem] font-semibold text-[#35546c]">
                {getPrivateListingStatusLabel(item)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-[#607387]">No further action is available for this listing.</p>
        )}
      </div>

      {safeBlockers.length ? (
        <div className="mt-3 rounded-[10px] border border-[#f3d9b0] bg-[#fff9ee] px-3 py-2">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-[#8f5c18]">Blockers</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[#8f5c18]">
            {safeBlockers.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

