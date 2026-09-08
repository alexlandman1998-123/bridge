import { FinanceCalculators } from '@/components/finance-calculators'
import { ResourceShell, resourceSite } from '@/components/resource-shell'
import styles from '@/components/resources.module.css'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const site = await resourceSite()
  return { title: `Property calculators | ${site.name}`, description: 'Explore monthly bond repayments, a home budget and a deposit savings plan.', alternates: { canonical: '/calculators' } }
}
export default async function CalculatorsPage() {
  const site = await resourceSite()
  return <ResourceShell site={site} href="/calculators"><header className={styles.intro}><p className={styles.eyebrow}>MAKE ROOM FOR YOUR NEXT MOVE</p><h1>A clearer picture.<br />Before you commit.</h1><p>Explore the numbers, adjust the possibilities, and plan with more confidence.</p></header><div className={styles.container}><FinanceCalculators /></div></ResourceShell>
}
