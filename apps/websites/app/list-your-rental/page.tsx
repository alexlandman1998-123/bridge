import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { LeadForm } from '@/components/lead-form'
import { SiteFooter, SiteHeader } from '@/components/site-chrome'
import { getPublicPage, getPublicPages, resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const site = await resolveSite((await headers()).get('host'))
  return { title: `List your rental | ${site?.name || 'Property'}`, alternates: { canonical: '/list-your-rental' } }
}

export default async function ListYourRentalPage() {
  const site = await resolveSite((await headers()).get('host'))
  if (!site) notFound()
  const pages = await getPublicPages(site)
  const contact = pages.find((page) => page.kind === 'contact') || await getPublicPage(site, 'home')
  if (!contact || !['contact', 'home'].includes(contact.kind)) notFound()

  return <main className={`${templateClassName(site.templateKey)} contact-page`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    <SiteHeader site={site} currentHref="/list-your-rental" />
    <section className="contact-intro content-shell">
      <p className="eyebrow">FOR PROPERTY OWNERS</p>
      <h1>List your rental with us.</h1>
      <p>Tell us about your property and our rental team will get in touch.</p>
    </section>
    <section className="contact-layout content-shell">
      <div className="contact-details"><h2>Start with a few details.</h2><p>Share the address and how we can reach you. You can add the property type and expected monthly rent if you know them.</p></div>
      <div className="contact-form-panel" id="enquire"><LeadForm pageId={contact.id} variant="landlord" privacyPolicyUrl={site.privacyPolicyUrl} /></div>
    </section>
    <SiteFooter site={site} />
  </main>
}
