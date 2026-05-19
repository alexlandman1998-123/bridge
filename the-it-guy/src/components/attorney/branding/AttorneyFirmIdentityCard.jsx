import AttorneyBrandAccent from './AttorneyBrandAccent'
import AttorneyFirmLogo from './AttorneyFirmLogo'

function compact(value) {
  return String(value || '').trim()
}

function AttorneyFirmIdentityCard({
  firm = null,
  title = 'Attorney Firm',
  subtitle = '',
  roleLabel = '',
  contactSummary = true,
  compactMode = false,
}) {
  const firmName = firm?.name || 'Attorney Firm'
  const phone = compact(firm?.phone)
  const email = compact(firm?.email)
  const website = compact(firm?.website)
  const contactLine = [phone, email || website].filter(Boolean).join(' • ')

  return (
    <section
      className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      style={{
        gap: compactMode ? '0.55rem' : '0.75rem',
      }}
    >
      <AttorneyBrandAccent primaryColour={firm?.primary_colour || firm?.primaryColour} secondaryColour={firm?.secondary_colour || firm?.secondaryColour} />
      <div className="flex items-center gap-3">
        <AttorneyFirmLogo
          firmName={firmName}
          logoUrl={firm?.logo_url || firm?.logoUrl}
          primaryColour={firm?.primary_colour || firm?.primaryColour}
          secondaryColour={firm?.secondary_colour || firm?.secondaryColour}
          size={compactMode ? 40 : 46}
          borderRadius={compactMode ? 10 : 12}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {title}
          </p>
          <p className="truncate text-base font-semibold leading-snug text-slate-950">{firmName}</p>
          {subtitle ? <p className="truncate text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {roleLabel ? (
        <p className="text-sm text-slate-600">
          {roleLabel}
        </p>
      ) : null}
      {contactSummary && contactLine ? (
        <p className="truncate text-sm text-slate-600">
          {contactLine}
        </p>
      ) : null}
    </section>
  )
}

export default AttorneyFirmIdentityCard
