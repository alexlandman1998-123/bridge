import { useCallback, useEffect, useState } from 'react'
import { fetchAgencyOnboardingSettings, fetchOrganisationSettings } from '../../../lib/settingsApi'

const BRANDING_REFRESH_EVENT = 'itg:organisation-branding-updated'
const BRIDGE_BRAND_MARK = 'bridge.'
const BRIDGE_POWERED_LABEL = 'Powered by Bridge'

function normalizeBrandText(value) {
  return String(value || '').trim()
}

function resolveCommercialBranding(snapshot) {
  const onboarding = snapshot?.onboarding || snapshot?.organisationSettings?.agencyOnboarding || {}
  const organisation = snapshot?.organisation || {}
  const branding = onboarding?.branding || {}
  const agencyInformation = onboarding?.agencyInformation || {}

  const logoLightUrl = normalizeBrandText(branding.logoLight)
  const logoDarkUrl = normalizeBrandText(branding.logoDark)
  const organisationLogoUrl = normalizeBrandText(organisation.logoUrl)
  const logoUrl = logoDarkUrl || organisationLogoUrl || logoLightUrl
  const organisationLabel =
    normalizeBrandText(agencyInformation.tradingName) ||
    normalizeBrandText(agencyInformation.agencyName) ||
    normalizeBrandText(organisation.displayName) ||
    normalizeBrandText(organisation.name)

  return {
    logoUrl,
    organisationLabel,
  }
}

function CommercialBranding({ compact = false }) {
  const [branding, setBranding] = useState({ logoUrl: '', organisationLabel: '' })
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)

  const loadBranding = useCallback(async () => {
    const contextResult = await Promise.allSettled([fetchOrganisationSettings()])
    const context = contextResult[0].status === 'fulfilled' ? contextResult[0].value : null
    let settings = null

    if (context?.persisted) {
      const settingsResult = await Promise.allSettled([fetchAgencyOnboardingSettings()])
      settings = settingsResult[0].status === 'fulfilled' ? settingsResult[0].value : null
    }

    const snapshot = settings || context

    if (snapshot) {
      setBranding(resolveCommercialBranding(snapshot))
      setLogoLoadFailed(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      if (!active) return
      await loadBranding()
    }

    void load()

    return () => {
      active = false
    }
  }, [loadBranding])

  useEffect(() => {
    function handleBrandingRefresh() {
      void loadBranding()
    }

    window.addEventListener(BRANDING_REFRESH_EVENT, handleBrandingRefresh)
    return () => {
      window.removeEventListener(BRANDING_REFRESH_EVENT, handleBrandingRefresh)
    }
  }, [loadBranding])

  const showOrganisationBranding = Boolean(branding.logoUrl) && !logoLoadFailed

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
              onLoad={() => setLogoLoadFailed(false)}
              onError={() => setLogoLoadFailed(true)}
            />
          </div>
          <p className={compact ? 'truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500' : 'ui-sidebar-brand-powered'}>
            {BRIDGE_POWERED_LABEL}
          </p>
        </div>
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
