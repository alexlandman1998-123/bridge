import Link from 'next/link'
import { LeadForm } from '@/components/lead-form'
import type { PublicPage, PublicProperty, ResolvedSite } from '@/lib/types'

export function HomepageContact({ page, properties, site }: { page: PublicPage; properties: PublicProperty[]; site: ResolvedSite }) {
  const fallbackImage = properties.flatMap((property) => property.media).find((media) => media.type === 'image' && media.url)?.url
  const imageUrl = site.contactImageUrl || fallbackImage
  return <section className="homepage-contact-section" id="enquire">
    <div className="content-shell homepage-contact-shell">
      <div className="homepage-contact-intro">
        <p className="eyebrow">GET IN TOUCH</p>
        <h2>Let’s talk property.</h2>
        <p>Buying, selling or finding your next rental? Our team is here to help.</p>
        {imageUrl ? <img className="homepage-contact-image" src={imageUrl} alt="A property represented by the agency" /> : <div className="homepage-contact-image homepage-contact-image-placeholder" aria-hidden="true" />}
        <Link className="homepage-team-link" href="/about">Meet the team <span aria-hidden="true">↗</span></Link>
      </div>
      <LeadForm pageId={page.id} privacyPolicyUrl={site.privacyPolicyUrl} purpose="general_enquiry" variant="homepage" />
    </div>
  </section>
}
