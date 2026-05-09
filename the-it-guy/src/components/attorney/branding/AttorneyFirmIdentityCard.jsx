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
      className="panel card-tier-standard"
      style={{
        display: 'grid',
        gap: compactMode ? '0.55rem' : '0.75rem',
        overflow: 'hidden',
      }}
    >
      <AttorneyBrandAccent primaryColour={firm?.primary_colour || firm?.primaryColour} secondaryColour={firm?.secondary_colour || firm?.secondaryColour} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <AttorneyFirmLogo
          firmName={firmName}
          logoUrl={firm?.logo_url || firm?.logoUrl}
          primaryColour={firm?.primary_colour || firm?.primaryColour}
          secondaryColour={firm?.secondary_colour || firm?.secondaryColour}
          size={compactMode ? 40 : 46}
          borderRadius={compactMode ? 10 : 12}
        />
        <div style={{ minWidth: 0 }}>
          <p className="status-message" style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {title}
          </p>
          <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.3 }}>{firmName}</p>
          {subtitle ? <p className="status-message" style={{ margin: 0 }}>{subtitle}</p> : null}
        </div>
      </div>
      {roleLabel ? (
        <p className="status-message" style={{ margin: 0 }}>
          {roleLabel}
        </p>
      ) : null}
      {contactSummary && contactLine ? (
        <p className="status-message" style={{ margin: 0 }}>
          {contactLine}
        </p>
      ) : null}
    </section>
  )
}

export default AttorneyFirmIdentityCard
