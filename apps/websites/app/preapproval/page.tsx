import { ResourceShell, resourceSite } from '@/components/resource-shell'
import { PreapprovalForm } from '@/components/preapproval-form'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const site = await resourceSite()
  return { title: `Start your preapproval | ${site.name}`, description: 'Request help with a home-loan preapproval assessment before your next move.', alternates: { canonical: '/preapproval' } }
}
export default async function PreapprovalPage() {
  const site = await resourceSite()
  return <ResourceShell site={site} href="/preapproval"><PreapprovalForm agencyName={site.name} submissionEnabled={process.env.WEBSITES_PREAPPROVAL_ENABLED === 'true'} privacyPolicyUrl={site.privacyPolicyUrl} /></ResourceShell>
}
