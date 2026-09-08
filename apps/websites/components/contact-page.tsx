import Link from 'next/link'
import { ContentBlocks } from '@/components/content-blocks'
import { LeadForm } from '@/components/lead-form'
import type { PublicPage, ResolvedSite } from '@/lib/types'

export function ContactPageContent({ page, site }: { page: PublicPage; site: ResolvedSite }) {
  const blocks = page.blocks.filter(block => !block.hidden)
  const hero = blocks.find(block => block.type === 'hero')
  const form = blocks.find(block => block.type === 'lead_form')
  const stories = blocks.filter(block => block.type === 'rich_text')
  const additionalBlocks = blocks.filter(block => !['hero', 'rich_text', 'lead_form'].includes(block.type))
  return <>
    <section className="contact-intro content-shell">
      <p className="eyebrow">{hero?.eyebrow || 'GET IN TOUCH'}</p>
      <h1>{hero?.heading || page.title}</h1>
      {hero?.body && <p>{hero.body}</p>}
    </section>
    <section className="contact-layout content-shell">
      <div className="contact-details">
        {stories.map((block, index) => <div className="contact-story" key={index}>{block.heading && <h2>{block.heading}</h2>}<p>{block.body}</p>{block.ctaHref && block.ctaLabel && <Link href={block.ctaHref}>{block.ctaLabel} ↗</Link>}</div>)}
        <div className="contact-channels">
          {site.phone && <a href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}><span>Call us</span><strong>{site.phone}</strong><b aria-hidden="true">↗</b></a>}
          {site.email && <a href={`mailto:${site.email}`}><span>Email us</span><strong>{site.email}</strong><b aria-hidden="true">↗</b></a>}
          {site.whatsappNumber && <a href={`https://wa.me/${site.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><span>Start a conversation</span><strong>Chat on WhatsApp</strong><b aria-hidden="true">↗</b></a>}
        </div>
        <div className="contact-selling"><p>Thinking of selling?</p><Link href="/valuation">Start with a property valuation <span aria-hidden="true">↗</span></Link></div>
      </div>
      {form && <div className="contact-form-panel" id="enquire"><LeadForm pageId={page.id} purpose={form.purpose || 'general_enquiry'} variant="homepage" heading={form.heading} intro={form.body} privacyPolicyUrl={site.privacyPolicyUrl} /></div>}
    </section>
    {additionalBlocks.length > 0 && <ContentBlocks page={{ ...page, blocks: additionalBlocks }} properties={site.properties} site={site} templateKey={site.templateKey} />}
  </>
}
