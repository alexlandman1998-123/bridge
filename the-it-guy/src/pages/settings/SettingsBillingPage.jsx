import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings, getSubscription, listBillingInvoices } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'

function formatCurrency(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function SettingsBillingPage() {
  const { role } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const canView = canManageOrganisationSettings({
    appRole: role,
    membershipRole: normalizeOrganisationMembershipRole(membershipRole),
  })
  const [subscription, setSubscription] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const context = await fetchOrganisationSettings()
        if (active) {
          setMembershipRole(context?.membershipRole || 'viewer')
        }
        if (!canManageOrganisationSettings({ appRole: role, membershipRole: context?.membershipRole })) {
          if (active) {
            setLoading(false)
          }
          return
        }
        const [subscriptionResponse, invoicesResponse] = await Promise.all([getSubscription(), listBillingInvoices()])
        if (active) {
          setSubscription(subscriptionResponse)
          setInvoices(invoicesResponse)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [role])

  if (!canView) {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker="Billing"
          title="Subscription and invoice history"
          description="Principal-level administrators and billing owners can access this section."
        />
        <SettingsBanner tone="warning">Billing is restricted to Principal-level administrators in the current role model.</SettingsBanner>
      </div>
    )
  }

  if (loading || !subscription) {
    return <SettingsLoadingState label="Loading billing settings…" />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Billing"
        title="Subscription and invoices"
        description="Review plan details, usage, renewal timing, and historic invoices."
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}

      <SettingsSectionCard title="Plan" description="Current commercial subscription for this organisation.">
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Plan</dt>
            <dd className="text-base font-semibold text-[#162334]">{subscription.planName}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Billing</dt>
            <dd className="text-base font-semibold capitalize text-[#162334]">{subscription.billingType}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Amount</dt>
            <dd className="text-base font-semibold text-[#162334]">{formatCurrency(subscription.monthlyAmount)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Renewal</dt>
            <dd className="text-sm font-medium text-[#51657b]">
              {subscription.renewalDate ? new Date(subscription.renewalDate).toLocaleDateString() : 'Not set'}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Included developments</dt>
            <dd className="text-sm font-medium text-[#51657b]">{subscription.includedDevelopments}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Included users</dt>
            <dd className="text-sm font-medium text-[#51657b]">{subscription.includedUsers}</dd>
          </div>
        </dl>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Usage"
        description="Current portfolio usage against your active subscription."
        actions={
          <Button type="button" variant="secondary">
            Contact Support
          </Button>
        }
      >
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Active developments</dt>
            <dd className="text-base font-semibold text-[#162334]">{subscription.activeDevelopments}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Active users</dt>
            <dd className="text-base font-semibold text-[#162334]">{subscription.activeUsers}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Status</dt>
            <dd className="text-sm font-medium capitalize text-[#51657b]">{subscription.status}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Payment method</dt>
            <dd className="text-sm font-medium text-[#51657b]">
              {subscription.paymentMethodLast4 ? `•••• ${subscription.paymentMethodLast4}` : 'Not configured'}
            </dd>
          </div>
        </dl>
      </SettingsSectionCard>

      <SettingsSectionCard title="Billing history" description="Historic invoice list for the current organisation subscription.">
        {!invoices.length ? (
          <SettingsEmptyState
            title="No billing invoices available yet"
            description="Invoices will appear here once billing records are added."
          />
        ) : (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] md:grid">
              <span>Invoice</span>
              <span>Issued</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Paid</span>
            </div>
            <div className="divide-y divide-[#e9eff5]">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr] md:items-center md:gap-4">
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Invoice</span>
                    <strong className="text-sm text-[#162334]">{invoice.invoiceNumber}</strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Issued</span>
                    <span className="text-sm text-[#51657b]">{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Status</span>
                    <span className="inline-flex rounded-full border border-[#d7e3ef] bg-white px-3 py-1 text-xs font-semibold capitalize text-[#51657b]">
                      {invoice.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Amount</span>
                    <span className="text-sm font-semibold text-[#162334]">{formatCurrency(invoice.amount)}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Paid</span>
                    <span className="text-sm text-[#51657b]">{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsSectionCard>
    </div>
  )
}
