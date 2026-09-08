import { cache, type ReactNode } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { resolveSite } from '@/lib/site-repository'
import { templateClassName } from '@/lib/site-templates'
import type { ResolvedSite } from '@/lib/types'
import { SiteFooter, SiteHeader } from './site-chrome'
import styles from './resources.module.css'

export const resourceSite = cache(async () => {
  const site = await resolveSite((await headers()).get('host'))
  if (!site) notFound()
  return site
})

export function ResourceShell({ site, href, children }: { site: ResolvedSite; href: string; children: ReactNode }) {
  return <main className={`${templateClassName(site.templateKey)} ${styles.page}`} style={{ '--primary': site.primaryColor, '--secondary': site.secondaryColor, '--accent': site.accentColor } as React.CSSProperties}>
    {site.preview && <div className="preview-banner">Preview site — not yet connected to a client domain</div>}
    <SiteHeader site={site} currentHref={href} />{children}<SiteFooter site={site} />
  </main>
}
