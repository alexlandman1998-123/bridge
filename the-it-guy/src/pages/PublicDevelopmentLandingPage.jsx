import { ArrowRight, Building2, Check, Download, MapPin, Ruler } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function list(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  return String(value || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

function money(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function getStatusClass(status = '') {
  const normalized = String(status).toLowerCase()
  if (normalized.includes('available')) return 'bg-emerald-50 text-emerald-700'
  if (normalized.includes('reserve') || normalized.includes('offer')) return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

export default function PublicDevelopmentLandingPage() {
  const { slug = '' } = useParams()
  const [state, setState] = useState({ loading: true, data: null, error: '' })

  useEffect(() => {
    let active = true
    async function load() {
      if (!isSupabaseConfigured || !supabase) {
        setState({ loading: false, data: null, error: 'This development page is not connected yet.' })
        return
      }
      const { data, error } = await supabase.rpc('get_public_development_landing', { requested_slug: slug })
      if (!active) return
      if (error) setState({ loading: false, data: null, error: error.message })
      else setState({ loading: false, data: data || null, error: data ? '' : 'This development page is not published.' })
    }
    void load()
    return () => { active = false }
  }, [slug])

  const marketing = state.data?.marketing || {}
  const overview = marketing.listingOverview || {}
  const media = marketing.mediaLibrary || {}
  const downloads = marketing.downloads || {}
  const externalLinks = marketing.externalLinks || {}
  const configuration = marketing.listingConfiguration || {}
  const floorplans = Array.isArray(marketing.floorplans) ? marketing.floorplans : []
  const inventory = Array.isArray(state.data?.inventory) ? state.data.inventory : []
  const publicAssets = Array.isArray(state.data?.assets) ? state.data.assets : []
  const heroImage = media.heroImageUrl || publicAssets.find((item) => item.documentType === 'marketing')?.fileUrl || ''
  const highlights = list(marketing.sellingPoints?.items || marketing.keySellingPoints?.keyHighlights)
  const location = overview.locationLabel || state.data?.location || [state.data?.suburb, state.data?.city].filter(Boolean).join(', ')
  const enquiryUrl = externalLinks.whatsappEnquiryUrl || externalLinks.bookingViewingUrl || configuration.ctaUrl || '#enquire'
  const availableCount = inventory.filter((item) => String(item.status).toLowerCase().includes('available')).length
  const downloadableAssets = useMemo(() => {
    const configured = [
      ['Brochure', downloads.brochureUrl],
      ['Price list', downloads.pricingSheetUrl],
      ['Specification sheet', downloads.specSheetUrl],
      ['Sales pack', downloads.salesPackUrl],
    ].filter(([, url]) => url)
    const documents = publicAssets
      .filter((item) => item.fileUrl && ['floorplan', 'site_plan', 'brochure'].includes(String(item.documentType).toLowerCase()))
      .map((item) => [item.title || 'Development document', item.fileUrl])
    return [...configured, ...documents].filter((entry, index, rows) => rows.findIndex((item) => item[1] === entry[1]) === index)
  }, [downloads.brochureUrl, downloads.pricingSheetUrl, downloads.salesPackUrl, downloads.specSheetUrl, publicAssets])

  if (state.loading) return <main className="grid min-h-screen place-items-center bg-[#f4f6f2] text-[#18322b]">Loading development…</main>
  if (!state.data) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f6f2] px-6 text-center text-[#18322b]"><div><Building2 className="mx-auto mb-4" size={36} /><h1 className="text-2xl font-semibold">Development unavailable</h1><p className="mt-2 text-sm text-[#66766f]">{state.error}</p></div></main>
  }

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#18322b]">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 text-white md:px-10">
        <div className="text-lg font-semibold tracking-[-0.03em]">{state.data.developerCompany || 'Arch9 Developments'}</div>
        <a href={enquiryUrl} className="rounded-full border border-white/40 bg-black/15 px-4 py-2 text-sm font-semibold backdrop-blur">Enquire now</a>
      </header>

      <section className="relative flex min-h-[72vh] items-end overflow-hidden bg-[#17362f] px-5 pb-14 pt-28 text-white md:px-10 md:pb-20">
        {heroImage ? <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b211c]/95 via-[#0b211c]/45 to-[#0b211c]/25" />
        <div className="relative max-w-4xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#d5b96f]">{overview.listingStatus === 'coming_soon' ? 'Launching soon' : 'Now selling'}</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] md:text-7xl">{overview.listingHeading || overview.listingTitle || state.data.name}</h1>
          {location ? <p className="mt-6 flex items-center gap-2 text-base text-white/85"><MapPin size={18} />{location}</p> : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[minmax(0,1fr)_320px] md:px-10 md:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7b31]">The development</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">{overview.listingTitle || state.data.name}</h2>
          <p className="mt-5 max-w-3xl whitespace-pre-line text-base leading-8 text-[#52665f]">{overview.listingDescription || 'A new residential development with plans and availability ready to explore.'}</p>
          {highlights.length ? <div className="mt-8 grid gap-3 sm:grid-cols-2">{highlights.map((item) => <div key={item} className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm"><Check className="mt-0.5 shrink-0 text-emerald-700" size={17} /><span className="text-sm font-medium">{item}</span></div>)}</div> : null}
        </div>
        <aside className="rounded-3xl bg-[#18362f] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d5b96f]">Availability</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div><strong className="block text-3xl">{inventory.length || state.data.totalUnitsExpected || 0}</strong><span className="text-xs text-white/65">Total homes</span></div>
            <div><strong className="block text-3xl">{availableCount}</strong><span className="text-xs text-white/65">Available</span></div>
          </div>
          <a href={enquiryUrl} className="mt-7 flex items-center justify-between rounded-full bg-[#d5b96f] px-5 py-3 text-sm font-semibold text-[#18322b]">Talk to the sales team <ArrowRight size={17} /></a>
        </aside>
      </section>

      {floorplans.length ? <section className="bg-white px-5 py-14 md:px-10 md:py-20"><div className="mx-auto max-w-7xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7b31]">Plans and pricing</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Choose your home</h2><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{floorplans.map((plan) => { const imageUrl = list(plan.imageUrls)[0] || list(plan.floorplanUrls)[0]; return <article key={plan.id || plan.name} className="overflow-hidden rounded-3xl border border-[#dfe7e2] bg-[#f8faf8]">{imageUrl ? <img src={imageUrl} alt="" className="h-52 w-full bg-white object-contain" /> : <div className="grid h-40 place-items-center bg-[#e8eee9]"><Ruler size={28} className="text-[#789087]" /></div>}<div className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-xl font-semibold">{plan.name || 'Home type'}</h3><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{plan.listingStatus || 'Available'}</span></div><p className="mt-3 text-sm leading-6 text-[#60736c]">{plan.description}</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#40564f]">{plan.bedrooms ? <span>{plan.bedrooms} beds</span> : null}{plan.bathrooms ? <span>· {plan.bathrooms} baths</span> : null}{plan.floorSize ? <span>· {plan.floorSize} m²</span> : null}</div><strong className="mt-5 block text-lg">{money(plan.priceFrom || plan.price) || 'Price on request'}</strong></div></article> })}</div></div></section> : null}

      {inventory.length ? <section className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-20"><h2 className="text-3xl font-semibold tracking-[-0.04em]">Live availability</h2><div className="mt-7 overflow-hidden rounded-3xl border border-[#dbe4de] bg-white">{inventory.map((unit) => <div key={unit.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[#edf1ee] px-5 py-4 last:border-0 md:grid-cols-[1fr_1fr_1fr_auto]"><strong>{unit.unitNumber}</strong><span className="hidden text-sm text-[#60736c] md:block">{unit.unitType || 'Home'}</span><span className="hidden text-sm font-semibold md:block">{money(unit.price) || 'Price on request'}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(unit.status)}`}>{unit.status || 'Status pending'}</span></div>)}</div></section> : null}

      {downloadableAssets.length ? <section className="bg-[#e8eee9] px-5 py-14 md:px-10"><div className="mx-auto max-w-7xl"><h2 className="text-2xl font-semibold">Plans and downloads</h2><div className="mt-5 flex flex-wrap gap-3">{downloadableAssets.map(([label, url]) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold shadow-sm"><Download size={16} />{label}</a>)}</div></div></section> : null}

      <section id="enquire" className="bg-[#18362f] px-5 py-16 text-center text-white md:px-10 md:py-24"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d5b96f]">Take the next step</p><h2 className="mx-auto mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.045em]">Find out more about {state.data.name}</h2><a href={enquiryUrl === '#enquire' ? `mailto:?subject=${encodeURIComponent(state.data.name)}` : enquiryUrl} className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#d5b96f] px-6 py-3.5 font-semibold text-[#18322b]">Enquire now <ArrowRight size={18} /></a></section>
    </main>
  )
}
