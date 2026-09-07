import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { LeadForm } from '@/components/lead-form'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicPage, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'

export default async function ValuationPage() {
  const requestHeaders = await headers()
  const site = await resolveSite(requestHeaders.get('host'))
  if (!site) notFound()
  const page = await getPublicPage(site, 'valuation')
  return <main className={`${templateClassName(site.templateKey)} valuation-page`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    <SiteHeader site={site} enquiryHref="#valuation-form" />
    <section className="valuation-hero"><div className="valuation-hero-copy"><p className="eyebrow">SELL WITH {site.name.toUpperCase()}</p><h1>Your next chapter.<br />A confident start.</h1><p>Know what your home could sell for, and make your next move with a clear plan.</p><small>Local insight. Thoughtful marketing. Personal guidance.</small></div><div id="valuation-form" className="valuation-form-panel"><LeadForm pageId={page?.id} purpose="valuation_request" privacyPolicyUrl={site.privacyPolicyUrl} variant="valuation" /></div></section>
    <section className="valuation-benefits"><article><b>⌖</b><div><h2>Local market insight</h2><p>Current, area-specific knowledge to inform your next move.</p></div></article><article><b>⌂</b><div><h2>A tailored selling strategy</h2><p>A plan shaped around your property, your goals and the right audience.</p></div></article><article><b>♧</b><div><h2>Support through to transfer</h2><p>A dedicated team with you every step of the way.</p></div></article></section>
    <section className="valuation-process"><div><p className="eyebrow">OUR APPROACH</p><h2>A clear plan.<br />From valuation to sold.</h2><p>A considered, straightforward process designed to help you move forward with confidence.</p></div><ol><li><b>01</b><div><h3>Understand your value</h3><p>An appraisal informed by your property and local market.</p></div></li><li><b>02</b><div><h3>Prepare for market</h3><p>Agree on pricing, presentation and a marketing plan.</p></div></li><li><b>03</b><div><h3>Move forward with confidence</h3><p>Guidance through viewings, offers and the transfer process.</p></div></li></ol></section>
    <section className="valuation-cta"><div><p className="eyebrow">WHY {site.name.toUpperCase()}</p><h2>Local knowledge.<br />Every move considered.</h2><p>Your home deserves a strategy shaped around your property, your area and your next chapter.</p></div><div className="valuation-cta-image" /></section>
    <section className="valuation-faq"><p className="eyebrow">COMMON QUESTIONS</p><h2>Before you make your move.</h2>{['How is my property’s value determined?','What happens after I submit my request?','Can I request a valuation if I’m not ready to sell?'].map(question => <details key={question}><summary>{question}<span>＋</span></summary><p>Our local team will guide you through the next step with clear, considered advice.</p></details>)}</section>
    <section className="valuation-bottom-cta"><div><h2>Let’s talk about your next move.</h2><p>A conversation today could be the first step towards your next chapter.</p></div><a href="#valuation-form">Request a valuation ↗</a></section>
    <SiteFooter site={site} />
  </main>
}
