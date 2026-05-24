import { useState } from 'react'
import { useOrganisation } from '../../../context/OrganisationContext'

const BRIDGE_BRAND_MARK = 'bridge.'
const BRIDGE_POWERED_LABEL = 'Powered by Bridge'

function CommercialBranding({ compact = false }) {
  const { branding, loading: organisationLoading } = useOrganisation()
  const [logoLoadFailure, setLogoLoadFailure] = useState({ url: '', failed: false })

  const logoLoadFailed = logoLoadFailure.url === branding.logoUrl && logoLoadFailure.failed
  const showOrganisationBranding = Boolean(branding.logoUrl) && !logoLoadFailed
  const showBrandPlaceholder = organisationLoading || (Boolean(branding.logoUrl) && logoLoadFailed)

  if (showOrganisationBranding) {
    return (
      <div className={compact ? 'min-w-0' : 'border-b border-slate-200 pb-4'}>
        <div className={compact ? 'flex min-w-0 items-center gap-3' : 'ui-sidebar-brand-org'}>
          <div className={compact ? 'flex h-11 w-32 items-center' : 'ui-sidebar-brand-logo-wrap'}>
            <img
              key={branding.logoUrl}
              src={branding.logoUrl}
              alt={`${branding.organisationLabel || 'Organisation'} logo`}
              className={compact ? 'max-h-10 max-w-full object-contain' : 'ui-sidebar-brand-logo'}
              loading="lazy"
              onLoad={() => setLogoLoadFailure({ url: branding.logoUrl, failed: false })}
              onError={() => setLogoLoadFailure({ url: branding.logoUrl, failed: true })}
            />
          </div>
          <p className={compact ? 'truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500' : 'ui-sidebar-brand-powered'}>
            {BRIDGE_POWERED_LABEL}
          </p>
        </div>
      </div>
    )
  }

  if (showBrandPlaceholder) {
    return (
      <div className={compact ? 'min-w-0' : 'border-b border-slate-200 pb-4'} aria-label="Loading organisation branding">
        <div className={compact ? 'h-10 w-32 animate-pulse rounded-xl bg-slate-100' : 'h-16 w-44 animate-pulse rounded-xl bg-slate-100'} />
      </div>
    )
  }

  return (
    <div className={compact ? 'min-w-0' : 'border-b border-slate-200 pb-4'}>
      <h1 className={compact ? 'text-2xl font-bold leading-none tracking-[-0.055em] text-[#113a6b]' : 'ui-sidebar-brand-mark'}>
        {BRIDGE_BRAND_MARK}
      </h1>
    </div>
  )
}

export default CommercialBranding
