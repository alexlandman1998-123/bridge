import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import PublicDevelopmentLandingPage from './PublicDevelopmentLandingPage'
import MobilePublicDevelopmentExperience from './MobilePublicDevelopmentExperience'
import './public-development-responsive.css'

const text = (value) => String(value || '').trim()
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(/\r?\n|,/).map(text).filter(Boolean)
const keyFor = (status) => {
  const value = text(status).toLowerCase()
  if (value.includes('reserve') || value.includes('offer')) return 'reserved'
  if (value.includes('sold') || value.includes('complete')) return 'sold'
  if (value.includes('unreleased') || value.includes('draft')) return 'unreleased'
  return 'available'
}

export default function PublicDevelopmentResponsiveRoute() {
  const { slug = '' } = useParams()
  const [state, setState] = useState({ loading: true, data: null, error: '' })

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured || !supabase) return () => {}
    supabase.rpc('get_public_development_landing', { requested_slug: slug }).then(({ data, error }) => {
      if (active) setState({ loading: false, data: data || null, error: error?.message || (data ? '' : 'This development page is not published.') })
    })
    return () => { active = false }
  }, [slug])

  if (state.loading) return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] text-[#153d33]">Loading development…</main>
  if (!state.data) return <main className="grid min-h-screen place-items-center bg-[#f5f2eb] px-6 text-center text-[#153d33]"><div><h1 className="font-serif text-3xl">Development unavailable</h1><p className="mt-3 text-sm">{state.error}</p></div></main>

  const data = state.data
  const marketing = data.marketing || {}
  const media = marketing.mediaLibrary || {}
  const inventory = Array.isArray(data.inventory) ? data.inventory : []
  const available = inventory.filter((unit) => keyFor(unit.status) === 'available')
  const prices = inventory.map((unit) => Number(unit.price)).filter(Boolean)
  const fromPrice = Math.min(...prices)
  const agency = text(data.developerCompany).replace(/\s+site$/i, '') || 'Revo Property'
  const hero = media.heroImageUrl || ''
  const images = [...new Set([...list(media.galleryImageUrls), ...list(media.imageUrls), hero].filter(Boolean))]
  const enquiry = marketing.externalLinks?.whatsappEnquiryUrl || marketing.externalLinks?.bookingViewingUrl || '#enquire'

  return <><div className="public-development-mobile md:hidden"><MobilePublicDevelopmentExperience data={data} marketing={marketing} media={media} inventory={inventory} available={available} fromPrice={fromPrice} agency={agency} hero={hero} images={images} enquiry={enquiry} /></div><div className="public-development-desktop hidden md:block"><img className="public-development-revo-logo" src="/brand/revo-property-white.svg" alt="Revo Property" /><PublicDevelopmentLandingPage /></div></>
}
