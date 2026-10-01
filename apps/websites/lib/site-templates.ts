import styles from '@/app/agency.module.css'
import kingdomStyles from '@/app/kingdom.module.css'
import type { ResolvedSite, WebsiteTemplateKey } from '@/lib/types'

export const HOME_SEEKERS_TEMPLATE_KEY: WebsiteTemplateKey = 'home-seekers-v1'
export const KINGDOM_TEMPLATE_KEY: WebsiteTemplateKey = 'kingdom-v1'
export const STANDARD_TEMPLATE_KEY: WebsiteTemplateKey = 'property-standard-v1'

export function usesEditorialTemplate(templateKey: WebsiteTemplateKey) {
  return templateKey === HOME_SEEKERS_TEMPLATE_KEY || templateKey === KINGDOM_TEMPLATE_KEY
}

/** A site capability, never an agency-name check. */
export function hasEditorialPropertyExperience(site: Pick<ResolvedSite, 'experienceKey'>) {
  return site.experienceKey === 'editorial-property-v1'
}

export function templateClassName(templateKey: WebsiteTemplateKey) {
  if (templateKey === KINGDOM_TEMPLATE_KEY) return `template-kingdom ${kingdomStyles.shell}`
  if (templateKey === HOME_SEEKERS_TEMPLATE_KEY) return `template-home-seekers ${styles.shell}`
  return 'template-property-standard'
}

export function templateNavigation(templateKey: WebsiteTemplateKey) {
  if (usesEditorialTemplate(templateKey)) {
    return [
      { href: '/properties?type=sale', label: 'Buy' },
      { href: '/valuation', label: 'Sell' },
      { href: '/properties?type=rental', label: 'Rent' },
      { href: '/about', label: 'Our people' },
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ]
  }
  return [
    { href: '/properties', label: 'Properties' },
    { href: '/about', label: 'About' },
    { href: '/valuation', label: 'Valuation' },
    { href: '/contact', label: 'Contact' },
  ]
}
