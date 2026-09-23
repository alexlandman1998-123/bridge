import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { LeadForm } from '@/components/lead-form'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicPage, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'
import { hasEditorialPropertyExperience } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'
const loadSite = cache(async () => resolveSite((await headers()).get('host')))

export async function generateMetadata() {
  const site = await loadSite()
  return { title: `Sell your property | ${site?.name || 'Property valuation'}` }
}

export default async function ValuationPage() {
  const site = await loadSite()
  if (!site) notFound()
  const page = await getPublicPage(site, 'valuation')
  const lwp = hasEditorialPropertyExperience(site)
  return <main className={`${templateClassName(site.templateKey)} valuation-page`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    <SiteHeader site={site} enquiryHref="#valuation-form" currentHref="/valuation" />
    {lwp ? <>
      <section className="lwp-selling-hero"><div><p className="eyebrow">SELL WITH LOCAL PERSPECTIVE</p><h1>Your home.<br />Properly positioned.<br /><em>A clear plan to move.</em></h1><p>From the first conversation to the final signature, LWP turns local knowledge into a considered sale strategy.</p></div><p className="lwp-swipe-cue" aria-hidden="true"><span>Swipe through the plan</span><b>→</b></p><ol aria-label="The LWP selling approach"><li><b>01</b><h2>Price with perspective.</h2><p>Real local context, not a number pulled from a portal.</p></li><li><b>02</b><h2>Present with purpose.</h2><p>A tailored launch that makes the right first impression.</p></li><li><b>03</b><h2>Stay close to the process.</h2><p>Clear updates and calm guidance from viewing to offer.</p></li></ol></section>
      <section className="lwp-selling-proof"><div><p className="eyebrow">WHAT YOU CAN EXPECT</p><h2>Less noise.<br />More <em>momentum.</em></h2></div><p className="lwp-selling-proof-copy">A good result starts long before the listing goes live. We pair disciplined pricing, thoughtful presentation and straight-talking advice around the areas we know best.</p><p className="lwp-swipe-cue" aria-hidden="true"><span>Swipe for the details</span><b>→</b></p><div className="lwp-selling-stats"><p><b>20+</b><span>years helping local owners move</span></p><p><b>30+</b><span>area specialists across Gauteng</span></p><p><b>4.7</b><span>Google rating, earned locally</span></p></div></section>
      <section className="lwp-selling-form-section" id="valuation-form"><div><p className="eyebrow">YOUR SALE, CONSIDERED</p><h2>A stronger<br />start to sold.</h2><p>Start with the facts, then build the right plan. Share a few details and an LWP advisor will come back with a considered view of your home’s position and potential.</p><small>NO GUESSWORK.<br />NO PRESSURE.<br />JUST A PLAN.</small></div><div className="lwp-selling-form"><LeadForm pageId={page?.id} purpose="valuation_request" privacyPolicyUrl={site.privacyPolicyUrl} variant="valuation" submitLabel="Start my valuation" /></div></section>
    </> : <>
      <section className="valuation-hero"><div className="valuation-hero-copy"><p className="eyebrow">SELL WITH {site.name.toUpperCase()}</p><h1>Your next chapter.<br />A confident start.</h1><p>Know what your home could sell for, and make your next move with a clear plan.</p><small>Local insight. Thoughtful marketing. Personal guidance.</small></div><div id="valuation-form" className="valuation-form-panel"><LeadForm pageId={page?.id} purpose="valuation_request" privacyPolicyUrl={site.privacyPolicyUrl} variant="valuation" /></div></section>
      <section className="valuation-benefits"><article><b aria-hidden="true">01</b><div><h2>Local market insight</h2><p>Current, area-specific knowledge to inform your next move.</p></div></article><article><b aria-hidden="true">02</b><div><h2>A tailored selling strategy</h2><p>A plan shaped around your property, your goals and the right audience.</p></div></article><article><b aria-hidden="true">03</b><div><h2>Support through to transfer</h2><p>A dedicated team with you every step of the way.</p></div></article></section>
      <section className="valuation-process"><div><p className="eyebrow">OUR APPROACH</p><h2>A clear plan.<br />From valuation to sold.</h2><p>A considered, straightforward process designed to help you move forward with confidence.</p></div><ol><li><b>01</b><div><h3>Understand your value</h3><p>An appraisal informed by your property and local market.</p></div></li><li><b>02</b><div><h3>Prepare for market</h3><p>Agree on pricing, presentation and a marketing plan.</p></div></li><li><b>03</b><div><h3>Move forward with confidence</h3><p>Guidance through viewings, offers and the transfer process.</p></div></li></ol></section>
    </>}
    {lwp ? <section className="lwp-selling-close"><div><p className="eyebrow">THE LWP DIFFERENCE</p><h2>Prepared properly.<br /><em>Marketed thoughtfully.</em></h2></div><p>We make sure every choice—from positioning and presentation to negotiation—has a reason behind it. That is how a sale stays clear, confident and entirely yours.</p><a href="#valuation-form">Start the conversation <span aria-hidden="true">↗</span></a></section> : <section className="valuation-cta"><div><p className="eyebrow">WHY {site.name.toUpperCase()}</p><h2>Local knowledge.<br />Every move considered.</h2><p>Your home deserves a strategy shaped around your property, your area and your next chapter.</p></div><div className="valuation-cta-image" /></section>}
    <section className="valuation-faq"><p className="eyebrow">COMMON QUESTIONS</p><h2>Before you make your move.</h2>{[
      { question: 'How is my property’s value determined?', answer: 'The team considers your home’s location, size, condition and features alongside comparable properties and current local market activity. A conversation and a property assessment help establish an informed asking price.' },
      { question: 'What happens after I submit my request?', answer: 'Your enquiry goes to the agency team, who will contact you using the details you provide to discuss your property and arrange the next step.' },
      { question: 'Can I request a valuation if I’m not ready to sell?', answer: 'Yes. Let the team know your plans and timing in the message field, so the conversation can be shaped around what you need.' },
    ].map(({ question, answer }) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</section>
    <section className="valuation-bottom-cta"><div><h2>Let’s talk about your next move.</h2><p>A conversation today could be the first step towards your next chapter.</p></div><a href="#valuation-form">Request a valuation ↗</a></section>
    <SiteFooter site={site} />
  </main>
}
