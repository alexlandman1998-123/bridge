import { useCallback, useEffect, useState } from 'react'
import { fetchAgencyOnboardingSettings, fetchOrganisationSettings } from '../../../lib/settingsApi'

const BRANDING_REFRESH_EVENT = 'itg:organisation-branding-updated'
const BRIDGE_BRAND_MARK = 'bridge.'
const BRIDGE_POWERED_LABEL = 'Powered by Bridge'

function normalizeBrandText(value) {
  return String(value || '').trim()
}

function resolveCommercialBranding(snapshot) {
  const onboarding = snapshot?.onboarding || {}
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
    const [settingsResult, contextResult] = await Promise.allSettled([fetchAgencyOnboardingSettings(), fetchOrganisationSettings()])
    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
    const context = contextResult.status === 'fulfilled' ? contextResult.value : null
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
        <div className={compact ? 'flex min-w-0 items-center gap-3' : 'grid gap-2'}>
          <div className={compact ? 'flex h-11 w-32 items-center' : 'flex min-h-[72px] items-center'}>
            <img
              key={branding.logoUrl}
              src={branding.logoUrl}
              alt={`${branding.organisationLabel || 'Organisation'} logo`}
              className={compact ? 'max-h-10 max-w-full object-contain' : 'max-h-20 max-w-[210px] object-contain'}
              loading="lazy"
              onLoad={() => setLogoLoadFailed(false)}
              onError={() => setLogoLoadFailed(true)}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{BRIDGE_POWERED_LABEL}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Commercial workspace</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={compact ? 'min-w-0' : 'border-b border-slate-200 pb-4'}>
      <h1 className={compact ? 'text-2xl font-bold leading-none tracking-[-0.055em] text-[#113a6b]' : 'text-[2.35rem] font-bold leading-none tracking-[-0.055em] text-[#113a6b]'}>
        {BRIDGE_BRAND_MARK}
      </h1>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Commercial workspace</p>
    </div>
  )
}

export default CommercialBranding
